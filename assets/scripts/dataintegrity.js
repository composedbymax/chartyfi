import {INTERVALS_S} from './chart.js';
const MARKET_SUFFIX_RE=/\.[A-Z]{2,}$/;
const PAIR_RE=/^[A-Z0-9]{2,12}([:/\-])[A-Z0-9]{2,12}$/;
function detectAssetType(symbol, intervalSec){
  if(!symbol) return {type:'unknown', confidence:'low'};
  const upper = symbol.toUpperCase();
  const parts = upper.split(':');
  const ticker = parts[parts.length-1];
  if(PAIR_RE.test(upper)) return {type:'crypto', confidence:'medium'};
  if(MARKET_SUFFIX_RE.test(upper)) return {type:'equity', confidence:'high'};
  if(/^[A-Z0-9]{1,6}$/.test(ticker) && !PAIR_RE.test(upper))
    return {type:'equity', confidence: intervalSec >= 86400 ? 'medium' : 'medium'};
  return {type:'unknown', confidence:'low'};
}
function countWeekdaysBetween(fromSec, toSec){
  let count = 0;
  const d = new Date(fromSec * 1000);
  d.setUTCHours(0,0,0,0);
  d.setUTCDate(d.getUTCDate() + 1);
  const end = new Date(toSec * 1000);
  end.setUTCHours(0,0,0,0);
  while(d < end){
    const dow = d.getUTCDay();
    if(dow !== 0 && dow !== 6) count++;
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return count;
}
function findGaps(data, intervalSec, assetType){
  if(!data || data.length < 2 || !intervalSec) return [];
  const gaps = [];
  const tolerance = Math.floor(intervalSec * 0.5);
  const isDaily = intervalSec >= 86400;
  for(let i = 1; i < data.length; i++){
    const prev = data[i-1].time;
    const curr = data[i].time;
    const diff = curr - prev;
    if(diff <= intervalSec + tolerance) continue;
    const missed = Math.round(diff / intervalSec) - 1;
    if(missed < 1) continue;
    if(assetType === 'equity'){
      if(isDaily){
        const expectedTradingDays = countWeekdaysBetween(prev, curr);
        if(expectedTradingDays === 0) continue;
        if(missed <= (Math.round(diff / 86400) - expectedTradingDays)) continue;
        gaps.push({from:prev, to:curr, missed: expectedTradingDays,
          fromDate: new Date(prev*1000), toDate: new Date(curr*1000)});
        continue;
      } else {
        let marketBarsMissed = 0;
        for(let t = prev + intervalSec; t < curr; t += intervalSec){
          const d = new Date(t * 1000);
          const dow = d.getUTCDay();
          const hour = d.getUTCHours();
          if(dow !== 0 && dow !== 6 && hour >= 9 && hour < 16) marketBarsMissed++;
        }
        if(marketBarsMissed === 0) continue;
        gaps.push({from:prev, to:curr, missed: marketBarsMissed,
          fromDate: new Date(prev*1000), toDate: new Date(curr*1000)});
        continue;
      }
    }
    gaps.push({from:prev, to:curr, missed,
      fromDate: new Date(prev*1000), toDate: new Date(curr*1000)});
  }
  return gaps;
}
function fmtDate(d){return d.toISOString().replace('T',' ').slice(0,16)+'Z'}
export class DataIntegrity{
  static config={title:'Data Integrity',description:'Detects gaps and session anomalies in loaded chart data',width:'45vw',mobileWidth:'50vw'};
  constructor(chart,api){
    this.chart=chart;
    this.api=api;
    this.el=document.createElement('div');
    this.el.className='da-wrap';
    this._destroyed=false;
    this._render();
  }
  _render(){
    const sym=this.chart._currentSymbol,int=this.chart._currentInterval,data=this.chart._getCurrentData();
    this.el.replaceChildren();
    if(!sym||!int||!data||!data.length){
      const e=document.createElement('div');e.className='da-empty';e.textContent='No chart data loaded.';this.el.appendChild(e);return;
    }
    const s=INTERVALS_S[int]||0,d=detectAssetType(sym,s),g=findGaps(data,s,d.type),b=data.length,
    span=Math.round((data[data.length-1].time-data[0].time)/86400),
    miss=g.reduce((a,b)=>a+b.missed,0),
    pct=b>0?Math.max(0,Math.min(100,100-((miss/(b+miss))*100))).toFixed(1):'100',
    col=+pct>=99?'var(--green)':+pct>=95?'var(--yellow)':'var(--red)',
    badge=(c,t)=>{const s=document.createElement('span');s.className=`da-badge ${c}`;s.textContent=t;return s};
    const root=document.createElement('div'),sec=document.createElement('div');sec.className='da-section';
    [['Symbol',sym],['Interval',int],['Bars Loaded',b.toLocaleString()],['Span',`~${span} days`]].forEach(([k,v])=>{
      const r=document.createElement('div');r.className='da-row';
      const k1=document.createElement('span');k1.className='da-key';k1.textContent=k;
      const v1=document.createElement('span');v1.className='da-val';v1.textContent=v;
      r.append(k1,v1);sec.appendChild(r);
    });
    const sr=document.createElement('div'),sk=document.createElement('span'),sv=document.createElement('span');
    sr.className='da-row';sk.className='da-key';sk.textContent='Session Type';sv.className='da-val';
    sv.append(
      d.type==='crypto'?badge('da-badge--crypto','⟳ 24/7'):d.type==='equity'?badge('da-badge--equity','Market Hours'):badge('da-badge--warn','? Unknown'),
      d.confidence==='high'?badge('da-badge--ok','high confidence'):badge('da-badge--warn','low confidence')
    );
    sr.append(sk,sv);sec.appendChild(sr);
    const sec2=document.createElement('div');sec2.className='da-section';
    const l=document.createElement('div');l.className='da-integrity-label';
    const lt=document.createElement('span');lt.textContent='Data Integrity';
    const rt=document.createElement('span');rt.textContent=`${pct}%`;rt.style.color=col;
    l.append(lt,rt);
    const tr=document.createElement('div');tr.className='da-bar-track';
    const f=document.createElement('div');f.className='da-bar-fill';
    f.style.width=`${pct}%`;f.style.background=col;
    tr.appendChild(f);sec2.append(l,tr);
    if(miss){
      const m=document.createElement('div');
      m.className='da-missed-summary';
      m.textContent=`${miss} missing bar${miss>1?'s':''} across ${g.length} gap${g.length>1?'s':''}`;
      sec2.appendChild(m);
    }
    root.appendChild(sec);
    const d1=document.createElement('div');d1.className='da-divider';
    root.appendChild(d1);
    root.appendChild(sec2);
    if(g.length){
      const d2=document.createElement('div');d2.className='da-divider';
      const sec3=document.createElement('div');sec3.className='da-section da-gaps-section';
      const t=document.createElement('div');t.className='da-gaps-title';t.textContent='Detected Gaps';
      const w=document.createElement('div');
    g.slice(0,30).forEach(x=>{
      const r=document.createElement('div');r.className='da-gap-row';
      const a=document.createElement('div');a.className='da-gap-range';a.textContent=`${fmtDate(x.fromDate)} → ${fmtDate(x.toDate)}`;
      const b=document.createElement('div');b.className='da-gap-missed';b.textContent=`${x.missed} bar${x.missed>1?'s':''} missing`;
      r.append(a,b);w.appendChild(r);
    });
    if(g.length>30){
      const m=document.createElement('div');
      m.className='da-gap-more';
      m.textContent=`…and ${g.length-30} more gaps`;
      w.appendChild(m);
    }
    sec3.append(t,w);
    root.append(d2,sec3);
    }
    if(d.note){
      const n=document.createElement('div');
      n.className='da-note';
      n.textContent=d.note;
      root.appendChild(n);
    }
    this.el.appendChild(root);
  }
  destroy(){this._destroyed=true}
}