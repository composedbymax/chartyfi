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
  row.className = 'ep-plot-row';
  const opts = def.opts || {};
  const vis = document.createElement('input');
  vis.type = 'checkbox';
  vis.className = 'ep-plot-vis';
  vis.checked = def.visible !== false;
  vis.id = `ep-plot-${idx}-visible`;
  vis.name = `ep_plot_${idx}_visible`;
  vis.onchange = () => onChange({visible: vis.checked});
  const nameWrap = document.createElement('div');
  nameWrap.className = 'ep-plot-name-wrap';
  const lbl = document.createElement('span');
  lbl.className = 'ep-plot-lbl';
  lbl.textContent = def.label || `(${def.type})`;
  lbl.title = def.label || '';
  const typeBadge = document.createElement('span');
  typeBadge.className = 'ep-plot-type-badge';
  typeBadge.textContent = def.type;
  nameWrap.append(lbl, typeBadge);
  const controls = document.createElement('div');
  controls.className = 'ep-plot-controls';
  if (HAS_COLOR.has(def.type) || def.type === 'label') {
    const c = document.createElement('input');
    c.type = 'color';
    c.className = 'ep-color-in';
    c.value = opts.color || '#ffffff';
    c.id = `ep-plot-${idx}-color`;
    c.name = `ep_plot_${idx}_color`;
    c.oninput = () => onChange({color: c.value});
    controls.appendChild(c);
  } else if (HAS_DUAL_COLOR.has(def.type)) {
    for (const key of ['upColor', 'downColor']) {
      const c = document.createElement('input');
      c.type = 'color';
      c.className = 'ep-color-in';
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
    w.className = 'ep-input ep-width-in';
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
    s.className = 'ep-select ep-style-sel';
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
    p.className = 'ep-plot-pane-badge';
    p.textContent = `P${opts.pane}`;
    controls.appendChild(p);
  }
  row.append(vis, nameWrap, controls);
  return row;
}
export function createParamBtn(code, plotDefs, onSave, onPlotChange, onCodeChange) {
  const btn = document.createElement('button');
  btn.className = 'icon-btn ed-indicator-params';
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
  overlay.className = 'ep-overlay';
  const panel = document.createElement('div');
  panel.className = 'ep-panel';
  const head = document.createElement('div');
  head.className = 'ep-head';
  const title = document.createElement('span');
  title.className = 'ep-title';
  title.textContent = 'Indicator Settings';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'icon-btn';
  closeBtn.name = 'close_backtest_params';
  closeBtn.innerHTML = '&times;';
  closeBtn.onclick = () => {
    if (plotsChanged && plotDefs) {
      plotDefs.forEach((def, idx) => {
        const orig = originalPlotDefs[idx];
        // Revert in-memory def
        def.visible = orig.visible;
        Object.keys(def.opts).forEach(k => delete def.opts[k]);
        Object.assign(def.opts, orig.opts);
        // Revert the live chart via onPlotChange
        const hasOpts = Object.keys(orig.opts).length > 0;
        onPlotChange(idx, hasOpts ? orig.opts : null, orig.visible);
      });
    }
    overlay.remove();
  };
  head.append(title, closeBtn);
  const body = document.createElement('div');
  body.className = 'ep-body';
  let plotsChanged = false;
  const originalPlotDefs = plotDefs
  ? plotDefs.map(d => ({ visible: d.visible, opts: { ...(d.opts || {}) } }))
  : [];
  if (plotDefs && plotDefs.length) {
    const plotsSec = document.createElement('div');
    plotsSec.className = 'ep-section';
    const plotsLbl = document.createElement('div');
    plotsLbl.className = 'ep-sec-label';
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
      const nameLbl = document.createElement('span');
      nameLbl.className = 'ep-param-name';
      nameLbl.textContent = name;
      row.appendChild(nameLbl);
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
    getNewParams = () => {
      const r = {};
      for (const [name, inputs] of Object.entries(paramInputs)) {
        r[name] = {
          min: parseFloat(inputs.min.value),
          max: parseFloat(inputs.max.value),
          step: parseFloat(inputs.step.value),
        };
      }
      return r;
    };
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
      getNewFees = () => {
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
    workersInp = document.createElement('input');
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
  }
  const foot = document.createElement('div');
  foot.className = 'ep-foot';
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