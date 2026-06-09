import {initMessage, toast} from './message.js';
import {ApiClient} from './apiClient.js';
import {Chart} from './chart.js';
import {Search, initUrlState} from './search.js';
import {Sidebar} from './sidebar.js';
import {Tools} from './tools.js';
import {localTimezone} from './timezone.js';
import {initEmptyState} from './emptyState.js';
import {storage} from './storage.js';
import {AutoFetch, autofetchEnabled} from './autofetch.js';
import {tooltip} from './tooltip.js';
import {initGuard} from './appGuard.js';
import {initModels} from './models.js';
import {initPolling} from './autoPoll.js';
initGuard();
const _t = storage.getTheme();
if (_t) document.documentElement.setAttribute('data-theme', _t);
document.getElementById('app').innerHTML = `
<header id="hdr">
  <div class="hdr-l">
    <button class="icon-btn" id="sb-toggle" title="Menu">☰</button>
    <div id="asset-label">
      <span id="asset-name"></span>
      <span id="asset-sym"></span>
    </div>
  </div>
  <div class="hdr-r">
    <div id="search-wrap">
      <input id="search-in" type="text" placeholder="Search symbol…" autocomplete="off" spellcheck="false">
      <div id="search-res"></div>
    </div>
  </div>
</header>
<div id="body-wrap">
  <aside id="tools-wrap"><div id="tools-inner"></div></aside>
  <div id="chart-wrap"></div>
  <aside id="sidebar"><div id="sb-inner"></div></aside>
</div>`;
async function main() {
  initMessage();
  const api = new ApiClient(window.CFG.api);
  const config = window.userLoggedIn ? await api._userConfig().catch(() => ({})) : {};
  let chartTz = 'UTC';
  const chart = new Chart(document.getElementById('chart-wrap'), api, chartTz);
  const tools = new Tools(document.getElementById('tools-wrap'), chart, api, { visible: storage.getTools() });
  const af = new AutoFetch(chart); autofetchEnabled._inst = af;
  api.onBackfill=(sym,int,candles)=>{if(chart._currentSymbol===sym&&chart._currentInterval===int)chart._appendCandles(candles)}
  window.addEventListener('toolsVisibility', e => { tools.setVisible(e.detail); chart._forceResize(); });
  const isDatasetUrl = location.search === '?dataset';
  const urlLoaded = isDatasetUrl ? false : initUrlState(chart);
  const sidebar = new Sidebar(document.getElementById('sb-inner'), chart, api, config, localTimezone);
  sidebar.onTimezoneChange = tz => { chartTz = tz; chart._setTimezone(tz); };
  new Search(document.getElementById('search-in'), document.getElementById('search-res'), chart, api);
  const willLoad = urlLoaded || !!(config?.tracked?.[0]);
  initEmptyState(document.getElementById('chart-wrap'), chart, willLoad);
  document.getElementById('sb-toggle').addEventListener('click', () => sidebar.toggle());
  function updateHeader(sym, int, name) {
    const label = document.getElementById('asset-label');
    document.getElementById('asset-name').textContent = sym;
    document.getElementById('asset-sym').textContent = int;
    label.dataset.name = name || sym;
    tooltip(label, name || sym);
  }
  chart._chartOn('load', async ({ sym, int, name }) => {
    if (name) {
      updateHeader(sym, int, name);
      toast(`${name} loaded`, 'success');
      return;
    }
    updateHeader(sym, int, sym);
    try {
      const d = await api._searchAPI(sym);
      const match = (d.results || []).find(r => r.symbol === sym);
      const resolved = match?.longname || match?.shortname || sym;
      chart._currentName = resolved;
      updateHeader(sym, int, resolved);
      toast(`${resolved} loaded`, 'success');
    } catch {
      toast(`${sym} loaded`, 'success');
    }
  });
  chart._chartOn('dataset-loaded',({int}) => {
    updateHeader('Dataset', int || '', 'Dataset');
    history.replaceState(null, '', '?dataset');
  });
  const first = config?.tracked?.[0];
  if (first && !urlLoaded) chart.load(first.symbol, first.interval);
  initModels();
  initPolling(chart);
}
main().catch(e => console.error(e));