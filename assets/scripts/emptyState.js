import {toolsVisibility} from './tools.js';
export function initEmptyState(container,chart,willLoad) {
  toolsVisibility.set(false);
  const el=document.createElement('div');
  el.id='chart-empty';
  const bars=Array.from({length:28},(_,i)=>`<div class="ceb" style="animation-delay:${(i*0.09).toFixed(2)}s;background:${i%2===0?'var(--green)':'var(--red)'}"></div>`).join('');
  el.innerHTML=`<div id="chart-empty-text">${willLoad?'<p id="cet-main">Loading…</p>':'<p id="cet-main">Search for a symbol to begin</p><p id="cet-sub">Use the search bar at the top right, or open the sidebar to browse tracked assets</p>'}</div><div id="chart-empty-bars">${bars}</div>`;
  container.appendChild(el);
  chart._chartOn('load',()=>{toolsVisibility.set(true);el.remove();});
}