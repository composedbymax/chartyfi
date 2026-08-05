import {authAPI} from './api.js';
const POLL_INTERVAL_MS = 60000;
let _timer = null;
let _inFlight = null;
async function _poll() {
  if (_inFlight) return _inFlight;
  _inFlight = (async () => {
    try {
      const res = await fetch(authAPI, { cache: 'no-store', credentials: 'same-origin' });
      if (!res.ok) return;
      const text = await res.text();
      (0, eval)(text);
    } catch (e) {
      console.error('authPoll: failed to refresh auth state', e);
    } finally {
      _inFlight = null;
    }
  })();
  return _inFlight;
}
export function initAuthPoll() {
  if (_timer) return;
  _timer = setInterval(_poll, POLL_INTERVAL_MS);
}
export function stopAuthPoll() {
  clearInterval(_timer);
  _timer = null;
}
export function refreshAuthNow() {
  return _poll();
}