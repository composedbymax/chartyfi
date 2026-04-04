import {toast} from './message.js';
export class Search {
  constructor(input,results,chart,api) {
    this.el=input;this.res=results;this.chart=chart;this.api=api;
    this._t=null;
    input.addEventListener('input',()=>{
      clearTimeout(this._t);
      const q=input.value.trim();
      if(!q){this._hide();return}
      this._t=setTimeout(()=>this._search(q),320);
    });
    input.addEventListener('keydown',e=>{if(e.key==='Escape'){this._hide();input.value=''}});
    document.addEventListener('click',e=>{if(!e.target.closest('#search-wrap'))this._hide()});
  }
  async _search(q) {
    this.res.innerHTML='<div class="search-item" style="color:var(--text3)">Searching…</div>';
    this.res.style.display='block';
    const d=await this.api.search(q);
    if(d.error){this.res.innerHTML='<div class="search-item" style="color:var(--red)">Search failed</div>';return}
    const items=(d.results||[]).slice(0,10);
    if(!items.length){this.res.innerHTML='<div class="search-item" style="color:var(--text3)">No results</div>';return}
    this.res.innerHTML=items.map(r=>`
      <div class="search-item" data-sym="${r.symbol}" data-name="${r.longname||r.shortname||r.symbol}" data-type="${r.typeDisp||r.quoteType||''}">
        <span class="si-sym">${r.symbol}</span>
        <span class="si-name">${r.longname||r.shortname||''}</span>
        <span class="si-type">${r.typeDisp||r.quoteType||''}</span>
      </div>`).join('');
    this.res.querySelectorAll('.search-item').forEach(el=>{
      el.addEventListener('click',()=>this._select(el.dataset.sym,el.dataset.name));
    });
  }
  _select(sym,name) {
    this._hide();
    this.el.value='';
    document.getElementById('asset-name').textContent=name||sym;
    document.getElementById('asset-sym').textContent=sym;
    this.chart.load(sym,this.chart.currentInterval);
    document.dispatchEvent(new CustomEvent('symbol-changed',{detail:{sym,name}}));
  }
  _hide(){this.res.style.display='none';this.res.innerHTML=''}
}