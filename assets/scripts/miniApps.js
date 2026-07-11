import {Watchlist}      from './watchlist.js';
import {Correlation}    from './correlation.js';
import {Screener}       from './screener.js';
import {DataIntegrity}  from './dataintegrity.js';
import {CycleApp}       from './cycleApp.js';
import {MarketSummary}  from './marketSummary.js';
import {Insights}       from './insights.js';
import {News}           from './news.js';
import {CycleConsensus} from './cycleConsensus.js';
import {authModal}      from './authPage.js';
const APPS = [
  [Watchlist],
  [Correlation],
  [Screener],
  [DataIntegrity],
  [MarketSummary],
  [Insights,      { authRequired: true }],
  [News,           { authRequired: true }],
  [CycleApp],
  [CycleConsensus, { authRequired: true }],
];
export class MiniApps {
  constructor(chart, api) {
    this.chart      = chart;
    this.api        = api;
    this._active    = null;
    this._editorPom = null;
    this._persistent = new Map();
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
    if (AppClass.config?.persistent) {
      if (!this._persistent.has(AppClass)) {
        this._persistent.set(AppClass, new AppClass(this.chart, this.api));
      }
      this._active = this._persistent.get(AppClass);
    } else {
      this._active = new AppClass(this.chart, this.api);
    }
    sidebar._openMiniApp(this._active);
  }
  close() {
    if (this._active) {
      if (!this._active.constructor.config?.persistent) {
        if (this._active.destroy) this._active.destroy();
      }
      this._active = null;
    }
    if (this._editorPom) { this._editorPom.restoreAll(); this._editorPom = null; }
  }
  destroyAll() {
    for (const [, instance] of this._persistent) {
      if (instance.destroy) instance.destroy();
    }
    this._persistent.clear();
    if (this._active && !this._active.constructor.config?.persistent) {
      if (this._active.destroy) this._active.destroy();
    }
    this._active = null;
  }
}