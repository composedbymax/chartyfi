const SVG_NS = 'http://www.w3.org/2000/svg';
const SPRITE_ID = 'app-svg-sprite';
const ICONS = {
  settingsIcon: {
    viewBox: '0 0 24 24',
    content: `<path d="M12 15.5A3.5 3.5 0 1 0 12 8.5A3.5 3.5 0 0 0 12 15.5Z" fill="none" stroke="currentColor" stroke-width="2"/> <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-.4-1.1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.82.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.1-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6c.36 0 .7-.14 1-.4.3-.26.4-.64.4-1.1V3a2 2 0 1 1 4 0v.1c0 .46.1.84.4 1.1.3.26.64.4 1 .4.36 0 .7-.14 1-.4l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06c-.26.3-.4.64-.34 1.82.06.36.2.7.6 1 .3.26.64.4 1.1.4H22a2 2 0 1 1 0 4h-.1c-.46 0-.84.14-1.1.4-.3.26-.44.64-.6 1Z" fill="none" stroke="currentColor" stroke-width="2"/>`
  },
  codeIcon: {
    viewBox: '0 0 24 24',
    content: `<path d="M5.5 8C6.88071 8 8 6.88071 8 5.5C8 4.11929 6.88071 3 5.5 3C4.11929 3 3 4.11929 3 5.5C3 6.88071 4.11929 8 5.5 8ZM5.5 8V16M5.5 16C4.11929 16 3 17.1193 3 18.5C3 19.8807 4.11929 21 5.5 21C6.88071 21 8 19.8807 8 18.5C8 17.1193 6.88071 16 5.5 16ZM18.5 8C19.8807 8 21 6.88071 21 5.5C21 4.11929 19.8807 3 18.5 3C17.1193 3 16 4.11929 16 5.5C16 6.88071 17.1193 8 18.5 8ZM18.5 8C18.5 8.92997 18.5 9.39496 18.3978 9.77646C18.1204 10.8117 17.3117 11.6204 16.2765 11.8978C15.895 12 15.43 12 14.5 12H8.5C6.84315 12 5.5 13.3431 5.5 15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>`
  },
  nonStickyIcon: {
    viewBox: '0 0 16 16',
    content: `<path d="M6 12.5a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5v-9a.5.5 0 0 0-.5-.5h-8a.5.5 0 0 0-.5.5v2a.5.5 0 0 1-1 0v-2A1.5 1.5 0 0 1 6.5 2h8A1.5 1.5 0 0 1 16 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 5 12.5v-2a.5.5 0 0 1 1 0v2z" fill="currentColor"/><path d="M.146 8.354a.5.5 0 0 1 0-.708l3-3a.5.5 0 1 1 .708.708L1.707 7.5H10.5a.5.5 0 0 1 0 1H1.707l2.147 2.146a.5.5 0 0 1-.708.708l-3-3z" fill="currentColor"/>`
  },
  stickyIcon: {
    viewBox: '0 0 36 36',
    content: `<path d="M30,30,6,30,6,6H22V4H6A2,2,0,0,0,4,6V30a2,2,0,0,0,2,2H30a2,2,0,0,0,2-2V14H30Z" fill="currentColor"/><path d="M33.57,9.33l-7-7a1,1,0,0,0-1.41,1.41l1.38,1.38-4,4c-2-.87-4.35.14-5.92,1.68l-.72.71,3.54,3.54-3.67,3.67,1.41,1.41,3.67-3.67L24.37,20l.71-.72c1.54-1.57,2.55-3.91,1.68-5.92l4-4,1.38,1.38a1,1,0,1,0,1.41-1.41Z" fill="currentColor"/>`
  },
  sunIcon: {
    viewBox: '0 0 24 24',
    content: `<path d="M12 3V4M12 20V21M4 12H3M6.31412 6.31412L5.5 5.5M17.6859 6.31412L18.5 5.5M6.31412 17.69L5.5 18.5001M17.6859 17.69L18.5 18.5001M21 12H20M16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8C14.2091 8 16 9.79086 16 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
  },
  moonIcon: {
    viewBox: '0 0 24 24',
    content: `<path d="M3.32031 11.6835C3.32031 16.6541 7.34975 20.6835 12.3203 20.6835C16.1075 20.6835 19.3483 18.3443 20.6768 15.032C19.6402 15.4486 18.5059 15.6834 17.3203 15.6834C12.3497 15.6834 8.32031 11.654 8.32031 6.68342C8.32031 5.50338 8.55165 4.36259 8.96453 3.32996C5.65605 4.66028 3.32031 7.89912 3.32031 11.6835Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
  },
  toolsIcon: {
    viewBox: '0 0 24 24',
    content: `<path fill="currentColor" fill-rule="evenodd" d="M16,16 L16,13 L18,13 L18,16 L21,16 L21,18 L18,18 L18,21 L16,21 L16,18 L13,18 L13,16 L16,16 Z M4,13 L9,13 C10.1045695,13 11,13.8954305 11,15 L11,20 C11,21.1045695 10.1045695,22 9,22 L4,22 C2.8954305,22 2,21.1045695 2,20 L2,15 C2,13.8954305 2.8954305,13 4,13 Z M4,15 L4,20 L9,20 L9,15 L4,15 Z M4,2 L9,2 C10.1045695,2 11,2.8954305 11,4 L11,9 C11,10.1045695 10.1045695,11 9,11 L4,11 C2.8954305,11 2,10.1045695 2,9 L2,4 C2,2.8954305 2.8954305,2 4,2 Z M4,4 L4,9 L9,9 L9,4 L4,4 Z M15,2 L20,2 C21.1045695,2 22,2.8954305 22,4 L22,9 C22,10.1045695 21.1045695,11 20,11 L15,11 C13.8954305,11 13,10.1045695 13,9 L13,4 C13,2.8954305 13.8954305,2 15,2 Z M15,4 L15,9 L20,9 L20,4 L15,4 Z"/>`
  },
  cursorIcon: {
    viewBox: '0 0 24 24',
    content: `<path d="M17.2607 12.4008C19.3774 11.2626 20.4357 10.6935 20.7035 10.0084C20.9359 9.41393 20.8705 8.74423 20.5276 8.20587C20.1324 7.58551 18.984 7.23176 16.6872 6.52425L8.00612 3.85014C6.06819 3.25318 5.09923 2.95471 4.45846 3.19669C3.90068 3.40733 3.46597 3.85584 3.27285 4.41993C3.051 5.06794 3.3796 6.02711 4.03681 7.94545L6.94793 16.4429C7.75632 18.8025 8.16052 19.9824 8.80519 20.3574C9.36428 20.6826 10.0461 20.7174 10.6354 20.4507C11.3149 20.1432 11.837 19.0106 12.8813 16.7454L13.6528 15.0719C13.819 14.7113 13.9021 14.531 14.0159 14.3736C14.1168 14.2338 14.2354 14.1078 14.3686 13.9984C14.5188 13.8752 14.6936 13.7812 15.0433 13.5932L17.2607 12.4008Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>`
  },
  crosshairIcon: {
    viewBox: '0 0 32 32',
    content: `<path d="M30 15.25h-3.326c-0.385-5.319-4.605-9.539-9.889-9.922l-0.035-0.002v-3.326c0-0.414-0.336-0.75-0.75-0.75s-0.75 0.336-0.75 0.75v0 3.326c-5.319 0.385-9.539 4.605-9.922 9.889l-0.002 0.035h-3.326c-0.414 0-0.75 0.336-0.75 0.75s0.336 0.75 0.75 0.75v0h3.326c0.385 5.319 4.605 9.539 9.889 9.922l0.035 0.002v3.326c0 0.414 0.336 0.75 0.75 0.75s0.75-0.336 0.75-0.75v0-3.326c5.319-0.385 9.539-4.605 9.922-9.889l0.002-0.035h3.326c0.414 0 0.75-0.336 0.75-0.75s-0.336-0.75-0.75-0.75v0zM16.75 25.174v-3.174c0-0.414-0.336-0.75-0.75-0.75s-0.75 0.336-0.75 0.75v0 3.174c-4.492-0.378-8.046-3.932-8.422-8.39l-0.002-0.034h3.174c0.414 0 0.75-0.336 0.75-0.75s-0.336-0.75-0.75-0.75v0h-3.174c0.378-4.492 3.932-8.046 8.39-8.422l0.034-0.002v3.174c0 0.414 0.336 0.75 0.75 0.75s0.75-0.336 0.75-0.75v0-3.174c4.492 0.378 8.046 3.932 8.422 8.39l0.002 0.034h-3.174c-0.414 0-0.75 0.336-0.75 0.75s0.336 0.75 0.75 0.75v0h3.174c-0.379 4.492-3.932 8.045-8.39 8.422l-0.034 0.002z"></path>`
  },
  trendlineIcon: {
    viewBox: '0 0 24 24',
    content: `<path d="M20.684 4.042A1.029 1.029 0 0 1 22 5.03l-.001 5.712a1.03 1.03 0 0 1-1.647.823L18.71 10.33l-4.18 5.568a1.647 1.647 0 0 1-2.155.428l-.15-.1-3.337-2.507-4.418 5.885c-.42.56-1.185.707-1.777.368l-.144-.095a1.372 1.372 0 0 1-.368-1.776l.095-.144 5.077-6.762a1.646 1.646 0 0 1 2.156-.428l.149.1 3.336 2.506 3.522-4.69-1.647-1.237a1.03 1.03 0 0 1 .194-1.76l.137-.05 5.485-1.595-.001.001z" fill="currentColor"></path>`
  },
  penIcon: {
    viewBox: '0 0 28 28',
    content: `<path d="M26.4097 9.61208C27.196 8.8358 27.1969 7.57578 26.4117 6.79842L21.1441 1.58305C20.3597 0.806412 19.0875 0.805538 18.302 1.5811L3.55214 16.1442C3.15754 16.5338 2.87982 17.024 2.74985 17.5603L1.05726 24.5451C0.697341 26.0304 2.09375 27.3461 3.57566 26.918L10.3372 24.9646C10.8224 24.8244 11.2642 24.5658 11.622 24.2125L26.4097 9.61208ZM20.4642 12.6725L10.2019 22.8047C10.0827 22.9225 9.9354 23.0087 9.77366 23.0554L4.17079 24.6741C3.65448 24.8232 3.16963 24.359 3.2962 23.8367L4.70476 18.024C4.74809 17.8453 4.84066 17.6819 4.97219 17.552L15.195 7.45865L20.4642 12.6725ZM21.8871 11.2676L16.618 6.05372L19.0185 3.68356C19.4084 3.29865 20.0354 3.29908 20.4247 3.68454L24.271 7.49266C24.6666 7.88436 24.6661 8.52374 24.27 8.91488L21.8871 11.2676Z" fill="currentColor" fill-rule="evenodd"/>`
  },
  fibIcon: {
    viewBox: '0 0 24 24',
    content: `<path d="M21,2H3A1,1,0,0,0,2,3V21a1,1,0,0,0,1,1h7a1,1,0,0,0,1-1V11H21a1,1,0,0,0,1-1V3A1,1,0,0,0,21,2ZM20,9H19V7a1,1,0,0,0-2,0V9H15V7a1,1,0,0,0-2,0V9H11V7A1,1,0,0,0,9,7V9H7a1,1,0,0,0,0,2H9v2H7a1,1,0,0,0,0,2H9v2H7a1,1,0,0,0,0,2H9v1H4V4H20Z"></path>`
  },
  measureIcon: {
    viewBox: '0 0 17 17',
    content: `<path d="M12.036 0.015L1.415 10.636M1.429 12.036L2.843 13.45M3.55 9.914L4.964 11.328M5.671 7.793L7.085 9.207M7.793 5.671L9.207 7.085M9.914 3.55L11.328 4.964M12.036 0.015L16.985 4.965L6.379 15.571L1.429 12.036" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`
  },
  fitIcon: {
    viewBox: '0 0 32 32',
    content: `<defs><style>.cls-1{fill:none;}</style></defs><title>fit-to-screen</title><polygon points="22 16 24 16 24 8 16 8 16 10 22 10 22 16"></polygon><polygon points="8 24 16 24 16 22 10 22 10 16 8 16 8 24"></polygon><path d="M26,28H6a2.0023,2.0023,0,0,1-2-2V6A2.0023,2.0023,0,0,1,6,4H26a2.0023,2.0023,0,0,1,2,2V26A2.0023,2.0023,0,0,1,26,28ZM6,6V26H26.0012L26,6Z"></path><rect id="_Transparent_Rectangle_" data-name="&lt;Transparent Rectangle&gt;" class="cls-1" width="32" height="32"></rect>`
  },
  nowIcon: {
    viewBox: '0 0 24 24',
    content: `<path d="M20.8105 2C22.3973 8.57225 22.3973 15.4277 20.8105 22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M2 12.05H16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path><path d="M11.8008 7.09985L15.4108 10.6199C15.5961 10.7998 15.7435 11.0153 15.8442 11.2532C15.9448 11.4911 15.9966 11.7466 15.9966 12.0049C15.9966 12.2632 15.9448 12.5189 15.8442 12.7568C15.7435 12.9947 15.5961 13.21 15.4108 13.3899L11.8008 16.8999" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>`
  },
  timeframeIcon: {
    viewBox: '0 0 24 24',
    content: `<path d="M11,13.723a1.984,1.984,0,0,1,0-3.446V7a1,1,0,0,1,2,0v3.277a1.984,1.984,0,0,1,0,3.446V16a1,1,0,0,1-2,0ZM12,0a1,1,0,0,0,0,2,10,10,0,0,1,0,20,1,1,0,0,0,0,2A12,12,0,0,0,12,0ZM1.827,6.784a1,1,0,1,0,1,1A1,1,0,0,0,1.827,6.784ZM2,12a1,1,0,1,0-1,1A1,1,0,0,0,2,12ZM4.221,3.207a1,1,0,1,0,1,1A1,1,0,0,0,4.221,3.207ZM7.779.841a1,1,0,1,0,1,1A1,1,0,0,0,7.779.841ZM1.827,15.216a1,1,0,1,0,1,1A1,1,0,0,0,1.827,15.216Zm2.394,3.577a1,1,0,1,0,1,1A1,1,0,0,0,4.221,18.793Zm3.558,2.366a1,1,0,1,0,1,1A1,1,0,0,0,7.779,21.159Z"></path>`
  },
  deleteIcon: {
    viewBox: '0 0 24 24',
    content: `<path d="M10 12L14 16M14 12L10 16M4 6H20M16 6L15.7294 5.18807C15.4671 4.40125 15.3359 4.00784 15.0927 3.71698C14.8779 3.46013 14.6021 3.26132 14.2905 3.13878C13.9376 3 13.523 3 12.6936 3H11.3064C10.477 3 10.0624 3 9.70951 3.13878C9.39792 3.26132 9.12208 3.46013 8.90729 3.71698C8.66405 4.00784 8.53292 4.40125 8.27064 5.18807L8 6M18 6V16.2C18 17.8802 18 18.7202 17.673 19.362C17.3854 19.9265 16.9265 20.3854 16.362 20.673C15.7202 21 14.8802 21 13.2 21H10.8C9.11984 21 8.27976 21 7.63803 20.673C7.07354 20.3854 6.6146 19.9265 6.32698 19.362C6 18.7202 6 17.8802 6 16.2V6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
  },
  moveIcon: {
    viewBox: '0 0 24 24',
    content: `<path d="M12 3V9M12 3L9 6M12 3L15 6M12 15V21M12 21L15 18M12 21L9 18M3 12H9M3 12L6 15M3 12L6 9M15 12H21M21 12L18 9M21 12L18 15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`
  },
  autoIcon: {
    viewBox: '0 0 24 24',
    content: `<path fill-rule="evenodd" clip-rule="evenodd" d="M12 10V8.125C9.93125 8.125 8.25 9.80625 8.25 11.875C8.25 12.5062 8.40625 13.1062 8.6875 13.625L7.775 14.5375C7.2875 13.7687 7 12.8562 7 11.875C7 9.1125 9.2375 6.875 12 6.875V5L14.5 7.5L12 10ZM15.3125 10.125L16.225 9.21251C16.7125 9.98126 17 10.8938 17 11.875C17 14.6375 14.7625 16.875 12 16.875V18.75L9.5 16.25L12 13.75V15.625C14.0687 15.625 15.75 13.9438 15.75 11.875C15.75 11.2438 15.5875 10.65 15.3125 10.125Z" fill="currentColor"/><path fill-rule="evenodd" clip-rule="evenodd" d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM12 20C16.4183 20 20 16.4183 20 12C20 7.58172 16.4183 4 12 4C7.58172 4 4 7.58172 4 12C4 16.4183 7.58172 20 12 20Z" fill="currentColor"/>`
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
export const settingsIcon = (options) => createIcon('settingsIcon', options);
export const codeIcon = (options) => createIcon('codeIcon', options);
export const nonStickyIcon = (options) => createIcon('nonStickyIcon', options);
export const stickyIcon = (options) => createIcon('stickyIcon', options);
export const sunIcon = (options) => createIcon('sunIcon', options);
export const moonIcon = (options) => createIcon('moonIcon', options);
export const toolsIcon = (options) => createIcon('toolsIcon', options);
export const cursorIcon = (options) => createIcon('cursorIcon', options);
export const crosshairIcon = (options) => createIcon('crosshairIcon', options);
export const trendlineIcon = (options) => createIcon('trendlineIcon', options);
export const penIcon = (options) => createIcon('penIcon', options);
export const fibIcon = (options) => createIcon('fibIcon', options);
export const measureIcon = (options) => createIcon('measureIcon', options);
export const fitIcon = (options) => createIcon('fitIcon', options);
export const nowIcon = (options) => createIcon('nowIcon', options);
export const timeframeIcon = (options) => createIcon('timeframeIcon', options);
export const deleteIcon = (options) => createIcon('deleteIcon', options);
export const moveIcon = (options) => createIcon('moveIcon', options);
export const autoIcon = (options) => createIcon('autoIcon', options);
export const initSvgSprite = ensureSprite;