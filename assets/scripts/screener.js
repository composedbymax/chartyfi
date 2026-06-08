import {attachSpinner} from './spinner.js';
export class Screener {
  static config = {
    title: 'Screener',
    description: 'Day gainers, losers & most actives',
  };
  constructor(chart, api) {
    this.chart = chart;
    this.el = document.createElement('div');
    this._tab = 'gainers';
    this._data = null;
    this._shown = { gainers: 20, losers: 20, actives: 20 };
    this._spinner = null;
    this._build();
    this._load();
  }
  _midnight() {
    const n = new Date();
    return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate() + 1);
  }
  _getCache() {
    try {
      const r = localStorage.getItem('scr_v1');
      if (!r) return null;
      const { exp, data } = JSON.parse(r);
      if (Date.now() >= exp) { localStorage.removeItem('scr_v1'); return null; }
      return data;
    } catch { return null; }
  }
  _setCache(data) {
    try { localStorage.setItem('scr_v1', JSON.stringify({ exp: this._midnight(), data })); } catch {}
  }
  _build() {
    this.el.innerHTML = `<div class="scr-tabs"><button class="scr-tab active" data-tab="gainers">Gainers</button><button class="scr-tab" data-tab="losers">Losers</button><button class="scr-tab" data-tab="actives">Actives</button></div><div class="scr-body"></div>`;
    this._body = this.el.querySelector('.scr-body');
    this.el.querySelectorAll('.scr-tab').forEach(btn => {
      btn.onclick = () => {
        this._tab = btn.dataset.tab;
        this.el.querySelectorAll('.scr-tab').forEach(b => b.classList.toggle('active', b === btn));
        this._renderList();
      };
    });
  }
  async _load() {
    const cached = this._getCache();
    if (cached) { this._data = cached; this._renderList(); return; }
    this._body.innerHTML = '';
    this._spinner = attachSpinner(this._body, { size: 40, color: "var(--accent)" });
    this._spinner.show();
    try {
      const res = await fetch(window.YFS.api);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      this._data = json;
      this._setCache(json);
      this._renderList();
    } catch (e) {
      this._body.innerHTML = `<div class="scr-err">${e.message}</div>`;
    } finally {
      if (this._spinner) { this._spinner.destroy(); this._spinner = null; }
    }
  }
  _renderList() {
    if (!this._data) return;
    const quotes = this._data[this._tab] || [];
    const shown = this._shown[this._tab];
    const frag = document.createDocumentFragment();
    const list = document.createElement('div');
    list.className = 'scr-list';
    quotes.slice(0, shown).forEach(q => list.appendChild(this._row(q)));
    frag.appendChild(list);
    if (shown < quotes.length) {
      const rem = quotes.length - shown;
      const btn = document.createElement('button');
      btn.className = 'scr-more';
      btn.textContent = `Load more (${rem} remaining)`;
      btn.onclick = () => { this._shown[this._tab] = shown + 20; this._renderList(); };
      frag.appendChild(btn);
    }
    this._body.innerHTML = '';
    this._body.appendChild(frag);
  }
  _row(q) {
    const pct = q.regularMarketChangePercent ?? 0;
    const chg = q.regularMarketChange ?? 0;
    const pos = pct >= 0;
    const cc = pos ? 'scr-pos' : 'scr-neg';
    const name = q.shortName || q.displayName || q.longName || q.symbol;
    const el = document.createElement('div');
    el.className = 'scr-row';
    el.innerHTML = `<div class="scr-row-top"><span class="scr-sym">${q.symbol}</span><span class="scr-pct ${cc}">${pos?'+':''}${pct.toFixed(2)}%</span></div><div class="scr-row-bot"><span class="scr-name">${q.shortName||q.displayName||q.longName||''}</span><span class="scr-price">${q.regularMarketPrice!=null?'$'+q.regularMarketPrice.toFixed(2):'--'}</span></div><div class="scr-row-meta"><span class="scr-vol">Vol ${this._fmtVol(q.regularMarketVolume)}</span><span class="scr-chg ${cc}">${pos?'+$':'-$'}${Math.abs(chg).toFixed(2)}</span></div>`;
    el.onclick = () => this.chart.load(q.symbol, '1D', name);
    return el;
  }
  _fmtVol(v) {
    if (v == null) return '--';
    if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
    return String(v);
  }
  destroy() {
    if (this._spinner) { this._spinner.destroy(); this._spinner = null; }
  }
}