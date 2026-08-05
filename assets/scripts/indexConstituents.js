const INDICES = [
  { key: 'nasdaq100', label: 'NASDAQ 100' },
  { key: 'sp500', label: 'S&P 500' },
  { key: 'dowjones', label: 'Dow Jones' },
  { key: 'dax', label: 'DAX' },
  { key: 'hsi', label: 'HSI' },
  { key: 'ftse100', label: 'FTSE 100' },
  { key: 'ftsemib', label: 'FTSE MIB' },
];
export class IndexConstituents {
  static config = {
    title:       'Index Constituents',
    description: 'View index members and load any symbol onto the chart',
  };
  constructor(chart, api) {
    this.chart      = chart;
    this.api        = api;
    this.el         = document.createElement('div');
    this._destroyed = false;
    this._active    = null;
    this._symbols   = null;
    this._date      = null;
    this._filter    = '';
    this._loading   = false;
    this._error     = null;
    this._rowsEl    = null;
    this._onLoad = () => {
      if (this._destroyed) return;
      this._render();
    };
    this.chart._chartOn('load', this._onLoad);
    this.chart._chartOn('dataset-loaded', this._onLoad);
    this._render();
  }
  async _select(key) {
    this._active  = key;
    this._symbols = null;
    this._date    = null;
    this._filter  = '';
    this._error   = null;
    this._loading = true;
    this._render();
    try {
      const res = await fetch(window.INC.api, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ index: key }),
      });
      if (!res.ok) throw new Error(`Request failed: ${res.status}`);
      const data = await res.json();
      if (this._destroyed || this._active !== key) return;
      this._symbols = data.symbols;
      this._date    = data.date;
    } catch (e) {
      if (this._destroyed || this._active !== key) return;
      this._error = 'Failed to load constituents';
    } finally {
      if (!this._destroyed && this._active === key) this._loading = false;
      this._render();
    }
  }
  _back() {
    this._active  = null;
    this._symbols = null;
    this._date    = null;
    this._filter  = '';
    this._error   = null;
    this._render();
  }
  _load(sym, name) {
    this.chart.load(sym, this.chart._currentInterval, name);
    this._render();
  }
  _render() {
    this.el.innerHTML = '';
    if (this._active === null) { this._renderIndexList(); return; }
    this._renderSymbolList();
  }
  _renderIndexList() {
    const list = document.createElement('div');
    list.className = 'inc-list';
    INDICES.forEach(({ key, label }) => {
      const btn = document.createElement('button');
      btn.className = 'inc-index-btn';
      btn.textContent = label;
      btn.onclick = () => this._select(key);
      list.appendChild(btn);
    });
    this.el.appendChild(list);
  }
  _renderSymbolList() {
    const top = document.createElement('div');
    top.className = 'inc-top';
    const title = document.createElement('span');
    title.className = 'inc-title';
    title.textContent = INDICES.find(i => i.key === this._active)?.label ?? this._active;
    const backBtn = document.createElement('button');
    backBtn.className = 'inc-back-btn';
    backBtn.textContent = '←';
    backBtn.onclick = () => this._back();
    top.appendChild(title);
    top.appendChild(backBtn);
    this.el.appendChild(top);
    if (this._loading) {
      const status = document.createElement('div');
      status.className = 'inc-status';
      status.textContent = 'Loading…';
      this.el.appendChild(status);
      return;
    }
    if (this._error) {
      const status = document.createElement('div');
      status.className = 'inc-status inc-status--error';
      status.textContent = this._error;
      this.el.appendChild(status);
      return;
    }
    const filterInput = document.createElement('input');
    filterInput.className = 'inc-filter';
    filterInput.type = 'text';
    filterInput.placeholder = 'Filter symbols…';
    filterInput.value = this._filter;
    filterInput.oninput = e => { this._filter = e.target.value; this._renderRows(); };
    this.el.appendChild(filterInput);
    this._rowsEl = document.createElement('div');
    this._rowsEl.className = 'inc-rows';
    this.el.appendChild(this._rowsEl);
    this._renderRows();
  }
  _renderRows() {
    this._rowsEl.innerHTML = '';
    const curSym = this.chart._currentSymbol;
    const q = this._filter.trim().toLowerCase();
    const rows = this._symbols.filter(({ Symbol, Name }) => !q || Symbol.toLowerCase().includes(q) || Name.toLowerCase().includes(q));
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'inc-empty';
      empty.textContent = 'No matches.';
      this._rowsEl.appendChild(empty);
      return;
    }
    rows.forEach(({ Symbol, Name }) => {
      const row = document.createElement('button');
      row.className = 'inc-row' + (Symbol === curSym ? ' inc-row--active' : '');
      row.innerHTML = `<span class="inc-sym">${Symbol}</span><span class="inc-name">${Name}</span>`;
      row.onclick = () => this._load(Symbol, Name);
      this._rowsEl.appendChild(row);
    });
  }
  destroy() {
    this._destroyed = true;
  }
}