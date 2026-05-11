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
    this.el.className='da-wrap';
    this.content=document.createElement('div');
    this.el.appendChild(this.content);
    const loaderLayer=document.createElement('div');
    loaderLayer.className='nws-loader-layer';
    this.el.appendChild(loaderLayer);
    this.spinner=attachSpinner(loaderLayer, {size:40,color:"var(--accent)"});
    this.spinner.hide();
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
        `${this._apiBase()}?symbol=${encodeURIComponent(sym)}&offset=${offset}`,
        { signal:this._controller.signal }
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
      this.content.innerHTML=`<div class="da-empty">No symbol loaded.</div>`;
      return;
    }
    this.spinner.show();
    this.content.innerHTML='';
    this._offset=0;
    const d=await this._fetch(0);
    this.spinner.hide();
    if(!d){
      this.content.innerHTML=`<div class="da-empty">Failed to load news.</div>`;
      return;
    }
    this._total=d.total||0;
    this._offset=d.items?.length || 0;
    const list=document.createElement('div');
    list.className='nws-list';
    this.content.appendChild(list);
    this._appendItems(list, d.items || []);
    this._appendMoreBtn(list);
  }
  _appendItems(list,items){
    if(!items.length){
      const e=document.createElement('div');
      e.className='da-empty';
      e.textContent='No news found.';
      list.appendChild(e);
      return;
    }
    items.forEach(n=>{
      const item=document.createElement('div');
      item.className='nws-item';
      const a=document.createElement('a');
      a.href=n.link;
      a.target='_blank';
      a.rel='noopener noreferrer';
      a.className='nws-title';
      a.textContent=n.title;
      const meta=document.createElement('div');
      meta.className='nws-meta';
      meta.textContent=`${n.source?n.source +'•':''}${n.pubDate}`;
      const desc=document.createElement('div');
      desc.className='nws-desc';
      desc.textContent=n.description||'';
      item.appendChild(a);
      item.appendChild(meta);
      if(n.description) item.appendChild(desc);
      list.appendChild(item);
    });
  }
  _appendMoreBtn(list){
    const existing=list.querySelector('.nws-more-btn');
    if(existing) existing.remove();
    if(this._offset>=this._total)return;
    const remaining=this._total-this._offset;
    const btn=document.createElement('button');
    btn.className='nws-more-btn btn-sm';
    btn.textContent=`Load more (${remaining} remaining)`;
    btn.onclick=async ()=>{
      btn.disabled=true;
      btn.textContent='Loading…';
      this.spinner.show();
      const d=await this._fetch(this._offset);
      this.spinner.hide();
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
    this.spinner.destroy();
  }
}