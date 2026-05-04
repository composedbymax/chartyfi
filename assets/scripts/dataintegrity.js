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
    const sym=this.chart._currentSymbol;
    const int=this.chart._currentInterval;
    const data=this.chart._getCurrentData();
    if(!sym||!int||!data||!data.length){this.el.innerHTML=`<div class="da-empty">No chart data loaded.</div>`;return}
    const intervalSec=INTERVALS_S[int]||0;
    const detected=detectAssetType(sym,intervalSec);
    const gaps=findGaps(data,intervalSec,detected.type);
    const totalBars=data.length;
    const span=data[data.length-1].time-data[0].time;
    const spanDays=Math.round(span/86400);
    const totalMissed=gaps.reduce((s,g)=>s+g.missed,0);
    const confidenceBadge=detected.confidence==='high'?`<span class="da-badge da-badge--ok">high confidence</span>`:`<span class="da-badge da-badge--warn">low confidence</span>`;
    const typeBadge=detected.type==='crypto'?`<span class="da-badge da-badge--crypto">⟳ 24/7</span>`:detected.type==='equity'?`<span class="da-badge da-badge--equity">Market Hours</span>`:`<span class="da-badge da-badge--warn">? Unknown</span>`;
    const integrityPct=totalBars>0?Math.max(0,Math.min(100,100-((totalMissed/(totalBars+totalMissed))*100))).toFixed(1):100;
    const healthColor=integrityPct>=99?'var(--green)':integrityPct>=95?'var(--yellow)':'var(--red)';
    const gapHtml=!gaps.length?`<div class="da-no-gaps">✓ No gaps detected</div>`:`${gaps.slice(0,30).map(g=>`<div class="da-gap-row"><div class="da-gap-range">${fmtDate(g.fromDate)} → ${fmtDate(g.toDate)}</div><div class="da-gap-missed">${g.missed} bar${g.missed>1?'s':''} missing</div></div>`).join('')}${gaps.length>30?`<div class="da-gap-more">…and ${gaps.length-30} more gaps</div>`:''}`;
    this.el.innerHTML=`<div class="da-section"><div class="da-row"><span class="da-key">Symbol</span><span class="da-val">${sym}</span></div><div class="da-row"><span class="da-key">Interval</span><span class="da-val">${int}</span></div><div class="da-row"><span class="da-key">Session Type</span><span class="da-val">${typeBadge} ${confidenceBadge}</span></div><div class="da-row"><span class="da-key">Bars Loaded</span><span class="da-val">${totalBars.toLocaleString()}</span></div><div class="da-row"><span class="da-key">Span</span><span class="da-val">~${spanDays} days</span></div></div><div class="da-divider"></div><div class="da-section"><div class="da-integrity-label"><span>Data Integrity</span><span style="color:${healthColor}">${integrityPct}%</span></div><div class="da-bar-track"><div class="da-bar-fill" style="width:${integrityPct}%;background:${healthColor}"></div></div>${totalMissed>0?`<div class="da-missed-summary">${totalMissed} missing bar${totalMissed>1?'s':''} across ${gaps.length} gap${gaps.length>1?'s':''}</div>`:''}</div>${gaps.length?`<div class="da-divider"></div><div class="da-section da-gaps-section"><div class="da-gaps-title">Detected Gaps</div>${gapHtml}</div>`:''}${detected.note?`<div class="da-note">${detected.note}</div>`:''}`;
  }
  destroy(){this._destroyed=true}
}