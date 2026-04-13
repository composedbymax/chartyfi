let tooltipEl;
function getTooltip() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'app-tooltip';
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
function show(text, x, y) {
  const el = getTooltip();
  el.textContent = text;
  el.classList.add('visible');
  const offset = 12;
  const padding = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let left = x + offset;
  let top = y + offset;
  el.style.left = `${left}px`;
  el.style.top = `${top}px`;
  requestAnimationFrame(() => {
    const rect = el.getBoundingClientRect();
    left = clamp(left, padding, vw - rect.width - padding);
    top = clamp(top, padding, vh - rect.height - padding);
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  });
}
function hide() {
  if (!tooltipEl) return;
  tooltipEl.classList.remove('visible');
}
function findTarget(e) {
  return e.target.closest('[data-tooltip]');
}
document.addEventListener('mousemove', (e) => {
  const target = findTarget(e);
  if (!target) return;

  const text = target.getAttribute('data-tooltip');
  if (!text) return;

  show(text, e.clientX, e.clientY);
});
document.addEventListener('mouseleave', hide, true);
export function tooltip(target, text) {
  if (!target) return;
  target.setAttribute('data-tooltip', text);
}