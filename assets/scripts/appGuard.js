let initialized = false;
let lockKeys = false;
const onBeforeUnload = e => {
  e.preventDefault();
  e.returnValue = '';
};
const onKeydown = e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's'){
    e.preventDefault();
    return false;
  }
  if (e.metaKey && e.altKey) lockKeys = true;
  if (lockKeys && !['Meta', 'Alt'].includes(e.key)) {
    e.preventDefault();
    e.stopImmediatePropagation();
    return false;
  }
};
const onKeyup = e => { if (!e.metaKey || !e.altKey) lockKeys = false;};
const onBlur = () => {lockKeys = false;};
export function initGuard() {
  if (initialized) return;
  initialized = true;
  addEventListener('beforeunload', onBeforeUnload);
  addEventListener('keydown', onKeydown, true);
  addEventListener('keyup', onKeyup, true);
  addEventListener('blur', onBlur);
}
export function destroyGuard() {
  if (!initialized) return;
  initialized = false;
  removeEventListener('beforeunload', onBeforeUnload);
  removeEventListener('keydown', onKeydown, true);
  removeEventListener('keyup', onKeyup, true);
  removeEventListener('blur', onBlur);
}