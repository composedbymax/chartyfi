let tooltipEl;
function getTooltip() {
  if (tooltipEl) return tooltipEl;
  tooltipEl = document.createElement('div');
  tooltipEl.className = 'app-tooltip';
  document.body.appendChild(tooltipEl);
  return tooltipEl;
}
function show(text, x, y) {
  const el = getTooltip();
  el.textContent = text;
  el.classList.add('visible');
  el.style.left = `${x + 12}px`;
  el.style.top = `${y + 12}px`;
}
function hide() {
  if (!tooltipEl) return;
  tooltipEl.classList.remove('visible');
}
function findTarget(e) {
  return e.target.closest('[data-tooltip]');
}
document.addEventListener('mousemove', (e) => {
  const el = findTarget(e);
  if (!el) return;
  const text = el.getAttribute('data-tooltip');
  if (!text) return;
  show(text, e.pageX, e.pageY);
});
document.addEventListener('mouseleave', hide, true);
export function tooltip(target, text) {
  if (!target) return;
  target.setAttribute('data-tooltip', text);
}