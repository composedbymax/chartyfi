import {storage} from './storage.js';
let toastWrap;
export function initMessage() {
  toastWrap=document.createElement('div');
  toastWrap.id='toast-container';
  toastWrap.className='toast-container';
  document.body.appendChild(toastWrap);
}
export function toast(msg, type='info', ms=3200, persistent=false) {
  if(!storage.getToasts()) return;
  const el=document.createElement('div');
  el.className=`toast ${type}`;
  const text=document.createElement('span');
  text.textContent=msg;
  el.appendChild(text);
  if(!persistent){
    const close=document.createElement('div');
    close.className='toast-close';
    close.textContent='×';
    close.onclick=(e)=>{
      e.stopPropagation();
      el.remove();
    };
    el.appendChild(close);
    setTimeout(()=>el.remove(), ms);
  }
  toastWrap.appendChild(el);
  return el;
}
export function confirm(msg) {
  return new Promise(resolve=>{
    const prevFocus=document.activeElement;
    const ov=document.createElement('div');
    ov.id='dialog-overlay';
    ov.dataset.sidebarPersist = '';
    ov.innerHTML=`<div class="dialog">
      <div class="dialog-msg">${msg}</div>
      <div class="dialog-btns">
        <button class="btn-cancel">Cancel</button>
        <button class="btn-confirm">Confirm</button>
      </div>
    </div>`;
    const cancelBtn=ov.querySelector('.btn-cancel');
    const confirmBtn=ov.querySelector('.btn-confirm');
    const close=result=>{
      ov.removeEventListener('keydown',onKeydown);
      ov.remove();
      if(prevFocus && prevFocus.focus) prevFocus.focus();
      resolve(result);
    };
    const onKeydown=e=>{
      if(e.key==='Enter'){e.preventDefault();close(true)}
      else if(e.key==='Escape'){e.preventDefault();close(false)}
    };
    cancelBtn.onclick=()=>close(false);
    confirmBtn.onclick=()=>close(true);
    ov.addEventListener('keydown',onKeydown);
    document.body.appendChild(ov);
    cancelBtn.focus();
  });
}
export function deny(msg) {toast(msg,'error');}