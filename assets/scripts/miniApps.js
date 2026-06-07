import {Watchlist}      from './watchlist.js';
import {Screener}      from './screener.js';
import {DataIntegrity}  from './dataintegrity.js';
import {News}           from './news.js';
import {CycleConsensus} from './cycleConsensus.js';
import {authModal}      from './authPage.js';
const APPS = [
  [Watchlist],
  [Screener],
  [News, { authRequired: true }],
  [DataIntegrity],
  [CycleConsensus, { authRequired: true }],
];
export class MiniApps {
  constructor(chart, api) {
    this.chart      = chart;
    this.api        = api;
    this._active    = null;
    this._editorPom = null;
  }
  getApps() { return APPS.map(([AppClass]) => AppClass); }
  open(AppClass, sidebar) {
    const [, opts] = APPS.find(([A]) => A === AppClass) ?? [];
    if (opts?.authRequired && !window.userLoggedIn) {
      authModal.open();
      return;
    }
    if (AppClass.config?.suspendIndicators) {
      this._editorPom = sidebar._editor._pom;
      this._editorPom.suspendAll();
    }
    this._active = new AppClass(this.chart, this.api);
    sidebar._openMiniApp(this._active);
  }
  close() {
    if (this._active?.destroy) this._active.destroy();
    this._active = null;
    if (this._editorPom) { this._editorPom.restoreAll(); this._editorPom = null; }
  }
}