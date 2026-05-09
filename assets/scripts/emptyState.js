import { toolsVisibility } from './tools.js';
export function initEmptyState(container, chart, willLoad) {
  toolsVisibility.set(false);
  const el = document.createElement('div');
  el.id = 'chart-empty';
  const bars = Array.from({ length: 28 }, () =>`<div class="ceb"></div>`).join('');
  el.innerHTML = `<div id="chart-empty-text">${willLoad?'<p id="cet-main">Loading…</p>':`<p id="cet-main">Search for a symbol to begin</p><p id="cet-sub">Use the search bar at the top right, or open the sidebar to browse tracked assets</p>`}</div><div id="chart-empty-bars">${bars}</div>`;
  container.appendChild(el);
  const dismiss = () => { toolsVisibility.set(true); el.remove(); };
  chart._chartOn('load', dismiss);
  chart._chartOn('dataset-loaded', dismiss);
}