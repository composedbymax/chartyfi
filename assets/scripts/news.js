import {attachSpinner} from "./spinner.js";
export class News {
  static config={
    title:'News',
    description:'Latest news headlines for the current chart symbol',
    width:'65vw',
    mobileWidth:'70vw',
    suspendIndicators:false
  };
  constructor(chart,api){
    this.chart=chart;
    this.api=api;
    this.el=document.createElement('div');
    this.el.className='flex flex-col h-full min-h-0 relative';
    this.content=document.createElement('div');
    this.content.className='tab-page';
    this.el.appendChild(this.content);
    this.loaderLayer=document.createElement('div');
    this.loaderLayer.className='loader-layer';
    this.el.appendChild(this.loaderLayer);
    this.spinner=attachSpinner(this.loaderLayer, {size:40,color:"var(--accent)"});
    this.spinner.hide();
    this._offset=0;
    this._total=0;
    this._controller=null;
    this._render();
  }
  _apiBase(){
    return window.NWS?.api;
  }
  async _fetch(offset){
    if(this._controller) this._controller.abort();
    this._controller=new AbortController();
    const sym=this.chart._currentSymbol;
    if(!sym) return null;
    try {
      const r=await fetch(
        this._apiBase(),
        {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({symbol:sym,offset}), signal:this._controller.signal}
      );
      return await r.json();
    }catch(e){
      if(e.name==='AbortError') return null;
      return null;
    }
  }
  async _render(){
    const sym=this.chart._currentSymbol;
    if(!sym){
      this.content.innerHTML=`<div class="empty-note">No symbol loaded.</div>`;
      this._removeLoader();
      return;
    }
    this.spinner.show();
    this.content.innerHTML='';
    this._offset=0;
    const d=await this._fetch(0);
    this._removeLoader();
    if(!d){
      this.content.innerHTML=`<div class="empty-note empty-note--error">Failed to load news.</div>`;
      return;
    }
    this._total=d.total||0;
    this._offset=d.items?.length || 0;
    const list=document.createElement('div');
    list.className='flex-column mt--8';
    this.content.appendChild(list);
    this._appendItems(list, d.items || []);
    this._appendMoreBtn(list);
  }
  _removeLoader(){
    if(this.loaderLayer){
      this.spinner.destroy();
      this.loaderLayer.remove();
      this.loaderLayer=null;
    }
  }
  _appendItems(list,items){
    if(!items.length){
      const e=document.createElement('div');
      e.className='empty-note';
      e.textContent='No news found.';
      list.appendChild(e);
      return;
    }
    items.forEach(n=>{
      const item=document.createElement('div');
      item.className='p-10-12 border-b';
      const a=document.createElement('a');
      a.href=n.link;
      a.target='_blank';
      a.rel='noopener noreferrer';
      a.className='text-12 fw-600 text-accent leading-normal';
      a.textContent=n.title;
      const meta=document.createElement('div');
      meta.className='text-10 text-muted mb-8';
      meta.textContent=`${n.source?n.source +'•':''}${n.pubDate}`;
      const desc=document.createElement('div');
      desc.className='text-11 text-secondary leading-normal';
      desc.textContent=n.description||'';
      item.appendChild(a);
      item.appendChild(meta);
      if(n.description) item.appendChild(desc);
      list.appendChild(item);
    });
  }
  _appendMoreBtn(list){
    const existing=list.querySelector('.btn-block-plain');
    if(existing) existing.remove();
    if(this._offset>=this._total)return;
    const remaining=this._total-this._offset;
    const btn=document.createElement('button');
    btn.className='btn-block-plain';
    btn.textContent=`Load more (${remaining} remaining)`;
    btn.onclick=async ()=>{
      btn.disabled=true;
      btn.textContent='Loading…';
      const loaderLayer=document.createElement('div');
      loaderLayer.className='loader-layer';
      this.el.appendChild(loaderLayer);
      const spinner=attachSpinner(loaderLayer, {size:40,color:"var(--accent)"});
      spinner.show();
      const d=await this._fetch(this._offset);
      spinner.destroy();
      loaderLayer.remove();
      if(!d){
        btn.textContent='Error – try again';
        btn.disabled=false;
        return;
      }
      this._offset+=d.items?.length||0;
      btn.remove();
      this._appendItems(list,d.items||[]);
      this._appendMoreBtn(list);
    };
    list.appendChild(btn);
  }
  destroy(){
    if(this._controller) this._controller.abort();
    if(this.loaderLayer){
      this.spinner.destroy();
      this.loaderLayer.remove();
    }
  }
}