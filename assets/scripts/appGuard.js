import {captureScreenshot} from './screenshot.js';
import {confirm} from './message.js';
let initialized = false;
let lockKeys = false;
let bypassUnload = false;
export const setGuardBypass = (val) => { bypassUnload = val; };
const onBeforeUnload = e => {
  if (bypassUnload) return;
  e.preventDefault();
  e.returnValue = '';
};
const onKeydown = async e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (!await confirm('Download screenshot?')) return;
    const url = URL.createObjectURL(await captureScreenshot(document.getElementById('chart-wrap')));
    Object.assign(document.createElement('a'), {href: url, download: 'chart.jpg'}).click();
    URL.revokeObjectURL(url);
    return;
  }
  if (e.metaKey && e.altKey) lockKeys = true;
  if (lockKeys && !['Meta', 'Alt'].includes(e.key)) {
    e.preventDefault();
    e.stopImmediatePropagation();
    return false;
  }
};
const onKeyup = e => { if (!e.metaKey || !e.altKey) lockKeys = false; };
const onBlur  = () => { lockKeys = false; };
export function initGuard() {
  if (initialized) return;
  initialized = true;
  setTimeout(() => addEventListener('beforeunload', onBeforeUnload), 3_000);
  addEventListener('keydown', onKeydown, true);
  addEventListener('keyup',   onKeyup,   true);
  addEventListener('blur',    onBlur);
}
export function destroyGuard() {
  if (!initialized) return;
  initialized = false;
  removeEventListener('beforeunload', onBeforeUnload);
  removeEventListener('keydown', onKeydown, true);
  removeEventListener('keyup',   onKeyup,   true);
  removeEventListener('blur',    onBlur);
}