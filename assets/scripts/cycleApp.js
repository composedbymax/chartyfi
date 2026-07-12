import { settingsIcon } from './svg.js';
import {toast,deny} from './message.js';
import {PaneManager} from './paneManager.js';
import {storage} from './storage.js';
const PALETTE = ['#3b82f6','#22c55e','#f59e0b','#ef4444','#a78bfa','#06b6d4','#ec4899','#84cc16'];
const DTYPES  = [[0,'HP Filter'],[1,'Boosted HP'],[2,'Spline'],[3,'Polynomial'],[4,'One-Sided HP'],[9,'None']];
async function _callCIC(action, payload, params={}){
  const api_key=storage.getApiKey();
  if(!api_key) return {error:'No API key set. Please configure one in Settings'};
  try{
    const res=await fetch(window.CIC.api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,api_key,params,payload}),});
    const data=await res.json().catch(()=>null);
    if(!res.ok) return {error:data?.error || `Request failed (${res.status})`};
    if(!data) return {error:'Invalid response from server'};
    return data;
  }catch(e){
    return {error:e.message||'Network error'};
  }
}
function _extendTimesForward(times, extraBars){
  if(!extraBars||times.length<2) return times;
  const n=Math.min(30,times.length-1);
  const tail=times.slice(-(n+1));
  const gaps=[];
  for(let i=1;i<tail.length;i++) gaps.push(tail[i]-tail[i-1]);
  const extended=[...times];
  let last=times[times.length-1];
  for(let i=0;i<extraBars;i++){last+=gaps[i%gaps.length];extended.push(last);}
  return extended;
}
function _buildCyclePoints(peak, times, anchorIdx){
  const n=times.length;
  const len=peak.cycleLength;
  const amp=peak.amplitude||0;
  const currentPhase=peak.phase||0;
  const pts=new Array(n);
  for(let i=0;i<n;i++){
    const angle=currentPhase+(2*Math.PI*(i-anchorIdx))/len;
    pts[i]={time:times[i],value:amp*Math.sin(angle)};
  }
  return pts;
}
function _buildCompositePoints(peaks, times, anchorIdx){
  const n=times.length;
  const pts=new Array(n);
  for(let i=0;i<n;i++){
    let v=0;
    for(const p of peaks){
      const angle=(p.phase||0)+(2*Math.PI*(i-anchorIdx))/p.cycleLength;
      v+=(p.amplitude||0)*Math.sin(angle);
    }
    pts[i]={time:times[i],value:v};
  }
  return pts;
}
function _buildStrategyPoints(cycleValues, prices, times, histLen){
  const n=histLen;
  if(n<2||prices.length<n) return [];
  const startPrice=prices[0];
  const pts=new Array(n);
  let equity=startPrice;
  let inMarket=cycleValues[0]>cycleValues[1]?false:true;
  for(let i=0;i<n;i++){
    if(i>0){
      const slope=cycleValues[i]-cycleValues[i-1];
      const wasIn=inMarket;
      inMarket=slope>0;
      if(inMarket&&wasIn){
        const ret=prices[i-1]>0?(prices[i]-prices[i-1])/prices[i-1]:0;
        equity=equity*(1+ret);
      }else if(inMarket&&!wasIn){
        const ret=prices[i-1]>0?(prices[i]-prices[i-1])/prices[i-1]:0;
        equity=equity*(1+ret);
      }
    }
    pts[i]={time:times[i],value:equity};
  }
  return pts;
}
export class CycleApp {
  static config = {
    title: 'Cycle Spectrum',
    description: 'Scan the dominant market cycles and plot them on the chart, individually or as a composite',
    width: 380,
    persistent: true,
  };
  constructor(chart, api){
    this.chart=chart;
    this.api=api;
    this.el=document.createElement('div');
    this._pom=new PaneManager(chart);
    this._result=null;
    this._peaks=null;
    this._scannedBarCount=0;
    this._hasAI=false;
    this._hasStab=false;
    this._group=null;
    this._stratGroup=null;
    this._busy=false;
    this._showParams=false;
    this._mode='individual';
    this._strategyOn=false;
    this._futureProj=20;
    this._params={
      minCycleLength:5,
      maxCycleLength:400,
      bartelsLimit:49,
      cycleResolution:1,
      dType:0,
      amplitudeMulti:1,
      epf:false,
      savgolSmoothing:false,
      sortByStrength:true,
      useStability:true,
      dominantPeakFinder:true,
    };
    this._onDataChanged=()=>{
      if(this._group){this._pom.removeGroup(this._group.id);this._group=null;}
      if(this._stratGroup){this._pom.removeGroup(this._stratGroup.id);this._stratGroup=null;}
      this._result=null;this._peaks=null;this._scannedBarCount=0;this._hasAI=false;this._hasStab=false;
      this._render();
    };
    this.chart._chartOn('dataChanged',this._onDataChanged);
    this._render();
  }
  _getSeriesValues(){
    const mode=storage.getChartMode()||this.chart.mode;
    const raw=this.chart._getRawData();
    if(mode==='line'){
      const field=storage.getChartField()||this.chart.field||'close';
      return raw.map(c=>c[field]??c.close);
    }
    return raw.map(c=>c.close);
  }
  async _scan(){
    const values=this._getSeriesValues();
    if(values.length<100){deny('Need at least 100 bars loaded to scan.');return;}
    this._busy=true;this._render();
    const res=await _callCIC('scan',values,{includeSpectrum:true,...this._params});
    this._busy=false;
    if(res.error){deny(res.error);this._render();return;}
    this._result=res;
    this._scannedBarCount=values.length;
    this._peaks=(res.peaks||[]).map((p,i)=>({...p,_sel:p.dominantRank>=1,_colorIdx:i%PALETTE.length}));
    this._hasAI=this._peaks.some(p=>p.dominantRank>=1);
    this._hasStab=this._peaks.some(p=>p.stabilityScore>0);
    toast(`Found ${this._peaks.length} cycle${this._peaks.length===1?'':'s'}`,'success');
    this._replot();
    this._render();
  }
  async _runPeakFinder(){
    if(!this._result?.spectrum) return;
    const {spectrum,cycleStart,cycleEnd,cycleResolution}=this._result;
    const res=await _callCIC('peaks',{spectrum,cycleStart,cycleEnd,cycleResolution});
    if(res.error) return;
    const dominant=(res.peaks_dominant||[]).map(x=>Math.round(x));
    this._dominantSet=new Set(dominant);
    const rankMap=new Map(dominant.map((v,i)=>[v,i+1]));
    this._peaks.forEach(p=>{
      const key=Math.round(p.cycleLength);
      p._aiRank=rankMap.get(key)||null;
      if(p._aiRank) p._sel=true;
    });
    this._replot();
    this._render();
  }
  _replot(){
    const selected=this._peaks.filter(p=>p._sel);
    if(this._group){this._pom.removeGroup(this._group.id);this._group=null;}
    if(this._stratGroup){this._pom.removeGroup(this._stratGroup.id);this._stratGroup=null;}
    if(!selected.length) return;
    const histTimes=this.chart._getCurrentData().map(c=>c.time);
    const histLen=histTimes.length;
    const anchorIdx=histLen-(histLen-this._scannedBarCount)-1;
    const times=_extendTimesForward(histTimes,this._futureProj);
    let plotFns;
    if(this._mode==='composite'){
      plotFns=[{
        type:'line',
        label:'Composite',
        data:_buildCompositePoints(selected,times,anchorIdx),
        opts:{color:'#a78bfa',lineWidth:2,pane:1},
      }];
    }else{
      plotFns=selected.map((p,i)=>({
        type:'line',
        label:`Cycle ${Math.round(p.cycleLength)}`,
        data:_buildCyclePoints(p,times,anchorIdx),
        opts:{color:PALETTE[p._colorIdx],lineWidth:2,pane:i+1},
      }));
    }
    this._group=this._pom.addGroup(plotFns,'Cycle Spectrum','cic',null);
    if(this._strategyOn) this._replotStrategy(selected,histTimes,histLen,anchorIdx);
  }
  _replotStrategy(selected,histTimes,histLen,anchorIdx){
    if(this._stratGroup){this._pom.removeGroup(this._stratGroup.id);this._stratGroup=null;}
    if(!selected.length) return;
    const prices=this._getSeriesValues().slice(0,histLen);
    let stratFns;
    if(this._mode==='composite'){
      const compPts=_buildCompositePoints(selected,histTimes,anchorIdx);
      const cycleVals=compPts.map(p=>p.value);
      const sData=_buildStrategyPoints(cycleVals,prices,histTimes,histLen);
      if(!sData.length) return;
      stratFns=[{
        type:'line',
        label:'Strategy',
        data:sData,
        opts:{color:'#f59e0b',lineWidth:2,lineStyle:1,pane:0},
      }];
    }else{
      stratFns=selected.map(p=>{
        const cyclePts=_buildCyclePoints(p,histTimes,anchorIdx);
        const cycleVals=cyclePts.map(pt=>pt.value);
        const sData=_buildStrategyPoints(cycleVals,prices,histTimes,histLen);
        return {
          type:'line',
          label:`Strategy ${Math.round(p.cycleLength)}`,
          data:sData,
          opts:{color:PALETTE[p._colorIdx],lineWidth:2,lineStyle:1,pane:0},
        };
      }).filter(f=>f.data.length);
    }
    if(stratFns.length) this._stratGroup=this._pom.addGroup(stratFns,'Cycle Strategy','cic-strat',null);
  }
  _buildSpectrumSvg(){
    const {spectrum,cycleStart,cycleResolution}=this._result;
    if(!spectrum?.length) return '';
    const w=300,h=90;
    const max=Math.max(...spectrum,0.0001);
    const n=spectrum.length;
    const pts=spectrum.map((v,i)=>{
      const x=(i/(n-1))*w;
      const y=h-(v/max)*h;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    }).join(' ');
    const markers=(this._peaks||[]).slice(0,8).map(p=>{
      const idx=(p.cycleLength-cycleStart)/cycleResolution;
      const x=(idx/(n-1))*w;
      return `<line x1="${x.toFixed(2)}" y1="0" x2="${x.toFixed(2)}" y2="${h}" class="cic-peak-line"/>`;
    }).join('');
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="cic-spectrum-svg">${markers}<polyline points="${pts}" class="cic-spectrum-line"/></svg>`;
  }
  _paramsPanel(){
    const p=this._params;
    const div=document.createElement('div');
    div.className='cic-params';
    div.innerHTML=`
      <div class="cic-params-grid">
        <label for="cic-min">Min Length<input type="number" id="cic-min" value="${p.minCycleLength}" min="2"></label>
        <label for="cic-max">Max Length<input type="number" id="cic-max" value="${p.maxCycleLength}" min="2"></label>
        <label for="cic-bartels">Bartels Limit<input type="number" id="cic-bartels" value="${p.bartelsLimit}" min="0" max="100"></label>
        <label for="cic-res">Resolution
          <select id="cic-res">
            <option value="1" ${p.cycleResolution===1?'selected':''}>1.0</option>
            <option value="0.1" ${p.cycleResolution===0.1?'selected':''}>0.1</option>
          </select>
        </label>
        <label for="cic-dtype">Detrend
          <select id="cic-dtype">
            ${DTYPES.map(([v,l])=>`<option value="${v}" ${p.dType===v?'selected':''}>${l}</option>`).join('')}
          </select>
        </label>
        <label for="cic-ampmulti">Amp Multi<input type="number" id="cic-ampmulti" value="${p.amplitudeMulti}" step="0.1" min="0.01"></label>
        <label for="cic-futureproj">Future Bars<input type="number" id="cic-futureproj" value="${this._futureProj}" min="0" max="500"></label>
      </div>
      <div class="cic-params-flags">
        <label><input type="checkbox" id="cic-epf" ${p.epf?'checked':''}> Endpoint flattening</label>
        <label><input type="checkbox" id="cic-savgol" ${p.savgolSmoothing?'checked':''}> Savitzky-Golay smoothing</label>
        <label><input type="checkbox" id="cic-sort" ${p.sortByStrength?'checked':''}> Sort by strength</label>
      </div>`;
    div.querySelector('#cic-min').onchange=e=>p.minCycleLength=+e.target.value||5;
    div.querySelector('#cic-max').onchange=e=>p.maxCycleLength=+e.target.value||400;
    div.querySelector('#cic-bartels').onchange=e=>p.bartelsLimit=+e.target.value||0;
    div.querySelector('#cic-res').onchange=e=>p.cycleResolution=+e.target.value;
    div.querySelector('#cic-dtype').onchange=e=>p.dType=+e.target.value;
    div.querySelector('#cic-ampmulti').onchange=e=>p.amplitudeMulti=+e.target.value||1;
    div.querySelector('#cic-futureproj').onchange=e=>{this._futureProj=Math.max(0,+e.target.value||0);this._replot();};
    div.querySelector('#cic-epf').onchange=e=>p.epf=e.target.checked;
    div.querySelector('#cic-savgol').onchange=e=>p.savgolSmoothing=e.target.checked;
    div.querySelector('#cic-sort').onchange=e=>p.sortByStrength=e.target.checked;
    return div;
  }
  _peaksListHTML(){
    return this._peaks.map((p,i)=>{
      const phaseCls=(p.phaseStatus||'').toLowerCase();
      const ai=this._hasAI?`<span class="cic-peak-ai-rank">${p.dominantRank>=1?p.dominantRank:''}</span>`:'';
      const stab=this._hasStab?`<span>${p.stabilityScore>0?p.stabilityScore.toFixed(2):''}</span>`:'';
      const rowCls=`cic-peak-row${this._hasAI?'':' no-ai'}${this._hasStab?'':' no-stab'}`;
      return `<div class="${rowCls}" data-i="${i}">
        <input type="checkbox" class="cic-peak-chk" ${p._sel?'checked':''}>
        <span class="cic-color-dot cic-c${p._colorIdx}"></span>
        <span class="cic-peak-len">${Math.round(p.cycleLength)}</span>
        ${ai}
        ${stab}
        <span class="cic-peak-strength">${Math.round((p.strength||0)*100)}%</span>
        <span class="cic-peak-bartels">${p.bartelsValue!=null?p.bartelsValue.toFixed(1):'-'}</span>
        <span class="cic-peak-phase ${phaseCls}">${p.phaseStatus||''}</span>
      </div>`;
    }).join('');
  }
  _bindPeakEvents(list){
    list.querySelectorAll('.cic-peak-row').forEach(row=>{
      const i=+row.dataset.i;
      row.querySelector('.cic-peak-chk').onchange=e=>{
        this._peaks[i]._sel=e.target.checked;
        this._replot();
      };
      row.querySelector('.cic-color-dot').onclick=()=>{
        this._peaks[i]._colorIdx=(this._peaks[i]._colorIdx+1)%PALETTE.length;
        this._render();
      };
    });
  }
  _render(){
    this.el.innerHTML='';
    const wrap=document.createElement('div');
    wrap.className='cic-wrap';
    const scanRow=document.createElement('div');
    scanRow.className='cic-row';
    const scanBtn = document.createElement('button');
    scanBtn.className = 'btn-primary btn-full-width cic-scan-btn';
    scanBtn.disabled = this._busy;
    scanBtn.textContent = this._busy ? 'Scanning…' : 'Scan Spectrum';
    const paramsBtn = document.createElement('button');
    paramsBtn.className = 'icon-btn cic-params-toggle';
    paramsBtn.title = 'Parameters';
    paramsBtn.appendChild(settingsIcon({ className: 'icon' }));
    scanBtn.onclick = () => this._scan();
    paramsBtn.onclick = () => {
      this._showParams = !this._showParams;
      this._render();
    };
    scanRow.appendChild(scanBtn);
    scanRow.appendChild(paramsBtn);
        wrap.appendChild(scanRow);
    if(this._showParams) wrap.appendChild(this._paramsPanel());
    if(!this._result){
      const empty=document.createElement('div');
      empty.className='cic-empty';
      empty.textContent='Run a scan to detect dominant market cycles in the current chart.';
      wrap.appendChild(empty);
    }else{
      const info=document.createElement('div');
      info.className='cic-info';
      info.innerHTML=`<span>${this._result.datapoints} bars</span><span>Range ${this._result.range}</span><span>${this._peaks.length} cycle${this._peaks.length===1?'':'s'}</span>`;
      wrap.appendChild(info);
      const specWrap=document.createElement('div');
      specWrap.className='cic-spectrum';
      specWrap.innerHTML=this._buildSpectrumSvg();
      wrap.appendChild(specWrap);
      if(!this._peaks.length){
        const e=document.createElement('div');e.className='cic-empty';e.textContent='No cycles met the Bartels threshold.';
        wrap.appendChild(e);
      }else{
        const modeRow=document.createElement('div');
        modeRow.className='cic-mode-row';
        modeRow.innerHTML=`<button class="cic-mode-btn ${this._mode==='individual'?'active':''}" data-mode="individual">Individual</button>
          <button class="cic-mode-btn ${this._mode==='composite'?'active':''}" data-mode="composite">Composite</button>`;
        modeRow.querySelectorAll('.cic-mode-btn').forEach(b=>b.onclick=()=>{this._mode=b.dataset.mode;this._replot();this._render();});
        wrap.appendChild(modeRow);
        const stratRow=document.createElement('div');
        stratRow.className='cic-mode-row';
        stratRow.innerHTML=`<button class="cic-mode-btn ${this._strategyOn?'active':''}" data-strat="on">Strategy On</button>
          <button class="cic-mode-btn ${!this._strategyOn?'active':''}" data-strat="off">Strategy Off</button>`;
        stratRow.querySelectorAll('.cic-mode-btn').forEach(b=>b.onclick=()=>{
          this._strategyOn=b.dataset.strat==='on';
          this._replot();
          this._render();
        });
        wrap.appendChild(stratRow);
        const lbl=document.createElement('div');lbl.className='sb-label';lbl.textContent='Detected Cycles';
        wrap.appendChild(lbl);
        const head=document.createElement('div');
        head.className=`cic-peak-row cic-peak-head${this._hasAI?'':' no-ai'}${this._hasStab?'':' no-stab'}`;
        head.innerHTML=`<span></span><span></span><span>Len</span>${this._hasAI?'<span>AI</span>':''}${this._hasStab?'<span>Stab</span>':''}<span>Str</span><span>Bartels</span><span>Phase</span>`;
        wrap.appendChild(head);
        const list=document.createElement('div');
        list.className='cic-peak-list';
        list.innerHTML=this._peaksListHTML();
        wrap.appendChild(list);
        this._bindPeakEvents(list);
      }
    }
    this.el.appendChild(wrap);
  }
  destroy(){
    if(this._group){this._pom.removeGroup(this._group.id);this._group=null;}
    if(this._stratGroup){this._pom.removeGroup(this._stratGroup.id);this._stratGroup=null;}
  }
}