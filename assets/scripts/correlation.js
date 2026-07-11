import { storage } from './storage.js';
import { toast } from './message.js';
export class Correlation {
  static config = {
    title: 'Correlation Matrix',
    description: 'Compute a correlation matrix across your watchlist symbols.',
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
    this._render();
  }
  async _run(bars) {
    const list = storage.getWatchlist();
    if (list.length < 2) { toast('Add at least 2 symbols to the Watchlist', 'warn'); return; }
    this._bars = bars;
    this._loading = true;
    this._render();
    const anchor = Math.floor(Date.now() / 1000);
    const series = await Promise.all(list.map(async e => {
      const res = await this.api._chartData(e.sym, e.int, { bars, direction: 'before', anchor });
      if (res.error) toast(`${e.sym} ${e.int}: ${res.error}`, 'error');
      const map = new Map();
      (res.candles || []).forEach(c => map.set(c.time, c.close));
      return { sym: e.sym, int: e.int, map };
    }));
    this._series = series;
    this._matrix = series.map(a => series.map(b => a === b ? 1 : this._correlate(a, b)));
    this._loading = false;
    this._render();
  }
  _correlate(a, b) {
    const xs = [], ys = [];
    for (const [t, v] of a.map) {
      if (b.map.has(t)) { xs.push(v); ys.push(b.map.get(t)); }
    }
    const n = xs.length;
    if (n < 2) return null;
    const mx = xs.reduce((s, v) => s + v, 0) / n;
    const my = ys.reduce((s, v) => s + v, 0) / n;
    let num = 0, dx = 0, dy = 0;
    for (let i = 0; i < n; i++) {
      const a1 = xs[i] - mx, b1 = ys[i] - my;
      num += a1 * b1; dx += a1 * a1; dy += b1 * b1;
    }
    const den = Math.sqrt(dx * dy);
    return den ? num / den : null;
  }
  _cellClass(v) {
    if (v == null) return 'corr-na';
    if (v >= 0.7) return 'corr-strong-pos';
    if (v >= 0.3) return 'corr-pos';
    if (v > -0.3) return 'corr-neutral';
    if (v > -0.7) return 'corr-neg';
    return 'corr-strong-neg';
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
      th.title = `${s.sym} ${s.int}`;
      head.appendChild(th);
    });
    table.appendChild(head);
    this._series.forEach((row, i) => {
      const tr = document.createElement('tr');
      const rh = document.createElement('th');
      rh.textContent = row.sym;
      rh.title = `${row.sym} ${row.int}`;
      tr.appendChild(rh);
      this._matrix[i].forEach(v => {
        const td = document.createElement('td');
        td.className = `corr-cell ${this._cellClass(v)}`;
        td.textContent = v == null ? '—' : v.toFixed(2);
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
      <button class="btn-primary corr-run-btn" id="corr-run">${this._loading ? 'Computing…' : 'Compute'}</button>
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
      load.className = 'corr-empty';
      load.textContent = 'Computing correlation matrix…';
      this.el.appendChild(load);
      return;
    }
    if (!this._matrix) {
      const hint = document.createElement('div');
      hint.className = 'corr-empty';
      hint.textContent = 'Press Compute to build the correlation matrix.';
      this.el.appendChild(hint);
      return;
    }
    this.el.appendChild(this._buildTable());
  }
}