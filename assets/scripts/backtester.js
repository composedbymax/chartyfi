const BATCH_SIZE = 200;
const BAR_STRIDE = 6;
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
  return Object.values(params).reduce(
    (acc, spec) => acc * expandParam(spec).length,
    1,
  );
}
export function calcFee(price, fees) {
  if (!fees) return 0;
  if (fees.type === 'fixed') return fees.value;
  let fee = price * (fees.value / 100);
  if (fees.min != null) fee = Math.max(fee, fees.min);
  if (fees.max != null) fee = Math.min(fee, fees.max);
  return fee;
}
function normaliseFees(fees) {
  if (fees == null) return null;
  if (typeof fees !== 'object') throw new Error('backtester: fees must be an object');
  const { type, value, min, max } = fees;
  if (type !== 'percent' && type !== 'fixed') throw new Error('backtester: fees.type must be "percent" or "fixed"');
  if (typeof value !== 'number' || value < 0) throw new Error('backtester: fees.value must be a non-negative number');
  if (min != null && (typeof min !== 'number' || min < 0)) throw new Error('backtester: fees.min must be a non-negative number');
  if (max != null && (typeof max !== 'number' || max < 0)) throw new Error('backtester: fees.max must be a non-negative number');
  if (min != null && max != null && min > max) throw new Error('backtester: fees.min must not exceed fees.max');
  return { type, value, min: min ?? null, max: max ?? null };
}
function serializeBars(bars) {
  const buf = new Float64Array(bars.length * BAR_STRIDE);
  for (let i = 0; i < bars.length; i++) {
    const b   = bars[i];
    const off = i * BAR_STRIDE;
    buf[off + 0] = b.time   ?? 0;
    buf[off + 1] = b.open   ?? 0;
    buf[off + 2] = b.high   ?? 0;
    buf[off + 3] = b.low    ?? 0;
    buf[off + 4] = b.close  ?? 0;
    buf[off + 5] = b.volume ?? 0;
  }
  return buf;
}
const WORKER_SRC = `
'use strict';
const BAR_STRIDE = 6;
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
    const vals   = expanded[i];
    cfg[keys[i]] = vals[rem % vals.length];
    rem          = Math.floor(rem / vals.length);
  }
  return cfg;
}
function deserializeBars(buf, count) {
  const bars = new Array(count);
  for (let i = 0; i < count; i++) {
    const off  = i * BAR_STRIDE;
    bars[i] = {
      time:   buf[off + 0],
      open:   buf[off + 1],
      high:   buf[off + 2],
      low:    buf[off + 3],
      close:  buf[off + 4],
      volume: buf[off + 5],
    };
  }
  return bars;
}
function calcFee(price, feeCfg) {
  if (!feeCfg) return 0;
  if (feeCfg.type === 'fixed') return feeCfg.value;
  let fee = price * (feeCfg.value / 100);
  if (feeCfg.min !== null) fee = Math.max(fee, feeCfg.min);
  if (feeCfg.max !== null) fee = Math.min(fee, feeCfg.max);
  return fee;
}
let bars        = null;
let startEquity = 0;
let lastClose   = 0;
let keys        = null;
let expanded    = null;
let stratFn     = null;
let feeCfg      = null;
let bestCfg        = null;
let bestScore      = -Infinity;
let bestTradeCount = 0;
let totalProcessed = 0;
self.onmessage = function (evt) {
  const msg = evt.data;
  if (msg.type === 'init') {
    const { barsBuf, barCount, params, strategyCode, fees } = msg;
    bars        = deserializeBars(new Float64Array(barsBuf), barCount);
    startEquity = bars.length ? bars[0].close : 0;
    lastClose   = bars.length ? bars[bars.length - 1].close : 0;
    keys     = Object.keys(params);
    expanded = keys.map(k => expandParam(params[k]));
    feeCfg   = fees ?? null;
    const wrappedCode = 'const cfg = __cfg;\\n' + strategyCode;
    try {
      stratFn = new Function('bars', '__cfg', 'buy', 'sell', wrappedCode);
    } catch (e) {
      self.postMessage({ type: 'error', message: 'Strategy compile error: ' + e.message });
      return;
    }
    self.postMessage({ type: 'request', done: 0 });
    return;
  }
  if (msg.type === 'batch') {
    const { start, end } = msg;
    for (let i = start; i < end; i++) {
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
      let entryPrice = 0;
      let inTrade    = false;
      let tradeCount = 0;
      let bi = 0, si = 0;
      while (bi < buys.length || si < sells.length) {
        if (!inTrade && bi < buys.length) {
          entryPrice = buys[bi++];
          equity    -= calcFee(entryPrice, feeCfg);
          inTrade    = true;
        } else if (inTrade && si < sells.length) {
          const exitPrice = sells[si++];
          equity    += exitPrice - entryPrice;
          equity    -= calcFee(exitPrice, feeCfg);
          inTrade    = false;
          tradeCount++;
        } else {
          break;
        }
      }
      if (inTrade) {
        equity += lastClose - entryPrice;
        equity -= calcFee(lastClose, feeCfg);
      }
      const pnl   = equity - startEquity;
      const score = tradeCount >= 2 ? pnl : pnl * 0.1;
      if (score > bestScore) {
        bestScore      = score;
        bestCfg        = __cfg;
        bestTradeCount = tradeCount;
      }
    }
    totalProcessed += end - start;
    self.postMessage({ type: 'request', done: totalProcessed });
    return;
  }
  if (msg.type === 'finish') {
    self.postMessage({
      type: 'done',
      best: bestCfg
        ? { cfg: bestCfg, score: bestScore, tradeCount: bestTradeCount }
        : null,
    });
    return;
  }
};
`;
export function runBacktest({ bars, params, strategy, fees, workers = 4, onProgress, signal }) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    if (!bars?.length) { reject(new Error('backtester: bars array is empty')); return; }
    if (typeof strategy !== 'string' || !strategy.trim()) { reject(new Error('backtester: strategy must be a non-empty code string')); return; }
    let normFees;
    try { normFees = normaliseFees(fees); }
    catch (e) { reject(e); return; }
    const total = countCombinations(params);
    if (total < 1) { reject(new Error('backtester: no combinations generated — check params spec')); return; }
    const barsTemplate = serializeBars(bars);
    const barCount     = bars.length;
    const blob         = new Blob([WORKER_SRC], { type: 'application/javascript' });
    const workerUrl    = URL.createObjectURL(blob);
    const numWorkers   = Math.min(Math.max(1, workers), 8, total);
    let cursor           = 0;
    let completedWorkers = 0;
    const workerDone     = new Array(numWorkers).fill(0);
    const workerBests    = [];
    const workerList     = [];
    function cleanup() {
      signal?.removeEventListener('abort', onAbort);
      workerList.forEach(w => { try { w.terminate(); } catch (_) {} });
      URL.revokeObjectURL(workerUrl);
    }
    function onAbort() {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    function dispatchNext(worker) {
      if (cursor >= total) { worker.postMessage({ type: 'finish' }); return; }
      const start = cursor;
      const end   = Math.min(cursor + BATCH_SIZE, total);
      cursor      = end;
      worker.postMessage({ type: 'batch', start, end });
    }
    for (let w = 0; w < numWorkers; w++) {
      const worker   = new Worker(workerUrl);
      const workerId = w;
      workerList.push(worker);
      worker.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'request') {
          workerDone[workerId] = msg.done;
          if (onProgress) {
            const totalDone = workerDone.reduce((a, b) => a + b, 0);
            onProgress(Math.min(99, (totalDone / total) * 100), totalDone, total);
          }
          dispatchNext(worker);
          return;
        }
        if (msg.type === 'done') {
          if (msg.best) workerBests.push(msg.best);
          completedWorkers++;
          if (completedWorkers === workerList.length) {
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
              fees:              normFees,
            });
          }
          return;
        }
        if (msg.type === 'error') { cleanup(); reject(new Error(msg.message)); }
      };
      worker.onerror = (e) => { cleanup(); reject(new Error('Worker error: ' + (e.message || 'unknown'))); };
      const barsBufCopy = barsTemplate.buffer.slice(0);
      worker.postMessage(
        { type: 'init', barsBuf: barsBufCopy, barCount, params, strategyCode: strategy, fees: normFees },
        [barsBufCopy],
      );
    }
  });
}