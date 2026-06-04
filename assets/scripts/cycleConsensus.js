import { storage } from './storage.js';
import { attachSpinner } from './spinner.js';
function scoreClass(score){
  if(score>=25) return 'cc-score-bull';
  if(score<=-25) return 'cc-score-bear';
  return 'cc-score-neutral';
}
function fmtScore(score){
  return typeof score==='number'?score.toFixed(2):'--';
}
export class CycleConsensus{
  static config={title:'Cycle Consensus',description:'Cycle.Tools consensus scoring across multiple bar windows',width:'45vw',mobileWidth:'92vw'};
  constructor(chart,api){
    this.chart=chart;
    this.api=api;
    this.el=document.createElement('div');
    this.el.className='cc-wrap';
    this._destroyed=false;
    this.content=document.createElement('div');
    this.el.appendChild(this.content);
    const loaderLayer=document.createElement('div');
    loaderLayer.className='cc-loader-layer';
    this.el.appendChild(loaderLayer);
    this.spinner=attachSpinner(loaderLayer,{size:40,color:'var(--accent)'});
    this.spinner.hide();
    this._load();
  }
  async _load(){
    const sym=this.chart._currentSymbol;
    const data=this.chart._getCurrentData();
    if(!sym||!data?.length){
      this.content.innerHTML=`<div class="cc-empty">No chart data loaded.</div>`;
      return;
    }
    this.spinner.show();
    this.content.innerHTML='';
    const baseBars=data.length;
    const counts=[
      Math.max(50,baseBars-200),
      baseBars,
      baseBars+200
    ];
    const symbol=`${sym}:YFI`;
    try{
      const results=await Promise.all(counts.map(barCount=>this._fetchConsensus(symbol,barCount)));
      if(this._destroyed) return;
      this.spinner.hide();
      const valid=results.filter(r=>typeof r?.combinedScore==='number');
      const avg=valid.length?valid.reduce((s,r)=>s+r.combinedScore,0)/valid.length:0;
      this.content.innerHTML=`
        <div class="cc-summary">
          <div class="cc-summary-label">Average Consensus</div>
          <div class="cc-summary-score ${scoreClass(avg)}">${fmtScore(avg)}</div>
        </div>
        <div class="cc-grid">
          ${results.map((r,i)=>this._card(r,counts[i])).join('')}
        </div>
      `;
    }catch(e){
      this.spinner.hide();
      this.content.innerHTML=`<div class="cc-empty">Failed to load consensus data.</div>`;
    }
  }
  async _fetchConsensus(symbol,barCount){
    const apiKey=storage.getApiKey();
    const endpoint=`/api/CycleConsensus/score/${symbol}?barCount=${barCount}&api_key=${encodeURIComponent(apiKey||'')}`;
    const url=`${window.CYL.api}?endpoint=${encodeURIComponent(endpoint)}`;
    const res=await fetch(url);
    return await res.json();
  }
  _card(data,barCount){
    if(data?.error){
      return `<div class="cc-card"><div class="cc-card-error">${data.error}</div></div>`;
    }
    const score=data?.combinedScore||0;
    const crsiParts=[
      `${data?.crsiScore??'--'}`,
      data?.crsiSignal?`(${data.crsiSignal})`:'',
      data?.crsiLength?`· p${data.crsiLength}`:'',
      data?.crsiSourceCycleLength?`from ${data.crsiSourceCycleLength}-bar`:''
    ].filter(Boolean).join(' ');
    return `
      <div class="cc-card">
        <div class="cc-card-top">
          <div class="cc-bars">${barCount.toLocaleString()} Bars</div>
          <div class="cc-score ${scoreClass(score)}">${fmtScore(score)}</div>
        </div>
        <div class="cc-signal-grid">
          <div class="cc-signal-row">
            <span class="cc-signal-label">Bias</span>
            <span class="cc-signal-value">Bullish ${fmtScore(data?.bullishConsensus||0)} | Bearish ${fmtScore(data?.bearishConsensus||0)}</span>
          </div>
          <div class="cc-signal-row">
            <span class="cc-signal-label">CRSI</span>
            <span class="cc-signal-value">${crsiParts}</span>
          </div>
          <div class="cc-signal-row">
            <span class="cc-signal-label">Signal</span>
            <span class="cc-signal-value">${data?.signal||data?.crsiSignal||'Unknown'}</span>
          </div>
          <div class="cc-signal-row">
            <span class="cc-signal-label">Bull Cycles</span>
            <span class="cc-signal-value">${data?.bullishCycles?.length?data.bullishCycles.join(', '):'None'}</span>
          </div>
          <div class="cc-signal-row">
            <span class="cc-signal-label">Bear Cycles</span>
            <span class="cc-signal-value">${data?.bearishCycles?.length?data.bearishCycles.join(', '):'None'}</span>
          </div>
        </div>
      </div>
    `;
  }
  destroy(){
    this._destroyed=true;
    this.spinner.destroy();
  }
}