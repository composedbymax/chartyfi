//search.js
import {toast} from './message.js';
export function initUrlState(chart) {
  const syncUrl = ({ sym, int }) => {
    const u = new URL(location.href);
    u.search = `?${encodeURIComponent(sym)}&${encodeURIComponent(int)}`;
    history.replaceState(null, '', u);
  };
  chart._chartOn('load', syncUrl);
  const q = location.search.slice(1);
  if (!q) return false;
  const [symRaw = '', intRaw = ''] = q.split('&');
  const sym = decodeURIComponent(symRaw);
  const int = decodeURIComponent(intRaw) || chart._currentInterval;
  document.dispatchEvent(new CustomEvent('symbol-changed', {detail: {sym, name: null}}));
  chart.load(sym, int);
  return true;
}
export class Search{
  constructor(input,results,chart,api){
    this.el=input;
    this.res=results;
    this.chart=chart;
    this.api=api;
    this._t=null;
    this._idx=-1;
    input.addEventListener('input',()=>{
      clearTimeout(this._t);
      const q=input.value.trim();
      if(!q) return this._hide();
      this._t=setTimeout(()=>this._search(q),320);
    });
    input.addEventListener('keydown',e=>{
      const items=[...this.res.querySelectorAll('.search-item')];
      switch(e.key){
        case' Escape':this._hide();input.value='';break;
        case'ArrowDown':e.preventDefault();this._setFocus(this._idx+1,items);break;
        case'ArrowUp':e.preventDefault();this._setFocus(this._idx-1,items);break;
        case'Enter':{
          e.preventDefault();
          const f=items[this._idx];
          if(f){this._select(f.dataset.sym,f.dataset.name)}
          else if(items.length){const t=items[0];this._select(t.dataset.sym,t.dataset.name)}
        }
      }
    });
    document.addEventListener('click',e=>{
      if(!e.target.closest('#search-wrap')) this._hide();
    });
  }
  async _search(q){
    this._idx=-1;
    this.res.innerHTML='<div class="search-item">Searching…</div>';
    this.res.classList.add('open');
    const d=await this.api._searchAPI(q);
    if(d.error) return this._showMessage('Search failed','var(--red)');
    const items=(d.results||[]).slice(0,10);
    if(!items.length) return this._showMessage('No results','var(--text3)');
    this.res.innerHTML=items.map(r=>`
      <div class="search-item" data-sym="${r.symbol}" data-name="${r.longname||r.shortname||r.symbol}" data-type="${r.typeDisp||r.quoteType||''}">
        <span class="si-sym">${r.symbol}</span>
        <span class="si-name">${r.longname||r.shortname||''}</span>
        <span class="si-type">${r.typeDisp||r.quoteType||''}</span>
      </div>`).join('');
    this.res.querySelectorAll('.search-item').forEach((el,i)=>{
      el.addEventListener('click',()=>this._select(el.dataset.sym,el.dataset.name));
      el.addEventListener('mouseenter',()=>this._setFocus(i));
    });
  }
  _showMessage(msg,color){
    this.res.innerHTML=`<div class="search-item" style="color:${color}">${msg}</div>`;
  }
  _setFocus(idx,items=[...this.res.querySelectorAll('.search-item')]){
    if(!items.length) return;
    this._idx=Math.max(0,Math.min(items.length-1,idx));
    items.forEach((el,i)=>el.classList.toggle('kb-focus',i===this._idx));
    items[this._idx]?.scrollIntoView({block:'nearest'});
  }
  _select(sym,name){
    this._hide();
    this.el.value='';
    this.chart.load(sym,this.chart._currentInterval);
    document.dispatchEvent(new CustomEvent('symbol-changed',{detail:{sym,name}}));
  }
  _hide(){
    this.res.classList.remove('open');
    this._idx=-1;
    setTimeout(()=>{
      if(!this.res.classList.contains('open')) this.res.innerHTML='';
    },220);
  }
}