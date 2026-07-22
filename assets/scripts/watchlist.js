import { storage } from './storage.js';
import { isMobile } from './detector.js';
const LONG_PRESS_MS  = isMobile ? 380 : 220;
const MOVE_CANCEL_PX = isMobile ? 12  : 6;
export class Watchlist {
  static config = {
    title:       'Watchlist',
    description: 'Save and quickly load symbol / timeframe pairs',
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
    this._listEl       = null;
    this._drag         = null;
    this._justDragged  = false;
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
    this._listEl = null;
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
    this._listEl = ul;
    list.forEach(({ sym, int, name }, i) => {
      const active  = sym === curSym && int === curInt;
      const row     = document.createElement('div');
      row.className = 'wl-row' + (active ? ' wl-row--active' : '');
      row.dataset.idx = i;
      const loadBtn     = document.createElement('button');
      loadBtn.className = 'wl-load';
      loadBtn.innerHTML = `
        <div class="wl-load-top">
          <span class="wl-sym">${sym}</span>
          <span class="wl-int">${int}</span>
        </div>
        ${name && name !== sym ? `<div class="wl-name">${name}</div>` : ''}
      `;
      loadBtn.onclick = () => {
        if (this._justDragged) { this._justDragged = false; return; }
        this.chart.load(sym, int, name);
        this._render();
      };
      const rmBtn       = document.createElement('button');
      rmBtn.className   = 'wl-rm';
      rmBtn.textContent = '✕';
      rmBtn.onclick     = () => this._remove(sym, int);
      row.appendChild(loadBtn);
      row.appendChild(rmBtn);
      this._wireDrag(row);
      ul.appendChild(row);
    });
    this.el.appendChild(ul);
  }
  _wireDrag(row) {
    row.addEventListener('pointerdown', e => this._onPointerDown(e, row));
  }
  _onPointerDown(e, row) {
    if (e.target.closest('.wl-rm')) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (this._drag) this._teardownSession(this._drag);
    const session = {
      row,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      engaged: false,
      timer: null,
      indicator: null,
      lastInsertPos: null,
    };
    session.moveHandler   = ev => this._onPointerMove(ev, session);
    session.upHandler     = ev => this._onPointerUp(ev, session);
    session.cancelHandler = ev => this._onPointerCancel(ev, session);
    row.addEventListener('pointermove', session.moveHandler, { passive: false });
    row.addEventListener('pointerup', session.upHandler);
    row.addEventListener('pointercancel', session.cancelHandler);
    session.timer = setTimeout(() => this._engageDrag(session), LONG_PRESS_MS);
    this._drag = session;
  }
  _engageDrag(session) {
    if (this._drag !== session) return;
    session.engaged = true;
    session.timer   = null;
    const { row } = session;
    row.classList.add('wl-row--dragging');
    row.style.touchAction = 'none';
    try { row.setPointerCapture(session.pointerId); } catch {}
    session.indicator = document.createElement('div');
    session.indicator.className = 'wl-drop-indicator';
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch {} }
  }
  _onPointerMove(e, session) {
    if (!session.engaged) {
      const dx = e.clientX - session.startX;
      const dy = e.clientY - session.startY;
      if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
        if (session.timer) clearTimeout(session.timer);
        session.row.removeEventListener('pointermove', session.moveHandler);
        session.row.removeEventListener('pointerup', session.upHandler);
        session.row.removeEventListener('pointercancel', session.cancelHandler);
        if (this._drag === session) this._drag = null;
      }
      return;
    }
    e.preventDefault();
    const ul = this._listEl;
    if (!ul) return;
    const rows = [...ul.querySelectorAll('.wl-row')].filter(r => r !== session.row);
    let pos = rows.length;
    for (let j = 0; j < rows.length; j++) {
      const rect = rows[j].getBoundingClientRect();
      if (e.clientY < rect.top + rect.height / 2) { pos = j; break; }
    }
    session.lastInsertPos = pos;
    ul.insertBefore(session.indicator, rows[pos] || null);
  }
  _onPointerUp(e, session) {
    const wasEngaged = session.engaged;
    this._teardownSession(session);
    this._drag = null;
    if (!wasEngaged) return;
    const dragIndex   = +session.row.dataset.idx;
    const list        = storage.getWatchlist();
    const draggedItem = list[dragIndex];
    const others      = list.filter((_, i) => i !== dragIndex);
    const pos         = session.lastInsertPos ?? others.length;
    const newList     = [...others.slice(0, pos), draggedItem, ...others.slice(pos)];
    storage.setWatchlist(newList);
    this._justDragged = true;
    setTimeout(() => { this._justDragged = false; }, 300);
    this._render();
  }
  _onPointerCancel(e, session) {
    this._teardownSession(session);
    this._drag = null;
    this._render();
  }
  _teardownSession(session) {
    if (session.timer) clearTimeout(session.timer);
    session.row.removeEventListener('pointermove', session.moveHandler);
    session.row.removeEventListener('pointerup', session.upHandler);
    session.row.removeEventListener('pointercancel', session.cancelHandler);
    session.row.classList.remove('wl-row--dragging');
    session.row.style.touchAction = '';
    try { session.row.releasePointerCapture(session.pointerId); } catch {}
    if (session.indicator && session.indicator.parentNode) session.indicator.remove();
  }
  destroy() {
    this._destroyed = true;
    if (this._drag) this._teardownSession(this._drag);
  }
}