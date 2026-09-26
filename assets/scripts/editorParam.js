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
function skipWsAndComments(s, i) {
  const n = s.length;
  while (i < n) {
    if (/\s/.test(s[i])) { i++; continue; }
    if (s[i] === '/' && s[i + 1] === '/') {
      while (i < n && s[i] !== '\n') i++;
      continue;
    }
    if (s[i] === '/' && s[i + 1] === '*') {
      i += 2;
      while (i < n && !(s[i] === '*' && s[i + 1] === '/')) i++;
      i += 2;
      continue;
    }
    break;
  }
  return i;
}
function splitParamsBody(inner) {
  const n = inner.length;
  const entries = [];
  let i = skipWsAndComments(inner, 0);
  const preamble = inner.slice(0, i);
  while (i < n) {
    const keyM = /^(\w+)\s*:\s*/.exec(inner.slice(i));
    if (!keyM) break;
    const key = keyM[1];
    const vStart = i + keyM[0].length;
    let j = vStart, depth = 0, inStr = false, strChar = '';
    for (; j < n; j++) {
      const c = inner[j];
      if (inStr) {
        if (c === '\\') { j++; continue; }
        if (c === strChar) inStr = false;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { inStr = true; strChar = c; continue; }
      if (c === '{' || c === '[' || c === '(') depth++;
      else if (c === '}' || c === ']' || c === ')') {
        if (depth === 0) break;
        depth--;
      } else if (c === ',' && depth === 0) break;
    }
    entries.push({key, rawValue: inner.slice(vStart, j).trim()});
    i = j;
    if (inner[i] === ',') i++;
    i = skipWsAndComments(inner, i);
  }
  return {preamble, entries};
}
function parseRangeSpec(rawValue) {
  const m = /^\{([^}]*)\}$/.exec(rawValue);
  if (!m) return null;
  const b = m[1];
  const minM = b.match(/min\s*:\s*([-\d.]+)/);
  const maxM = b.match(/max\s*:\s*([-\d.]+)/);
  const stepM = b.match(/step\s*:\s*([-\d.]+)/);
  if (!minM || !maxM || !stepM) return null;
  return {min: parseFloat(minM[1]), max: parseFloat(maxM[1]), step: parseFloat(stepM[1])};
}
function parseArraySpec(rawValue) {
  const m = /^\[([^\]]*)\]$/.exec(rawValue.trim());
  if (!m) return null;
  const body = m[1].trim();
  if (!body) return {values: []};
  const parts = body.split(',').map(s => s.trim()).filter(s => s.length);
  const values = [];
  for (const p of parts) {
    if (!/^-?\d+(\.\d+)?$/.test(p)) return null;
    values.push(parseFloat(p));
  }
  return {values};
}
function parseBacktest(code) {
  const span = findBacktestSpan(code);
  if (!span) return null;
  const obj = code.slice(span.start, span.end + 1);
  const paramsM = obj.match(/params\s*:\s*\{(?:[^{}]|\{[^{}]*\})*\}/);
  const params = {};
  let paramsPreamble = '';
  let paramsOrder = [];
  if (paramsM) {
    const inner = paramsM[0].replace(/^params\s*:\s*\{/, '').replace(/\}$/, '');
    const {preamble, entries} = splitParamsBody(inner);
    paramsPreamble = preamble;
    for (const {key, rawValue} of entries) {
      paramsOrder.push(key);
      const range = parseRangeSpec(rawValue);
      if (range) {
        params[key] = {editable: true, ...range};
        continue;
      }
      const arr = parseArraySpec(rawValue);
      if (arr) {
        params[key] = {editable: false, isArray: true, values: arr.values, raw: rawValue};
        continue;
      }
      params[key] = {editable: false, raw: rawValue};
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
  return {params, paramsPreamble, paramsOrder, fees, workers, span};
}
function buildParamsStr(params, paramsPreamble, paramsOrder) {
  const keys = paramsOrder && paramsOrder.length ? paramsOrder : Object.keys(params);
  const lines = keys.map(k => {
    const v = params[k];
    if (!v) return null;
    if (v.editable) return `    ${k}:{min:${v.min},max:${v.max},step:${v.step}}`;
    if (v.isArray) return `    ${k}:[${v.values.join(',')}]`;
    return `    ${k}:${v.raw}`;
  }).filter(Boolean);
  const pre = paramsPreamble && paramsPreamble.trim() ? paramsPreamble.replace(/\n?\s*$/, '\n') : '\n';
  return `params:{${pre}${lines.join(',\n')}\n  }`;
}
function buildFeesStr(fees) {
  let s = `fees:{\n    type:'${fees.type}',\n    value:${fees.value}`;
  if (fees.min !== undefined) s += `,\n    min:${fees.min}`;
  if (fees.max !== undefined) s += `,\n    max:${fees.max}`;
  return s + '\n  }';
}
function applyChanges(code, parsed, newParams, newFees, newWorkers) {
  const {span, paramsPreamble, paramsOrder} = parsed;
  let obj = code.slice(span.start, span.end + 1);
  obj = obj.replace(/params\s*:\s*\{(?:[^{}]|\{[^{}]*\})*\}/, buildParamsStr(newParams, paramsPreamble, paramsOrder));
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
function updateOptsObjStr(objStr, opts) {
  let s = objStr;
  for (const [key, val] of Object.entries(opts)) {
    if (typeof val === 'string') {
      const rx = new RegExp(`(\\b${key}\\s*:\\s*)(['"][^'"]*['"])`);
      if (rx.test(s)) {
        s = s.replace(rx, `$1'${val}'`);
      } else {
        s = s.replace(/\}$/, `, ${key}:'${val}'}`);
      }
    } else {
      const rx = new RegExp(`(\\b${key}\\s*:\\s*)(\\w+(?:\\.\\w+)?)`);
      if (rx.test(s)) {
        s = s.replace(rx, `$1${val}`);
      } else {
        s = s.replace(/\}$/, `, ${key}:${val}}`);
      }
    }
  }
  return s;
}
function applyPlotOptsToCode(code, plotDefs) {
  if (!plotDefs?.length) return code;
  const rx = /\b(plot(?:Hist|Band|Dot|Area|Candle|Label)?)\s*\(/g;
  const positions = [];
  let m;
  while ((m = rx.exec(code)) !== null) positions.push(m.index);
  let result = code;
  for (let i = Math.min(positions.length, plotDefs.length) - 1; i >= 0; i--) {
    const def = plotDefs[i];
    if (!def) continue;
    const allOpts = {...(def.opts || {})};
    if (def.visible === false) allOpts.visible = false;
    if (!Object.keys(allOpts).length) continue;
    const pos = positions[i];
    const pi = result.indexOf('(', pos);
    if (pi === -1) continue;
    let depth = 0, end = -1;
    for (let j = pi; j < result.length; j++) {
      if (result[j] === '(') depth++;
      else if (result[j] === ')') { depth--; if (depth === 0) { end = j; break; } }
    }
    if (end === -1) continue;
    const argsStr = result.slice(pi + 1, end);
    let lastObjStart = -1, lastObjEnd = -1, d = 0, inStr = false, strChar = '';
    for (let j = 0; j < argsStr.length; j++) {
      const c = argsStr[j];
      if (inStr) {
        if (c === strChar && (j === 0 || argsStr[j - 1] !== '\\')) inStr = false;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') { inStr = true; strChar = c; continue; }
      if (c === '{') { if (d === 0) lastObjStart = j; d++; }
      else if (c === '}') { d--; if (d === 0) lastObjEnd = j; }
    }
    if (lastObjStart === -1) {
      const newOptsStr = '{' + Object.entries(allOpts)
        .map(([k, v]) => `${k}:${typeof v === 'string' ? `'${v}'` : v}`)
        .join(', ') + '}';
      result = result.slice(0, end) + ', ' + newOptsStr + result.slice(end);
    } else {
      const optsStr = argsStr.slice(lastObjStart, lastObjEnd + 1);
      const newOptsStr = updateOptsObjStr(optsStr, allOpts);
      const absStart = pi + 1 + lastObjStart;
      const absEnd   = pi + 1 + lastObjEnd;
      result = result.slice(0, absStart) + newOptsStr + result.slice(absEnd + 1);
    }
  }

  return result;
}
export function hasBacktestParams(code) {
  const r = parseBacktest(code);
  return !!(r && Object.keys(r.params).length);
}
const LINE_STYLES = [[0,'Solid'],[1,'Dotted'],[2,'Dashed'],[3,'Lg.Dash'],[4,'Sparse']];
const HAS_COLOR = new Set(['line','area','dot','band']);
const HAS_DUAL_COLOR = new Set(['hist','candle']);
const HAS_WIDTH = new Set(['line','area','dot','hist','band','candle']);
const HAS_STYLE = new Set(['line','area']);
function buildPlotRow(def, idx, onChange) {
  const row = document.createElement('div');
  row.className = 'flex-center gap-6 p-4-0 border-t';
  const opts = def.opts || {};
  const vis = document.createElement('input');
  vis.type = 'checkbox';
  vis.className = 'flex-shrink-0';
  vis.checked = def.visible !== false;
  vis.id = `ep-plot-${idx}-visible`;
  vis.name = `ep_plot_${idx}_visible`;
  vis.onchange = () => onChange({visible: vis.checked});
  const nameWrap = document.createElement('div');
  nameWrap.className = 'flex items-center gap-5 flex-1 min-w-0';
  const lbl = document.createElement('span');
  lbl.className = 'text-12 text-secondary text-ellipsis';
  lbl.textContent = def.label || `(${def.type})`;
  lbl.title = def.label || '';
  const typeBadge = document.createElement('span');
  typeBadge.className = 'badge-dim rounded flex-shrink-0 p-0-4';
  typeBadge.textContent = def.type;
  nameWrap.append(lbl, typeBadge);
  const controls = document.createElement('div');
  controls.className = 'flex items-center gap-4 flex-shrink-0';
  if (HAS_COLOR.has(def.type) || def.type === 'label') {
    const c = document.createElement('input');
    c.type = 'color';
    c.className = 'color-swatch-input';
    c.value = opts.color || '#ffffff';
    c.id = `ep-plot-${idx}-color`;
    c.name = `ep_plot_${idx}_color`;
    c.oninput = () => onChange({color: c.value});
    controls.appendChild(c);
  } else if (HAS_DUAL_COLOR.has(def.type)) {
    for (const key of ['upColor', 'downColor']) {
      const c = document.createElement('input');
      c.type = 'color';
      c.className = 'color-swatch-input';
      c.value = opts[key] || (key === 'upColor' ? '#22c55e' : '#ef4444');
      c.dataset.colorKey = key;
      c.id = `ep-plot-${idx}-${key}`;
      c.name = `ep_plot_${idx}_${key}`;
      c.oninput = () => {
        const up = controls.querySelector('[data-color-key=upColor]').value;
        const dn = controls.querySelector('[data-color-key=downColor]').value;
        onChange({upColor: up, downColor: dn});
      };
      controls.appendChild(c);
    }
  }
  if (HAS_WIDTH.has(def.type)) {
    const w = document.createElement('input');
    w.type = 'number';
    w.className = 'field p-0-6 h-28 w-42';
    w.min = 1;
    w.max = 10;
    w.value = opts.lineWidth ?? 1;
    w.id = `ep-plot-${idx}-line-width`;
    w.name = `ep_plot_${idx}_line_width`;
    w.oninput = () => onChange({lineWidth: Math.max(1, parseInt(w.value) || 1)});
    controls.appendChild(w);
  }
  if (HAS_STYLE.has(def.type)) {
    const s = document.createElement('select');
    s.className = 'h-28 text-11 w-72';
    s.id = `ep-plot-${idx}-line-style`;
    s.name = `ep_plot_${idx}_line_style`;
    for (const [val, name] of LINE_STYLES) {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = name;
      if ((opts.lineStyle ?? 0) === val) o.selected = true;
      s.appendChild(o);
    }
    s.onchange = () => onChange({lineStyle: parseInt(s.value)});
    controls.appendChild(s);
  }
  if (opts.pane !== undefined) {
    const p = document.createElement('span');
    p.className = 'badge-dim rounded p-0-4';
    p.textContent = `P${opts.pane}`;
    controls.appendChild(p);
  }
  row.append(vis, nameWrap, controls);
  return row;
}
export function createParamBtn(code, plotDefs, onSave, onPlotChange, onCodeChange) {
  const btn = document.createElement('button');
  btn.className = 'icon-btn hov-brighten';
  btn.name = 'backtest_params_btn';
  btn.appendChild(paramsIcon({width: 14, height: 14}));
  tooltip(btn, 'Settings');
  btn.onclick = e => { e.stopPropagation(); openParamModal(code, plotDefs, onSave, onPlotChange, onCodeChange); };
  return btn;
}
function openParamModal(code, plotDefs, onSave, onPlotChange, onCodeChange) {
  const parsed = parseBacktest(code);
  const hasBt = !!(parsed && Object.keys(parsed.params).length);
  const overlay = document.createElement('div');
  overlay.dataset.sidebarPersist = '';
  overlay.className = 'modal-overlay shadow';
  const panel = document.createElement('div');
  panel.className = 'modal-panel';
  const head = document.createElement('div');
  head.className = 'flex items-center justify-between p-10-12 border-b flex-shrink-0';
  const title = document.createElement('span');
  title.className = 'text-13 fw-700 text-primary';
  title.textContent = 'Indicator Settings';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'icon-btn';
  closeBtn.name = 'close_backtest_params';
  closeBtn.innerHTML = '&times;';
  closeBtn.onclick = () => {
    if (plotsChanged && plotDefs) {
      plotDefs.forEach((def, idx) => {
        const orig = originalPlotDefs[idx];
        def.visible = orig.visible;
        Object.keys(def.opts).forEach(k => delete def.opts[k]);
        Object.assign(def.opts, orig.opts);
        const hasOpts = Object.keys(orig.opts).length > 0;
        onPlotChange(idx, hasOpts ? orig.opts : null, orig.visible);
      });
    }
    overlay.remove();
  };
  head.append(title, closeBtn);
  const body = document.createElement('div');
  body.className = 'flex flex-col overflow-y-auto flex-1';
  let plotsChanged = false;
  const originalPlotDefs = plotDefs
  ? plotDefs.map(d => ({ visible: d.visible, opts: { ...(d.opts || {}) } }))
  : [];
  if (plotDefs && plotDefs.length) {
    const plotsSec = document.createElement('div');
    plotsSec.className = 'p-10-12 border-b';
    const plotsLbl = document.createElement('div');
    plotsLbl.className = 'text-11 fw-700 text-muted uppercase tracking-wider mb-8';
    plotsLbl.textContent = 'Plots';
    plotsSec.appendChild(plotsLbl);
    plotDefs.forEach((def, idx) => {
      const row = buildPlotRow(def, idx, changes => {
        plotsChanged = true;
        const {visible, ...opts} = changes;
        const hasOpts = Object.keys(opts).length > 0;
        onPlotChange(idx, hasOpts ? opts : null, visible);
        if (visible !== undefined) def.visible = visible;
        if (hasOpts) Object.assign(def.opts, opts);
      });
      plotsSec.appendChild(row);
    });
    body.appendChild(plotsSec);
  }
  let getNewParams = null;
  let getNewFees = () => null;
  let workersInp = null;
  if (hasBt) {
    const {params, fees, workers} = parsed;
    const paramsSec = document.createElement('div');
    paramsSec.className = 'p-10-12 border-b';
    const paramsLbl = document.createElement('div');
    paramsLbl.className = 'text-11 fw-700 text-muted uppercase tracking-wider mb-8';
    paramsLbl.textContent = 'Params';
    paramsSec.appendChild(paramsLbl);
    const arrayInputs = {};
    const arrayEntries = Object.entries(params).filter(([, val]) => val.isArray);
    if (arrayEntries.length) {
      const arraysWrap = document.createElement('div');
      arraysWrap.className = 'flex flex-col gap-8 mb-8';
      for (const [name, val] of arrayEntries) {
        const field = document.createElement('label');
        field.className = 'flex flex-col gap-4';
        const lbl = document.createElement('span');
        lbl.className = 'text-12 text-secondary mono text-ellipsis';
        lbl.textContent = name;
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'field p-4-6 h-28 w-full mono';
        inp.value = val.values.join(', ');
        inp.id = `bt-${name}-array`;
        inp.name = `bt_${name}_array`;
        inp.placeholder = 'comma-separated values';
        arrayInputs[name] = inp;
        field.append(lbl, inp);
        arraysWrap.appendChild(field);
      }
      paramsSec.appendChild(arraysWrap);
    }
    const table = document.createElement('div');
    table.className = 'flex flex-col gap-4';
    const hdr = document.createElement('div');
    hdr.className = 'form-grid-4 form-grid-4-hdr';
    hdr.innerHTML = '<span></span><span>Min</span><span>Max</span><span>Step</span>';
    table.appendChild(hdr);
    const paramInputs = {};
    for (const [name, val] of Object.entries(params)) {
      if (!val.editable) continue;
      const row = document.createElement('div');
      row.className = 'form-grid-4';
      const nameLbl = document.createElement('span');
      nameLbl.className = 'text-12 text-secondary mono text-ellipsis';
      nameLbl.textContent = name;
      row.appendChild(nameLbl);
      const inputs = {};
      for (const field of ['min', 'max', 'step']) {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.className = 'field p-4-6 h-28 w-full';
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
    getNewParams = () => {
      const r = {};
      for (const [name, val] of Object.entries(params)) {
        if (val.isArray) {
          const raw = arrayInputs[name].value;
          const values = raw.split(',').map(s => s.trim()).filter(s => s.length).map(s => parseFloat(s)).filter(n => !isNaN(n));
          r[name] = {editable: false, isArray: true, values, raw: val.raw};
          continue;
        }
        if (!val.editable) { r[name] = val; continue; }
        const inputs = paramInputs[name];
        r[name] = {
          editable: true,
          min: parseFloat(inputs.min.value),
          max: parseFloat(inputs.max.value),
          step: parseFloat(inputs.step.value),
        };
      }
      return r;
    };
    if (fees) {
      const feesSec = document.createElement('div');
      feesSec.className = 'p-10-12 border-b';
      const feesLbl = document.createElement('div');
      feesLbl.className = 'text-11 fw-700 text-muted uppercase tracking-wider mb-8';
      feesLbl.textContent = 'Fees';
      feesSec.appendChild(feesLbl);
      const feesGrid = document.createElement('div');
      feesGrid.className = 'flex flex-col gap-8';
      const typeField = document.createElement('label');
      typeField.className = 'form-field-row';
      const typeSpan = document.createElement('span');
      typeSpan.textContent = 'Type';
      const typeSelect = document.createElement('select');
      typeSelect.id = 'bt-fees-type';
      typeSelect.name = 'bt_fees_type';
      const isNoFees = fees.type === 'fixed' && fees.value === 0;
      for (const [t, tlbl] of [['none','No Fees'],['fixed','Fixed'],['percent','Percent']]) {
        const o = document.createElement('option');
        o.value = t;
        o.textContent = tlbl;
        if (isNoFees ? t === 'none' : fees.type === t) o.selected = true;
        typeSelect.appendChild(o);
      }
      typeField.append(typeSpan, typeSelect);
      feesGrid.appendChild(typeField);
      const feesInputs = {};
      const feesRows = {};
      for (const [key, lbl, ph] of [['value','Value ($)','0.1'],['min','Min ($)','optional'],['max','Max ($)','optional']]) {
        const wrap = document.createElement('label');
        wrap.className = 'form-field-row';
        const s = document.createElement('span');
        s.textContent = lbl;
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.className = 'field p-4-6 h-28';
        inp.step = 'any';
        inp.placeholder = ph;
        inp.id = `bt-fees-${key}`;
        inp.name = `bt_fees_${key}`;
        if (fees[key] !== undefined) inp.value = fees[key];
        feesInputs[key] = inp;
        feesRows[key] = wrap;
        wrap.append(s, inp);
        feesGrid.appendChild(wrap);
      }
      feesSec.appendChild(feesGrid);
      body.appendChild(feesSec);
      const updateFeesUI = () => {
        const t = typeSelect.value;
        feesRows.value.style.display = t === 'none' ? 'none' : '';
        feesRows.min.style.display = t === 'percent' ? '' : 'none';
        feesRows.max.style.display = t === 'percent' ? '' : 'none';
        feesRows.value.querySelector('span').textContent = t === 'percent' ? 'Value (%)' : 'Value ($)';
      };
      typeSelect.onchange = updateFeesUI;
      updateFeesUI();
      getNewFees = () => {
        const t = typeSelect.value;
        if (t === 'none') return {type: 'fixed', value: 0};
        const f = {type: t, value: parseFloat(feesInputs.value.value) || 0};
        if (t === 'percent') {
          if (feesInputs.min.value !== '') f.min = parseFloat(feesInputs.min.value);
          if (feesInputs.max.value !== '') f.max = parseFloat(feesInputs.max.value);
        }
        return f;
      };
    }
    const workersSec = document.createElement('div');
    workersSec.className = 'p-10-12';
    const workersField = document.createElement('label');
    workersField.className = 'form-field-row';
    const workersSpan = document.createElement('span');
    workersSpan.textContent = 'Workers (1–8)';
    workersInp = document.createElement('input');
    workersInp.type = 'number';
    workersInp.className = 'field p-4-6 h-28';
    workersInp.min = 1;
    workersInp.max = 8;
    workersInp.value = workers;
    workersInp.id = 'bt-workers';
    workersInp.name = 'bt_workers';
    workersField.append(workersSpan, workersInp);
    workersSec.appendChild(workersField);
    body.appendChild(workersSec);
  }
  const foot = document.createElement('div');
  foot.className = 'flex justify-end gap-8 p-10-12 border-t flex-shrink-0';
  if (hasBt) {
    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn-primary';
    saveBtn.name = 'save_backtest_params';
    saveBtn.textContent = 'Save & Update';
    saveBtn.onclick = () => {
      const newWorkers = Math.min(8, Math.max(1, parseInt(workersInp.value) || 4));
      overlay.remove();
      let newCode = applyChanges(code, parsed, getNewParams(), getNewFees(), newWorkers);
      newCode = applyPlotOptsToCode(newCode, plotDefs);
      onSave(newCode);
    };
    foot.appendChild(saveBtn);
  }
  const doneBtn = document.createElement('button');
  doneBtn.className = hasBt ? 'btn-sm' : 'btn-primary';
  doneBtn.textContent = 'Done';
  doneBtn.onclick = () => {
    if (plotsChanged) {
      const newCode = applyPlotOptsToCode(code, plotDefs);
      if (onCodeChange) {
        onCodeChange(newCode);
      } else if (onSave) {
        onSave(newCode);
      }
    }
    overlay.remove();
  };
  foot.appendChild(doneBtn);
  panel.append(head, body, foot);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
}