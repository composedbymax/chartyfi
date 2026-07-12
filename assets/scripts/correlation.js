import { storage } from './storage.js';
import { toast } from './message.js';
import { attachSpinner } from './spinner.js';
const SPARK_POINTS = 30;
const DAY = 86400;
const CALENDAR_BUFFER = 1.6;
export class Correlation {
  static config = {
    title: 'Correlation Matrix',
    description: 'Compute a correlation matrix across your watchlist symbols',
    width: '100vw',
    suspendIndicators: false,
    persistent: false,
  };
  constructor(chart, api) {
    this.chart = chart;
    this.api = api;
    this.el = document.createElement('div');
    this.el.className = 'corr-wrap';
    this._bars = 200;
    this._loading = false;
    this._series = null;
    this._matrix = null;
    if (storage.getWatchlist().length >= 2) this._run(this._bars);
    else this._render();
  }
  async _run(bars) {
    const list = storage.getWatchlist();
    if (list.length < 2) { toast('Add at least 2 symbols to the Watchlist', 'warn'); return; }
    this._bars = bars;
    this._loading = true;
    this._render();
    const anchor = Math.floor(Date.now() / 1000);
    const fetchBars = Math.ceil((bars + SPARK_POINTS - 1) * CALENDAR_BUFFER);
    const series = await Promise.all(list.map(async e => {
      const res = await this.api._chartData(e.sym, '1d', { bars: fetchBars, direction: 'before', anchor });
      if (res.error) toast(`${e.sym} 1D: ${res.error}`, 'error');
      const map = new Map();
      (res.candles || []).forEach(c => map.set(Math.floor(c.time / DAY), c.close));
      return { sym: e.sym, map };
    }));
    this._series = series;
    this._matrix = series.map(a => series.map(b => this._rollingCorrelate(a, b, this._bars)));
    this._loading = false;
    this._render();
  }
  _rollingCorrelate(a, b, win) {
    const times = [...a.map.keys()].filter(t => b.map.has(t)).sort((x, y) => x - y);
    const n = times.length;
    if (n < win) return [];
    const xs = times.map(t => a.map.get(t));
    const ys = times.map(t => b.map.get(t));
    let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < win; i++) { sx += xs[i]; sy += ys[i]; sxy += xs[i] * ys[i]; sxx += xs[i] * xs[i]; syy += ys[i] * ys[i]; }
    const calc = () => {
      const num = win * sxy - sx * sy;
      const den = Math.sqrt(win * sxx - sx * sx) * Math.sqrt(win * syy - sy * sy);
      return den ? num / den : null;
    };
    const out = [calc()];
    for (let end = win; end < n; end++) {
      const outI = end - win;
      sx += xs[end] - xs[outI]; sy += ys[end] - ys[outI];
      sxy += xs[end] * ys[end] - xs[outI] * ys[outI];
      sxx += xs[end] * xs[end] - xs[outI] * xs[outI];
      syy += ys[end] * ys[end] - ys[outI] * ys[outI];
      out.push(calc());
    }
    return out;
  }
  _lastValue(values) {
    for (let i = values.length - 1; i >= 0; i--) { if (values[i] != null) return values[i]; }
    return null;
  }
  _cellClass(v) {
    if (v == null) return 'corr-na';
    if (v >= 0.7) return 'corr-strong-pos';
    if (v >= 0.3) return 'corr-pos';
    if (v > -0.3) return 'corr-neutral';
    if (v > -0.7) return 'corr-neg';
    return 'corr-strong-neg';
  }
  _sparkSVG(values) {
    const w = 100, h = 32, pad = 3;
    let last = 0;
    const norm = values.map(v => { if (v != null) last = v; return last; });
    const step = norm.length > 1 ? w / (norm.length - 1) : 0;
    const pts = norm.map((v, i) => `${(i * step).toFixed(1)},${(h / 2 - v * (h / 2 - pad)).toFixed(1)}`).join(' ');
    return `<svg class="spark-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" class="spark-zero"></line><polyline points="${pts}" class="spark-line"></polyline></svg>`;
  }
  _buildTable() {
    const wrap = document.createElement('div');
    wrap.className = 'corr-table-wrap';
    const table = document.createElement('table');
    table.className = 'corr-table';
    const head = document.createElement('tr');
    head.appendChild(document.createElement('th'));
    this._series.forEach(s => {
      const th = document.createElement('th');
      th.textContent = s.sym;
      th.title = `${s.sym} · Daily`;
      head.appendChild(th);
    });
    table.appendChild(head);
    this._series.forEach((row, i) => {
      const tr = document.createElement('tr');
      const rh = document.createElement('th');
      rh.textContent = row.sym;
      rh.title = `${row.sym} · Daily`;
      tr.appendChild(rh);
      this._matrix[i].forEach(values => {
        const td = document.createElement('td');
        const last = this._lastValue(values);
        td.className = `corr-cell ${values.length ? this._cellClass(last) : 'corr-na'}`;
        if (values.length) td.innerHTML = `<div class="corr-cell-inner">${this._sparkSVG(values)}<span class="corr-val">${last == null ? 'n/a' : last.toFixed(2)}</span></div>`;
        else td.textContent = '—';
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
    wrap.appendChild(table);
    return wrap;
  }
  _render() {
    const list = storage.getWatchlist();
    this.el.innerHTML = '';
    const top = document.createElement('div');
    top.className = 'corr-top';
    top.innerHTML = `
      <div class="ctrl-row">
        <label for="corr-bars">Bars</label>
        <input type="number" id="corr-bars" value="${this._bars}" min="10" max="2000">
      </div>
      <button class="btn-primary corr-run-btn" id="corr-run">${this._loading ? 'Computing…' : 'Re-compute'}</button>
    `;
    this.el.appendChild(top);
    const barsIn = top.querySelector('#corr-bars');
    const runBtn = top.querySelector('#corr-run');
    barsIn.disabled = this._loading;
    runBtn.disabled = this._loading || list.length < 2;
    runBtn.onclick = () => this._run(+barsIn.value || 200);
    const d = document.createElement('div');
    d.className = 'sb-divider';
    this.el.appendChild(d);
    if (list.length < 2) {
      const empty = document.createElement('div');
      empty.className = 'corr-empty';
      empty.textContent = 'Add at least 2 symbols to the Watchlist to compute correlations.';
      this.el.appendChild(empty);
      return;
    }
    if (this._loading) {
      const load = document.createElement('div');
      load.className = 'corr-loading';
      this.el.appendChild(load);
      attachSpinner(load, { size: 40, color: 'var(--accent)' }).show();
      return;
    }
    this.el.appendChild(this._buildTable());
  }
}