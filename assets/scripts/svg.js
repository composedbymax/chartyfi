const SVG_NS = 'http://www.w3.org/2000/svg';
const SPRITE_ID = 'app-svg-sprite';
const ICONS = {
  settings: {
    viewBox: '0 0 24 24',
    content: `
        <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5A3.5 3.5 0 0 0 12 15.5Z" fill="none" stroke="currentColor" stroke-width="2"/> <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-.4-1.1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.82.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.1-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6c.36 0 .7-.14 1-.4.3-.26.4-.64.4-1.1V3a2 2 0 1 1 4 0v.1c0 .46.1.84.4 1.1.3.26.64.4 1 .4.36 0 .7-.14 1-.4l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06c-.26.3-.4.64-.34 1.82.06.36.2.7.6 1 .3.26.64.4 1.1.4H22a2 2 0 1 1 0 4h-.1c-.46 0-.84.14-1.1.4-.3.26-.44.64-.6 1Z" fill="none" stroke="currentColor" stroke-width="2"/>
    `
  },
  code: {
    viewBox: '0 0 24 24',
    content: `
      <path d="M5.5 8C6.88071 8 8 6.88071 8 5.5C8 4.11929 6.88071 3 5.5 3C4.11929 3 3 4.11929 3 5.5C3 6.88071 4.11929 8 5.5 8ZM5.5 8V16M5.5 16C4.11929 16 3 17.1193 3 18.5C3 19.8807 4.11929 21 5.5 21C6.88071 21 8 19.8807 8 18.5C8 17.1193 6.88071 16 5.5 16ZM18.5 8C19.8807 8 21 6.88071 21 5.5C21 4.11929 19.8807 3 18.5 3C17.1193 3 16 4.11929 16 5.5C16 6.88071 17.1193 8 18.5 8ZM18.5 8C18.5 8.92997 18.5 9.39496 18.3978 9.77646C18.1204 10.8117 17.3117 11.6204 16.2765 11.8978C15.895 12 15.43 12 14.5 12H8.5C6.84315 12 5.5 13.3431 5.5 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
    `
  }
};
function ensureSprite() {
  if (typeof document === 'undefined' || document.getElementById(SPRITE_ID)) return;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.id = SPRITE_ID;
  svg.setAttribute('class', 'svg-sprite');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = `<defs>${Object.entries(ICONS)
    .map(([name, icon]) => `<symbol id="icon-${name}" viewBox="${icon.viewBox}">${icon.content}</symbol>`)
    .join('')}</defs>`;
  (document.body || document.documentElement).prepend(svg);
}
function createIcon(name, { className = '', title = '', width = 24, height = 24, ...attrs } = {}) {
  ensureSprite();
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', ICONS[name].viewBox);
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', title ? 'false' : 'true');
  if (className) svg.setAttribute('class', className);
  if (title) {
    const t = document.createElementNS(SVG_NS, 'title');
    t.textContent = title;
    svg.appendChild(t);
    svg.setAttribute('role', 'img');
  }
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#icon-${name}`);
  use.setAttribute('xlink:href', `#icon-${name}`);
  svg.appendChild(use);
  for (const [k, v] of Object.entries(attrs)) {
    if (v != null) svg.setAttribute(k, String(v));
  }
  return svg;
}
export const settingsIcon = (options) => createIcon('settings', options);
export const codeIcon = (options) => createIcon('code', options);
export const initSvgSprite = ensureSprite;