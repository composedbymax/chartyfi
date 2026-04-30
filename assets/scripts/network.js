let onlineState = navigator.onLine;
const listeners = new Set();
export function isOnline() {return onlineState;}
export function onNetworkChange(cb) {listeners.add(cb);return () => listeners.delete(cb);}
function setState(v) {if (onlineState === v) return;onlineState = v;listeners.forEach(fn => fn(v));}
window.addEventListener('online', () => setState(true));
window.addEventListener('offline', () => setState(false));