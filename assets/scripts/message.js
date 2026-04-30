import {storage} from './storage.js';
let toastWrap;
export function initMessage() {
  toastWrap=document.createElement('div');
  toastWrap.id='toast-container';
  document.body.appendChild(toastWrap);
}
export function toast(msg, type='info', ms=3200, persistent=false) {
  if(!storage.getToasts()) return;
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  el.textContent=msg;
  toastWrap.appendChild(el);
  if(!persistent) {setTimeout(()=>el.remove(),ms);}
  return el;
}
export function confirm(msg) {
  return new Promise(resolve=>{
    const ov=document.createElement('div');
    ov.id='dialog-overlay';
    ov.innerHTML=`<div class="dialog">
      <div class="dialog-msg">${msg}</div>
      <div class="dialog-btns">
        <button class="btn-cancel">Cancel</button>
        <button class="btn-confirm">Confirm</button>
      </div>
    </div>`;
    ov.querySelector('.btn-cancel').onclick=()=>{ov.remove();resolve(false)};
    ov.querySelector('.btn-confirm').onclick=()=>{ov.remove();resolve(true)};
    document.body.appendChild(ov);
  });
}
export function deny(msg) {toast(msg,'error');}