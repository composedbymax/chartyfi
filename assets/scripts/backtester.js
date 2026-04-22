function expandParam(spec) {
  if (Array.isArray(spec)) return spec;
  if (spec !== null && typeof spec === 'object' && 'min' in spec) {
    const { min, max, step } = spec;
    const vals = [];
    for (let v = min; v <= max + step * 1e-9; v += step) {
      vals.push(Math.round(v * 1e10) / 1e10);
    }
    return vals;
  }
  return [spec];
}
export function countCombinations(params) {
  return Object.values(params).reduce((acc, spec) => acc * expandParam(spec).length, 1);
}
const WORKER_SRC = `
function expandParam(spec) {
  if (Array.isArray(spec)) return spec;
  if (spec !== null && typeof spec === 'object' && 'min' in spec) {
    const { min, max, step } = spec;
    const vals = [];
    for (let v = min; v <= max + step * 1e-9; v += step) {
      vals.push(Math.round(v * 1e10) / 1e10);
    }
    return vals;
  }
  return [spec];
}
function indexToCfg(keys, expanded, index) {
  const cfg = {};
  let rem = index;
  for (let i = keys.length - 1; i >= 0; i--) {
    const vals = expanded[i];
    cfg[keys[i]] = vals[rem % vals.length];
    rem = Math.floor(rem / vals.length);
  }
  return cfg;
}
self.onmessage = function(evt) {
  const { params, bars, strategyCode, chunkStart, chunkEnd, workerId } = evt.data;
  const keys     = Object.keys(params);
  const expanded = keys.map(k => expandParam(params[k]));
  const wrappedCode = 'const cfg = __cfg;\\n' + strategyCode;
  let stratFn;
  try {
    stratFn = new Function('bars', '__cfg', 'buy', 'sell', wrappedCode);
  } catch (e) {
    self.postMessage({ type: 'error', workerId, message: 'Strategy compile error: ' + e.message });
    return;
  }
  const startEquity = bars.length ? bars[0].close : 0;
  const lastClose   = bars.length ? bars[bars.length - 1].close : 0;
  let bestCfg        = null;
  let bestScore      = -Infinity;
  let bestTradeCount = 0;
  const PROGRESS_EVERY = 500;
  const chunkSize      = chunkEnd - chunkStart;
  for (let i = chunkStart; i < chunkEnd; i++) {
    const __cfg = indexToCfg(keys, expanded, i);
    const buys  = [];
    const sells = [];
    const buy   = (_time, price) => buys.push(+price);
    const sell  = (_time, price) => sells.push(+price);
    try {
      stratFn(bars, __cfg, buy, sell);
    } catch (_) {
      continue;
    }
    let equity     = startEquity;
    let entryPrice = null;
    let inTrade    = false;
    let tradeCount = 0;
    let bi = 0, si = 0;
    while (bi < buys.length || si < sells.length) {
      if (!inTrade && bi < buys.length) {
        entryPrice = buys[bi++];
        inTrade    = true;
      } else if (inTrade && si < sells.length) {
        equity    += sells[si++] - entryPrice;
        inTrade    = false;
        tradeCount++;
      } else {
        break;
      }
    }
    if (inTrade) equity += lastClose - entryPrice;
    const pnl   = equity - startEquity;
    const score = tradeCount >= 2 ? pnl : pnl * 0.1;
    if (score > bestScore) {
      bestScore      = score;
      bestCfg        = __cfg;
      bestTradeCount = tradeCount;
    }
    if ((i - chunkStart + 1) % PROGRESS_EVERY === 0) {
      self.postMessage({ type: 'progress', workerId, done: i - chunkStart + 1, total: chunkSize });
    }
  }
  self.postMessage({
    type: 'done',
    workerId,
    best: bestCfg ? { cfg: bestCfg, score: bestScore, tradeCount: bestTradeCount } : null,
  });
};
`;
export function runBacktest({ bars, params, strategy, workers = 4, onProgress }) {
  return new Promise((resolve, reject) => {
    if (!bars?.length) {
      reject(new Error('backtester: bars array is empty'));
      return;
    }
    if (typeof strategy !== 'string' || !strategy.trim()) {
      reject(new Error('backtester: strategy must be a non-empty code string'));
      return;
    }
    const total = countCombinations(params);
    if (total < 1) {
      reject(new Error('backtester: no combinations generated — check params spec'));
      return;
    }
    const blob      = new Blob([WORKER_SRC], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const numWorkers   = Math.min(Math.max(1, workers), 8, total);
    const chunkSize    = Math.ceil(total / numWorkers);
    const workerList   = [];
    const workerBests  = [];
    let completedCount = 0;
    const workerDone = new Array(numWorkers).fill(0);
    function cleanup() {
      workerList.forEach(w => { try { w.terminate(); } catch (_) {} });
      URL.revokeObjectURL(workerUrl);
    }
    for (let w = 0; w < numWorkers; w++) {
      const chunkStart = w * chunkSize;
      const chunkEnd   = Math.min(chunkStart + chunkSize, total);
      if (chunkStart >= total) break;
      const worker   = new Worker(workerUrl);
      const workerId = w;
      workerList.push(worker);
      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'progress') {
          workerDone[msg.workerId] = msg.done;
          if (onProgress) {
            const totalDone = workerDone.reduce((a, b) => a + b, 0);
            onProgress(Math.min(99, (totalDone / total) * 100), totalDone, total);
          }
        } else if (msg.type === 'done') {
          if (msg.best) workerBests.push(msg.best);
          completedCount++;
          if (completedCount === workerList.length) {
            cleanup();
            let best      = null;
            let bestScore = -Infinity;
            for (const b of workerBests) {
              if (b.score > bestScore) { bestScore = b.score; best = b; }
            }
            if (onProgress) onProgress(100, total, total);
            resolve({
              bestParams:        best?.cfg        ?? null,
              bestScore:         best?.score       ?? -Infinity,
              bestTradeCount:    best?.tradeCount  ?? 0,
              totalCombinations: total,
            });
          }
        } else if (msg.type === 'error') {
          cleanup();
          reject(new Error(msg.message));
        }
      };
      worker.onerror = (e) => {
        cleanup();
        reject(new Error('Worker error: ' + (e.message || 'unknown')));
      };
      worker.postMessage({ params, bars, strategyCode: strategy, chunkStart, chunkEnd, workerId });
    }
  });
}