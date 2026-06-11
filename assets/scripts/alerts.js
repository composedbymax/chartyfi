import {toast,deny} from './message.js';
const STORAGE_KEY = 'alerts_v1';
export class Alerts {
  static config = {
    title: 'Alerts',
    description: 'Create browser notifications for current symbol / timeframe price and indicator levels.',
  };
  constructor(chart, api) {
    this.chart = chart;
    this.api = api;
    this.el = document.createElement('div');
    this._destroyed = false;
    this._onUpdate = () => {
      if (this._destroyed) return;
      this._render();
      this._check();
    };
    this._onLoad = () => {
      if (this._destroyed) return;
      this._render();
      this._check();
    };
    this.chart._chartOn('load', this._onLoad);
    this.chart._chartOn('dataset-loaded', this._onLoad);
    this.chart._chartOn('dataChanged', this._onUpdate);
    this.chart._chartOn('barsChanged', this._onUpdate);
    document.addEventListener('symbol-changed', this._onUpdate);
    this._render();
    this._check();
  }
  destroy() {
    this._destroyed = true;
    document.removeEventListener('symbol-changed', this._onUpdate);
  }
  _getRules() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }
  _setRules(rules) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  }
  _uid() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  }
  _baseCols() {
    const includeVol = this.chart.volMode === 'overlay' || this.chart.volMode === 'pane';
    if (this.chart.mode === 'line') {
      return includeVol ? ['time', this.chart.field, 'volume'] : ['time', this.chart.field];
    }
    return includeVol ? ['time', 'open', 'high', 'low', 'close', 'volume'] : ['time', 'open', 'high', 'low', 'close'];
  }
  _uniqueColumn(name, used) {
    let col = name;
    let i = 2;
    while (used.has(col)) col = `${name}:${i++}`;
    used.add(col);
    return col;
  }
  _layout() {
    const cols = this._baseCols();
    const used = new Set(cols);
    const series = this._indicatorSeries().map(s => {
      if (s.type === 'band') {
        const upperCol = this._uniqueColumn(`indicator:${s.label}:upper`, used);
        const lowerCol = this._uniqueColumn(`indicator:${s.label}:lower`, used);
        return {...s, upperCol, lowerCol};
      }
      if (s.type === 'candle') {
        const openCol = this._uniqueColumn(`indicator:${s.label}:open`, used);
        const highCol = this._uniqueColumn(`indicator:${s.label}:high`, used);
        const lowCol = this._uniqueColumn(`indicator:${s.label}:low`, used);
        const closeCol = this._uniqueColumn(`indicator:${s.label}:close`, used);
        return {...s, openCol, highCol, lowCol, closeCol};
      }
      const col = this._uniqueColumn(`indicator:${s.label}`, used);
      return {...s, col};
    });
    return {
      cols: cols.concat(series.flatMap(s => {
        if (s.type === 'band') return [s.upperCol, s.lowerCol];
        if (s.type === 'candle') return [s.openCol, s.highCol, s.lowCol, s.closeCol];
        return [s.col];
      })),
      series
    };
  }
  _indicatorSeries() {
    return typeof this.chart._getIndicators === 'function' ? this.chart._getIndicators() : [];
  }
  _mergeRows(series) {
    const rows = this.chart._getCurrentData().map(r => ({...r}));
    if (!rows.length || !series.length) return rows;
    const byTime = new Map(rows.map(r => [r.time, r]));
    series.forEach(s => {
      if (s.type === 'band') {
        (s.upper || []).forEach(p => {
          const r = byTime.get(p.time);
          if (r) r[s.upperCol] = p.value ?? null;
        });
        (s.lower || []).forEach(p => {
          const r = byTime.get(p.time);
          if (r) r[s.lowerCol] = p.value ?? null;
        });
      } else if (s.type === 'candle') {
        (s.data || []).forEach(p => {
          const r = byTime.get(p.time);
          if (r) {
            r[s.openCol] = p.open ?? null;
            r[s.highCol] = p.high ?? null;
            r[s.lowCol] = p.low ?? null;
            r[s.closeCol] = p.close ?? null;
          }
        });
      } else {
        (s.data || []).forEach(p => {
          const r = byTime.get(p.time);
          if (r) r[s.col] = s.type === 'label' ? (p.text ?? p.value ?? null) : (p.value ?? null);
        });
      }
    });
    rows.forEach(r => {
      series.forEach(s => {
        if (s.type === 'band') {
          if (!(s.upperCol in r)) r[s.upperCol] = null;
          if (!(s.lowerCol in r)) r[s.lowerCol] = null;
        } else if (s.type === 'candle') {
          if (!(s.openCol in r)) r[s.openCol] = null;
          if (!(s.highCol in r)) r[s.highCol] = null;
          if (!(s.lowCol in r)) r[s.lowCol] = null;
          if (!(s.closeCol in r)) r[s.closeCol] = null;
        } else if (!(s.col in r)) {
          r[s.col] = null;
        }
      });
    });
    return rows;
  }
  _sourceOptions(layout) {
    const rows = this._mergeRows(layout.series);
    return layout.cols.filter(c => c !== 'time' && rows.some(r => Number.isFinite(Number(r[c])))).map(c => ({key: c, label: c}));
  }
  _currentLabel() {
    const sym = this.chart._currentSymbol || 'No symbol';
    const int = this.chart._currentInterval || '';
    return `${sym}${int ? ` ${int}` : ''}`;
  }
  _opLabel(op) {
    return {
      'cross-above': 'crosses above',
      'cross-below': 'crosses below',
      'above': 'above',
      'below': 'below'
    }[op] || op;
  }
  _match(op, prev, curr, level) {
    if (op === 'cross-above') return prev < level && curr >= level;
    if (op === 'cross-below') return prev > level && curr <= level;
    if (op === 'above') return prev <= level && curr > level;
    if (op === 'below') return prev >= level && curr < level;
    return false;
  }
  _notify(title, body) {if ('Notification' in window && Notification.permission === 'granted') {try {new Notification(title, {body}); return;} catch (e) {}}toast(body, 'info', 2500);}
  async _enableNotifications() {
    if (!('Notification' in window)) {deny('Notifications are not supported in this browser.'); return false;}
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') {deny('Notifications are blocked in browser settings.'); return false;}
    try {
      const p = await Notification.requestPermission();
      if (p !== 'granted') {deny('Notifications were not enabled.'); return false;}
        toast('Notifications enabled', 'success'); return true;}
          catch (e) {deny('Notifications could not be enabled.'); return false;}
  }
  _check() {
    const sym = this.chart._currentSymbol;
    const int = this.chart._currentInterval;
    if (!sym || !int) return;
    const rules = this._getRules();
    const active = rules.filter(r => r.sym === sym && r.int === int && r.enabled !== false);
    if (!active.length) return;
    const layout = this._layout();
    const rows = this._mergeRows(layout.series);
    if (rows.length < 2) return;
    const prevRow = rows[rows.length - 2];
    const currRow = rows[rows.length - 1];
    let changed = false;
    active.forEach(rule => {
      if (rule.lastTime === currRow.time) return;
      const prev = Number(prevRow[rule.source]);
      const curr = Number(currRow[rule.source]);
      const level = Number(rule.value);
      if (!Number.isFinite(prev) || !Number.isFinite(curr) || !Number.isFinite(level)) return;
      if (this._match(rule.op, prev, curr, level)) {
        rule.lastTime = currRow.time;
        changed = true;
        const title = `${sym} ${int}`;
        const body = `${rule.label || rule.source} ${this._opLabel(rule.op)} ${level} → ${curr}`;
        this._notify(title, body);
      }
    });
    if (changed) this._setRules(rules);
  }
  _render() {
    const sym = this.chart._currentSymbol;
    const int = this.chart._currentInterval;
    const layout = this._layout();
    const rows = this._mergeRows(layout.series);
    const sources = this._sourceOptions(layout);
    const rules = this._getRules().filter(r => r.sym === sym && r.int === int);
    const showPermBtn = 'Notification' in window && Notification.permission !== 'granted';
    this.el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'alerts-wrap';
    const top = document.createElement('div');
    top.className = 'alerts-top';
    top.innerHTML = `
      <div>
        <div class="sb-menu-title">Alerts</div>
        <div class="alerts-meta">${this._currentLabel()}</div>
      </div>
      <div class="alerts-top-actions">
        ${showPermBtn ? `<button class="btn-sm" id="alerts-perm-btn">Enable Notifications</button>` : ''}
      </div>`;
    wrap.appendChild(top);
    const form = document.createElement('div');
    form.className = 'alerts-panel';
    form.innerHTML = `
      <div class="alerts-section">
        <div class="alerts-section-title">Create alert</div>
        <div class="alerts-form">
          <div class="alerts-field">
            <label for="alert-source">Source</label>
            <select id="alert-source">
              ${sources.map(s => `<option value="${s.key}">${s.label}</option>`).join('')}
            </select>
          </div>
          <div class="alerts-field">
            <label for="alert-op">Condition</label>
            <select id="alert-op">
              <option value="cross-above">Crosses above</option>
              <option value="cross-below">Crosses below</option>
              <option value="above">Moves above</option>
              <option value="below">Moves below</option>
            </select>
          </div>
          <div class="alerts-field alerts-wide">
            <label for="alert-value">Value</label>
            <input type="number" id="alert-value" step="any" placeholder="Trigger value">
          </div>
          <div class="alerts-field alerts-wide">
            <label for="alert-label">Label</label>
            <input type="text" id="alert-label" placeholder="Optional name">
          </div>
          <div class="alerts-actions alerts-wide">
            <button class="btn-primary" id="alert-save" ${!sym || !int || !sources.length ? 'disabled' : ''}>Save alert</button>
          </div>
        </div>
      </div>`;
    wrap.appendChild(form);
    const table = document.createElement('div');
    table.className = 'alerts-section';
    const previewRows = rows.slice(-150).reverse();
    table.innerHTML = `
      <div class="alerts-section-title">Current table</div>
      <div class="alerts-meta">${previewRows.length ? `${previewRows.length} rows` : 'No data'}</div>
      <div class="alerts-table-wrap">
        <table class="alerts-table">
          <thead><tr>${layout.cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
          <tbody>
            ${previewRows.map(r => `<tr>${layout.cols.map(c => `<td>${r[c] ?? ''}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    wrap.appendChild(table);
    const list = document.createElement('div');
    list.className = 'alerts-section';
    list.innerHTML = `
      <div class="alerts-section-title">Active alerts</div>
      <div class="alerts-meta">${rules.length ? `${rules.length} saved for ${this._currentLabel()}` : 'No alerts saved for this chart'}</div>
      <div class="alerts-list">
        ${rules.length ? rules.map(rule => `
          <div class="alerts-item">
            <div class="alerts-item-top">
              <div>
                <div class="alerts-item-title">${rule.label || rule.source}</div>
                <div class="alerts-item-sub">${rule.source} ${this._opLabel(rule.op)} ${rule.value}</div>
              </div>
              <div class="alerts-actions">
                <button class="btn-sm" data-toggle="${rule.id}">${rule.enabled === false ? 'Enable' : 'Disable'}</button>
                <button class="btn-sm danger" data-remove="${rule.id}">Remove</button>
              </div>
            </div>
          </div>`).join('') : `<div class="alerts-empty">No alerts yet.</div>`}
      </div>`;
    wrap.appendChild(list);
    this.el.appendChild(wrap);
    const permBtn = this.el.querySelector('#alerts-perm-btn');
    if (permBtn) {permBtn.onclick = () => this._enableNotifications();}
    const saveBtn = this.el.querySelector('#alert-save');
    if (saveBtn) {
      saveBtn.onclick = async () => {
        const source = this.el.querySelector('#alert-source')?.value || '';
        const op = this.el.querySelector('#alert-op')?.value || 'cross-above';
        const value = this.el.querySelector('#alert-value')?.value;
        const label = this.el.querySelector('#alert-label')?.value.trim() || '';
        if (!sym || !int) {deny('Load a symbol and timeframe first.'); return;}
        if (!sources.length) {deny('No numeric sources available on this chart.'); return;}
        if (!source) {deny('Select a source.'); return;}
        if (value === '' || !Number.isFinite(Number(value))) {deny('Enter a trigger value.'); return;}
        if (!await this._enableNotifications()) return;
        const rules = this._getRules();
        rules.push({id: this._uid(),sym,int,source,op,value: Number(value),label,enabled: true,lastTime: 0});
        this._setRules(rules);
        toast('Alert saved', 'success');
        this._render();
      };
    }
    this.el.querySelectorAll('[data-toggle]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-toggle');
        const rules = this._getRules();
        const rule = rules.find(r => r.id === id);
        if (!rule) return;
        rule.enabled = rule.enabled === false ? true : false;
        this._setRules(rules);
        this._render();
      };
    });
    this.el.querySelectorAll('[data-remove]').forEach(btn => {
      btn.onclick = () => {
        const id = btn.getAttribute('data-remove');
        this._setRules(this._getRules().filter(r => r.id !== id));
        this._render();
      };
    });
  }
}