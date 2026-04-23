import {storage} from './storage.js';
import {isMobile} from './detector.js';
let tooltipEl;
let touchActive = false;
let lastTarget = null;
function getTooltip() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'app-tooltip';
  tooltipEl.style.pointerEvents = 'none';
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}
function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}
function show(text, x, y) {
  const el = getTooltip();
  el.textContent = text;
  el.classList.add('visible');
  const offset = isMobile ? 24 : 12;
  const padding = 8;
  const vw = innerWidth;
  const vh = innerHeight;
  let left = x + offset;
  let top = y + offset;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  requestAnimationFrame(() => {
    const r = el.getBoundingClientRect();
    el.style.left = `${clamp(left, padding, vw - r.width - padding)}px`;
    el.style.top = `${clamp(top, padding, vh - r.height - padding)}px`;
  });
}
function hide() {
  if (!tooltipEl) return;
  tooltipEl.classList.remove('visible');
}
function getTarget(x, y, e) {
  return (e ? e.target : document.elementFromPoint(x, y))?.closest('[data-tooltip]');
}
function handle(x, y, target) {
  if (!target) {lastTarget = null;hide();return;}
  if (target === lastTarget) return;
  lastTarget = target;
  const text = target.getAttribute('data-tooltip');
  if (!text) return hide();
  show(text, x, y);
}
if (isMobile) {
  document.addEventListener('touchstart', () => {
    touchActive = true;
    lastTarget = null;
  }, {passive: true});
  document.addEventListener('touchmove', (e) => {
    if (!storage.getTooltips() || !touchActive) return hide();
    const t = e.touches[0];
    if (!t) return;
    handle(t.clientX, t.clientY, getTarget(t.clientX, t.clientY));
  }, {passive: true});
  document.addEventListener('touchend', () => {
    touchActive = false;
    lastTarget = null;
    hide();
  }, {passive: true});
  document.addEventListener('touchcancel', () => {
    touchActive = false;
    lastTarget = null;
    hide();
  }, {passive: true});
} else {
  document.addEventListener('mousemove', (e) => {
    if (!storage.getTooltips()) return hide();
    handle(e.clientX, e.clientY, getTarget(0, 0, e));
  });
  document.addEventListener('mouseleave', hide, true);
}
export function tooltip(target, text) {
  if (!target) return;
  target.setAttribute('data-tooltip', text);
}