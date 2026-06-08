import {storage}    from './storage.js';
import {INTERVALS_S} from './chart.js';
const TITLE_DEFAULT  = 'CHARTYFI';
const TICK_BUFFER_MS = 10_000;
const WORKER_SRC = `
let t1=null,t2=null;
self.onmessage=({data:{cmd,delay,interval}})=>{
  clearTimeout(t1);clearInterval(t2);
  if(cmd==='start'){
    t1=setTimeout(()=>{
      self.postMessage(null);
      t2=setInterval(()=>self.postMessage(null),interval);
    },Math.max(0,delay));
  }
};
`.trim();
class Poller {
  constructor(chart) {
    this._chart  = chart;
    this._worker = null;
    const _orig = storage.setAutofetch.bind(storage);
    storage.setAutofetch = v => {
      _orig(v);
      window.dispatchEvent(new CustomEvent('_autofetchChange', {detail: !!v}));
    };
    window.addEventListener('_autofetchChange', ({detail}) =>
      detail ? this._start() : this._stop()
    );
    window.addEventListener('storage', ({key, newValue}) => {
      if (key === 'autofetch') newValue === 'true' ? this._start() : this._stop();
    });
    chart._chartOn('load', () => {
      if (this._worker) this._schedule();
      this._updateTitle();
    });
    chart._chartOn('barsChanged', () => this._updateTitle());
    if (storage.getAutofetch()) this._start();
  }
  _start() {
    if (this._worker) return;
    const blob = new Blob([WORKER_SRC], {type: 'application/javascript'});
    const url  = URL.createObjectURL(blob);
    this._worker = new Worker(url);
    setTimeout(() => URL.revokeObjectURL(url), 0);
    this._worker.onmessage = () => this._onTick();
    this._schedule();
    this._updateTitle();
  }
  _stop() {
    if (!this._worker) return;
    this._worker.terminate();
    this._worker = null;
    document.title = TITLE_DEFAULT;
  }
  _schedule() {
    if (!this._worker) return;
    const int        = this._chart._currentInterval;
    const intervalS  = INTERVALS_S[int] ?? 60;
    const intervalMs = intervalS * 1_000;
    const now        = Date.now();
    const msIntoInterval = now % intervalMs;
    const msUntilBoundary = msIntoInterval === 0 ? 0 : intervalMs - msIntoInterval;
    const delay = msUntilBoundary + TICK_BUFFER_MS;
    this._worker.postMessage({cmd: 'start', delay, interval: intervalMs});
  }
  async _onTick() {
    if (!this._worker || this._chart._isDataset)               return;
    if (!this._chart._currentSymbol || !this._chart._currentInterval) return;
    await this._chart._extendAfter(1, true);
  }
  _updateTitle() {
    if (!this._worker) return;
    const data = this._chart._getCurrentData();
    const last = data?.[data.length - 1];
    if (!last?.close) return;
    const sym = this._chart._currentSymbol ?? '';
    const p   = Number(last.close);
    const fmt = p >= 1_000
      ? p.toLocaleString('en-US', {maximumFractionDigits: 2})
      : p >= 1   ? p.toFixed(2)
      :             p.toPrecision(4);
    document.title = sym ? `${fmt} · ${sym}` : fmt;
  }
}
export function initPolling(chart) { new Poller(chart); }