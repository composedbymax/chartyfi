import {initMessage,toast} from './message.js';
import {ApiClient} from './apiClient.js';
import {Chart} from './chart.js';
import {Search,initUrlState} from './search.js';
import {Sidebar} from './sidebar.js';
import {localTimezone,offsetMinutesForZone} from './timezone.js';
import {initEmptyState} from './emptyState.js';
document.getElementById('app').innerHTML=`
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
  <aside id="sidebar"><div id="sb-inner"></div></aside>
  <div id="chart-wrap"></div>
</div>`;
async function main() {
  initMessage();
  const api=new ApiClient(window.CFG.api);
  const config=await api.userConfig().catch(()=>({}));
  let chartTz='UTC';
  const chart=new Chart(document.getElementById('chart-wrap'),api,chartTz);
  const urlLoaded=initUrlState(chart);
  const sidebar=new Sidebar(document.getElementById('sb-inner'),chart,api,config,localTimezone);
  sidebar.onTimezoneChange=tz=>{
    chartTz=tz;
    chart.setTimezone(tz);
  };
  new Search(document.getElementById('search-in'),document.getElementById('search-res'),chart,api);
  const willLoad = urlLoaded || !!(config?.tracked?.[0]);
  initEmptyState(document.getElementById('chart-wrap'), chart, willLoad);
  document.getElementById('sb-toggle').addEventListener('click',()=>sidebar.toggle());
  chart.on('load',({sym,int})=>{
    const tracked=config?.tracked||[];
    const name=tracked.find(t=>t.symbol===sym)?.symbol||sym;
    document.getElementById('asset-name').textContent=name;
    document.getElementById('asset-sym').textContent=int;
  });
  const first=config?.tracked?.[0];
  if(first&&!urlLoaded) chart.load(first.symbol,first.interval);
  setupPolling(config,chart,api);
}
function setupPolling(config,chart,api) {
  const ci=config?.cron_info;
  if(!ci?.last_cron_run) return;
  const freq=ci.cron_frequency*1000;
  const nextRun=(ci.last_cron_run*1000)+freq+120000;
  const wait=Math.max(nextRun-Date.now(),freq);
  setTimeout(()=>poll(chart,api,freq),wait);
}
async function poll(chart,api,freq) {
  const sym=chart.currentSymbol;const int=chart.currentInterval;
  if(sym&&int) {
    const since=chart.getLastTimestamp();
    const res=await api.checkUpdates(sym,int,since).catch(()=>null);
    if(res?.candles?.length) chart.appendCandles(res.candles);
  }
  setTimeout(()=>poll(chart,api,freq),freq);
}
main().catch(e=>{console.error(e)});