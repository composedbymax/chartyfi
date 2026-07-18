import { toolsVisibility } from './tools.js';
import {setGuardBypass} from './appGuard.js';
import {initAPI} from './api.js';
export function initEmptyState(container, chart, willLoad, offline = false) {
  toolsVisibility.lock();
  toolsVisibility.set(false);
  const el = document.createElement('div');
  el.id = 'chart-empty';
  const bars = Array.from({ length: 28 }, () => `<div class="ceb"></div>`).join('');
  el.innerHTML = `<div id="chart-empty-text">${
    offline
      ? `<p id="cet-main">You're offline</p><p id="cet-sub">Waiting for an internet connection...</p>`
      : willLoad
        ? `<p id="cet-main">Loading…</p>`
        : `<p id="cet-main">CHARTYFI</p><p id="cet-sub">Use the search bar at the top right, or open the sidebar to upload a dataset</p>`
  }</div><div id="chart-empty-bars">${bars}</div>`;
  container.appendChild(el);
  if (offline) {
    const check = async () => {
      try {
        const res = await fetch(initAPI, { cache: 'no-store' });
        if (res.ok) {setGuardBypass(true);location.reload();}
      } catch {}
    };
    check();
    const timer = setInterval(check, 2000);
    window.addEventListener('beforeunload', () => clearInterval(timer), { once: true });
    return;
  }
  const dismiss = () => { toolsVisibility.unlock(); toolsVisibility.set(true); el.remove(); };
  chart._chartOn('load', dismiss);
  chart._chartOn('dataset-loaded', dismiss);
}