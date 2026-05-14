import {paramsIcon} from './svg.js';
import {tooltip} from './tooltip.js';
function findBacktestSpan(code) {
  const m = code.match(/backtest\s*\(\s*\{/);
  if (!m) return null;
  let depth = 0, i = m.index + m[0].length - 1, end = -1;
  for (; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end === -1) return null;
  return {start: m.index + m[0].length - 1, end};
}
function parseBacktest(code) {
  const span = findBacktestSpan(code);
  if (!span) return null;
  const obj = code.slice(span.start, span.end + 1);
  const paramsM = obj.match(/params\s*:\s*\{(?:[^{}]|\{[^{}]*\})*\}/);
  const params = {};
  if (paramsM) {
    const inner = paramsM[0].replace(/^params\s*:\s*\{/, '').replace(/\}$/, '');
    for (const m of inner.matchAll(/(\w+)\s*:\s*\{([^}]*)\}/g)) {
      const b = m[2];
      params[m[1]] = {
        min: parseFloat(b.match(/min\s*:\s*([-\d.]+)/)?.[1] ?? 'NaN'),
        max: parseFloat(b.match(/max\s*:\s*([-\d.]+)/)?.[1] ?? 'NaN'),
        step: parseFloat(b.match(/step\s*:\s*([-\d.]+)/)?.[1] ?? 'NaN'),
      };
    }
  }
  const feesM = obj.match(/fees\s*:\s*\{[^{}]*\}/);
  let fees = null;
  if (feesM) {
    const b = feesM[0];
    fees = {
      type: b.match(/type\s*:\s*['"](\w+)['"]/)?.[1] || 'percent',
      value: parseFloat(b.match(/value\s*:\s*([\d.]+)/)?.[1] ?? '0'),
    };
    const mn = b.match(/min\s*:\s*([\d.]+)/)?.[1];
    const mx = b.match(/max\s*:\s*([\d.]+)/)?.[1];
    if (mn !== undefined) fees.min = parseFloat(mn);
    if (mx !== undefined) fees.max = parseFloat(mx);
  }
  const workers = parseInt(obj.match(/workers\s*:\s*(\d+)/)?.[1] ?? '4');
  return {params, fees, workers, span};
}
function buildParamsStr(params) {
  const lines = Object.entries(params).map(([k, v]) => `    ${k}:{min:${v.min},max:${v.max},step:${v.step}}`);
  return `params:{\n${lines.join(',\n')}\n  }`;
}
function buildFeesStr(fees) {
  let s = `fees:{\n    type:'${fees.type}',\n    value:${fees.value}`;
  if (fees.min !== undefined) s += `,\n    min:${fees.min}`;
  if (fees.max !== undefined) s += `,\n    max:${fees.max}`;
  return s + '\n  }';
}
function applyChanges(code, parsed, newParams, newFees, newWorkers) {
  const {span} = parsed;
  let obj = code.slice(span.start, span.end + 1);
  obj = obj.replace(/params\s*:\s*\{(?:[^{}]|\{[^{}]*\})*\}/, buildParamsStr(newParams));
  const hasFeesRx = /fees\s*:\s*\{[^{}]*\}/;
  if (newFees) {
    if (hasFeesRx.test(obj)) {
      obj = obj.replace(hasFeesRx, buildFeesStr(newFees));
    } else {
      obj = obj.replace(/(workers\s*:\s*\d+)/, buildFeesStr(newFees) + ',\n  $1');
    }
  } else {
    obj = obj.replace(/,?\s*fees\s*:\s*\{[^{}]*\},?/, '');
  }
  obj = obj.replace(/workers\s*:\s*\d+/, `workers:${newWorkers}`);
  return code.slice(0, span.start) + obj + code.slice(span.end + 1);
}
export function hasBacktestParams(code) {
  const r = parseBacktest(code);
  return !!(r && Object.keys(r.params).length);
}
export function createParamBtn(code, onSave) {
  const btn = document.createElement('button');
  btn.className = 'icon-btn ed-indicator-params';
  btn.name = 'backtest_params_btn';
  btn.appendChild(paramsIcon({width: 14, height: 14}));
  tooltip(btn, 'Backtest parameters');
  btn.onclick = e => { e.stopPropagation(); openParamModal(code, onSave); };
  return btn;
}
function openParamModal(code, onSave) {
  const parsed = parseBacktest(code);
  if (!parsed) return;
  const {params, fees, workers} = parsed;
  const overlay = document.createElement('div');
  overlay.className = 'ep-overlay';
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
  const panel = document.createElement('div');
  panel.className = 'ep-panel';
  const head = document.createElement('div');
  head.className = 'ep-head';
  const title = document.createElement('span');
  title.className = 'ep-title';
  title.textContent = 'Backtest Parameters';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'icon-btn';
  closeBtn.name = 'close_backtest_params';
  closeBtn.innerHTML = '&times;';
  closeBtn.onclick = () => overlay.remove();
  head.append(title, closeBtn);
  const body = document.createElement('div');
  body.className = 'ep-body';
  const paramsSec = document.createElement('div');
  paramsSec.className = 'ep-section';
  const paramsLbl = document.createElement('div');
  paramsLbl.className = 'ep-sec-label';
  paramsLbl.textContent = 'Params';
  paramsSec.appendChild(paramsLbl);
  const table = document.createElement('div');
  table.className = 'ep-table';
  const hdr = document.createElement('div');
  hdr.className = 'ep-row ep-row--hdr';
  hdr.innerHTML = '<span></span><span>Min</span><span>Max</span><span>Step</span>';
  table.appendChild(hdr);
  const paramInputs = {};
  for (const [name, val] of Object.entries(params)) {
    const row = document.createElement('div');
    row.className = 'ep-row';
    const lbl = document.createElement('span');
    lbl.className = 'ep-param-name';
    lbl.textContent = name;
    row.appendChild(lbl);
    const inputs = {};
    for (const field of ['min', 'max', 'step']) {
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'ep-input';
      inp.value = isNaN(val[field]) ? '' : val[field];
      inp.step = 'any';
      inp.id = `bt-${name}-${field}`;
      inp.name = `bt_${name}_${field}`;
      inputs[field] = inp;
      row.appendChild(inp);
    }
    paramInputs[name] = inputs;
    table.appendChild(row);
  }
  paramsSec.appendChild(table);
  body.appendChild(paramsSec);
  let newFeesFn = () => null;
  if (fees) {
    const feesSec = document.createElement('div');
    feesSec.className = 'ep-section';
    const feesLbl = document.createElement('div');
    feesLbl.className = 'ep-sec-label';
    feesLbl.textContent = 'Fees';
    feesSec.appendChild(feesLbl);
    const feesGrid = document.createElement('div');
    feesGrid.className = 'ep-fees-grid';
    const typeField = document.createElement('label');
    typeField.className = 'ep-field';
    const typeSpan = document.createElement('span');
    typeSpan.textContent = 'Type';
    const typeSelect = document.createElement('select');
    typeSelect.className = 'ep-select';
    typeSelect.id = 'bt-fees-type';
    typeSelect.name = 'bt_fees_type';
    for (const t of ['percent', 'fixed']) {
      const o = document.createElement('option');
      o.value = t;
      o.textContent = t;
      if (fees.type === t) o.selected = true;
      typeSelect.appendChild(o);
    }
    typeField.append(typeSpan, typeSelect);
    feesGrid.appendChild(typeField);
    const feesInputs = {};
    for (const [key, lbl, ph] of [['value','Value','0.1'],['min','Min ($)','optional'],['max','Max ($)','optional']]) {
      const wrap = document.createElement('label');
      wrap.className = 'ep-field';
      const s = document.createElement('span');
      s.textContent = lbl;
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.className = 'ep-input';
      inp.step = 'any';
      inp.placeholder = ph;
      inp.id = `bt-fees-${key}`;
      inp.name = `bt_fees_${key}`;
      if (fees[key] !== undefined) inp.value = fees[key];
      feesInputs[key] = inp;
      wrap.append(s, inp);
      feesGrid.appendChild(wrap);
    }
    feesSec.appendChild(feesGrid);
    body.appendChild(feesSec);
    newFeesFn = () => {
      const f = {type: typeSelect.value, value: parseFloat(feesInputs.value.value) || 0};
      if (feesInputs.min.value !== '') f.min = parseFloat(feesInputs.min.value);
      if (feesInputs.max.value !== '') f.max = parseFloat(feesInputs.max.value);
      return f;
    };
  }
  const workersSec = document.createElement('div');
  workersSec.className = 'ep-section';
  const workersField = document.createElement('label');
  workersField.className = 'ep-field';
  const workersSpan = document.createElement('span');
  workersSpan.textContent = 'Workers (1–8)';
  const workersInp = document.createElement('input');
  workersInp.type = 'number';
  workersInp.className = 'ep-input';
  workersInp.min = 1;
  workersInp.max = 8;
  workersInp.value = workers;
  workersInp.id = 'bt-workers';
  workersInp.name = 'bt_workers';
  workersField.append(workersSpan, workersInp);
  workersSec.appendChild(workersField);
  body.appendChild(workersSec);
  const foot = document.createElement('div');
  foot.className = 'ep-foot';
  const saveBtn = document.createElement('button');
  saveBtn.className = 'btn-primary';
  saveBtn.name = 'save_backtest_params';
  saveBtn.textContent = 'Save & Update';
  saveBtn.onclick = () => {
    const newParams = {};
    for (const [name, inputs] of Object.entries(paramInputs)) {
      newParams[name] = {
        min: parseFloat(inputs.min.value),
        max: parseFloat(inputs.max.value),
        step: parseFloat(inputs.step.value),
      };
    }
    const newWorkers = Math.min(8, Math.max(1, parseInt(workersInp.value) || 4));
    overlay.remove();
    onSave(applyChanges(code, parsed, newParams, newFeesFn(), newWorkers));
  };
  foot.appendChild(saveBtn);
  panel.append(head, body, foot);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}