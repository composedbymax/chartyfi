import { storage } from './storage.js';
export class Watchlist {
  static config = {
    title:       'Watchlist',
    description: 'Save and quickly load symbol / timeframe pairs.',
  };
  constructor(chart, api) {
    this.chart      = chart;
    this.api        = api;
    this.el         = document.createElement('div');
    this._destroyed = false;
    this._onLoad = () => {
      if (this._destroyed) return;
      this._render();
    };
    this.chart._chartOn('load', this._onLoad);
    this.chart._chartOn('dataset-loaded', this._onLoad);
    this._render();
  }
  _add() {
    const sym = this.chart._currentSymbol;
    const int = this.chart._currentInterval;
    if (!sym) return;
    const list = storage.getWatchlist();
    if (list.some(e => e.sym === sym && e.int === int)) return;
    list.push({ sym, int, name: this.chart._currentName || sym });
    storage.setWatchlist(list);
    this._render();
  }
  _remove(sym, int) {
    storage.setWatchlist(storage.getWatchlist().filter(e => !(e.sym === sym && e.int === int)));
    this._render();
  }
  _render() {
    const list         = storage.getWatchlist();
    const curSym       = this.chart._currentSymbol;
    const curInt       = this.chart._currentInterval;
    const alreadySaved = curSym && list.some(e => e.sym === curSym && e.int === curInt);
    const canAdd       = !!curSym && !alreadySaved;
    const displayName = this.chart._currentName || curSym || '';
    this.el.innerHTML = '';
    const top = document.createElement('div');
    top.className = 'wl-top';
    const addBtn     = document.createElement('button');
    addBtn.className = 'wl-add-btn';
    addBtn.disabled  = !canAdd;
    if (!curSym)           addBtn.textContent = '+ Add Current';
    else if (alreadySaved) addBtn.textContent = `✓ ${displayName}  ${curInt}  saved`;
    else                   addBtn.textContent = `+ Add  ${displayName}  ${curInt}`;
    addBtn.onclick = () => this._add();
    top.appendChild(addBtn);
    this.el.appendChild(top);
    const hr = document.createElement('div');
    hr.className = 'wl-divider';
    this.el.appendChild(hr);
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'wl-empty';
      empty.textContent = 'No entries yet. Load a chart and press + Add.';
      this.el.appendChild(empty);
      return;
    }
    const ul = document.createElement('div');
    ul.className = 'wl-list';
    list.forEach(({ sym, int, name }) => {
      const active  = sym === curSym && int === curInt;
      const row     = document.createElement('div');
      row.className = 'wl-row' + (active ? ' wl-row--active' : '');
      const loadBtn     = document.createElement('button');
      loadBtn.className = 'wl-load';
      loadBtn.innerHTML = `
        <div class="wl-load-top">
          <span class="wl-sym">${sym}</span>
          <span class="wl-int">${int}</span>
        </div>
        ${name && name !== sym ? `<div class="wl-name">${name}</div>` : ''}
      `;
      loadBtn.onclick = () => { this.chart.load(sym, int, name); this._render(); };
      const rmBtn       = document.createElement('button');
      rmBtn.className   = 'wl-rm';
      rmBtn.textContent = '✕';
      rmBtn.onclick     = () => this._remove(sym, int);
      row.appendChild(loadBtn);
      row.appendChild(rmBtn);
      ul.appendChild(row);
    });
    this.el.appendChild(ul);
  }
  destroy() {
    this._destroyed = true;
  }
}