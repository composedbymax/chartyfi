import {PaneOverlayManager} from './paneOverlayManager.js';
const COLORS=['#a78bfa','#38bdf8','#fb923c','#4ade80','#f472b6','#facc15','#34d399','#f87171','#818cf8','#e879f9'];
const WORKER_SRC=`
function fft(re,im){
  const N=re.length;
  for(let i=1,j=0;i<N;i++){
    let bit=N>>1;
    for(;j&bit;bit>>=1)j^=bit;
    j^=bit;
    if(i<j){let t=re[i];re[i]=re[j];re[j]=t;t=im[i];im[i]=im[j];im[j]=t;}
  }
  for(let len=2;len<=N;len<<=1){
    const ang=-2*Math.PI/len;
    const wRe=Math.cos(ang),wIm=Math.sin(ang);
    for(let i=0;i<N;i+=len){
      let cRe=1,cIm=0;
      for(let j=0;j<len/2;j++){
        const uRe=re[i+j],uIm=im[i+j];
        const vRe=re[i+j+len/2]*cRe-im[i+j+len/2]*cIm;
        const vIm=re[i+j+len/2]*cIm+im[i+j+len/2]*cRe;
        re[i+j]=uRe+vRe;im[i+j]=uIm+vIm;
        re[i+j+len/2]=uRe-vRe;im[i+j+len/2]=uIm-vIm;
        const nr=cRe*wRe-cIm*wIm;cIm=cRe*wIm+cIm*wRe;cRe=nr;
      }
    }
  }
}
self.onmessage=function(e){
  const{closes,minPeriod,maxPeriod,topN}=e.data;
  const n=closes.length;
  let sx=0,sy=0,sxy=0,sxx=0;
  for(let i=0;i<n;i++){sx+=i;sy+=closes[i];sxy+=i*closes[i];sxx+=i*i;}
  const D=n*sxx-sx*sx;
  const slope=D?(n*sxy-sx*sy)/D:0;
  const intercept=(sy-slope*sx)/n;
  const detrended=new Float64Array(n);
  for(let i=0;i<n;i++)detrended[i]=closes[i]-(slope*i+intercept);
  let N=1;while(N<n)N<<=1;
  const re=new Float64Array(N);
  const im=new Float64Array(N);
  for(let i=0;i<n;i++)re[i]=detrended[i];
  fft(re,im);
  const half=Math.floor(N/2);
  const mag=new Float64Array(half);
  for(let k=1;k<half;k++){
    const p=N/k;
    if(p>=minPeriod&&p<=maxPeriod)mag[k]=Math.sqrt(re[k]*re[k]+im[k]*im[k]);
  }
  const peaks=[];
  for(let k=2;k<half-1;k++){
    if(mag[k]>mag[k-1]&&mag[k]>mag[k+1]&&mag[k]>0)
      peaks.push({k,period:N/k,mag:mag[k],amp:(2*mag[k])/n,phase:Math.atan2(im[k],re[k])});
  }
  peaks.sort((a,b)=>b.mag-a.mag);
  const top=peaks.slice(0,topN);
  const totalMag=top.reduce((s,p)=>s+p.mag,0)||1;
  const cycles=top.map(p=>{
    const wave=new Array(n);
    for(let i=0;i<n;i++)wave[i]=p.amp*Math.cos(2*Math.PI*p.k*i/N+p.phase);
    return{period:Math.round(p.period*10)/10,amp:p.amp,strength:Math.round((p.mag/totalMag)*1000)/10,wave};
  });
  self.postMessage({cycles});
};
`;
export class CycleDetector{
  static config={title:'Cycle Detector',description:'FFT-based dominant cycle detection',width:'50vw',mobileWidth:'40vw',suspendIndicators:false};
  constructor(chart,api){
    this.chart=chart;
    this.api=api;
    this.el=document.createElement('div');
    this.el.className='da-wrap';
    this._pom=new PaneOverlayManager(chart);
    this._worker=null;
    this._destroyed=false;
    this._cycles=[];
    this._active=new Set();
    this._mode='individual';
    this._chartData=null;
    this._render();
    this._runAnalysis();
  }
  _render(){
    this.el.innerHTML='';
    const modeRow=document.createElement('div');
    modeRow.className='cd-mode-row';
    modeRow.innerHTML=`<button class="cd-mode-btn${this._mode==='individual'?' cd-mode-btn--active':''}" data-mode="individual">Individual</button><button class="cd-mode-btn${this._mode==='composite'?' cd-mode-btn--active':''}" data-mode="composite">Composite</button>`;
    modeRow.querySelectorAll('.cd-mode-btn').forEach(b=>{
      b.onclick=()=>{
        if(this._mode===b.dataset.mode) return;
        this._mode=b.dataset.mode;
        modeRow.querySelectorAll('.cd-mode-btn').forEach(x=>x.classList.toggle('cd-mode-btn--active',x.dataset.mode===this._mode));
        this._syncChart();
      };
    });
    this.el.appendChild(modeRow);
    const status=document.createElement('div');
    status.id='cd-status';
    status.className='cd-status';
    this.el.appendChild(status);
    const results=document.createElement('div');
    results.id='cd-results';
    results.className='cd-results';
    this.el.appendChild(results);
  }
  _setStatus(msg){
    const el=this.el.querySelector('#cd-status');
    if(el) el.textContent=msg;
  }
  _runAnalysis(){
    const data=this.chart._getCurrentData();
    if(!data||data.length<16){this._setStatus('Not enough data (need \u2265 16 bars)');return;}
    if(this._worker){this._worker.terminate();this._worker=null;}
    this._chartData=data;
    this._active=new Set();
    this._pom.clearAll();
    this._setStatus('Computing\u2026');
    const resultsEl=this.el.querySelector('#cd-results');
    if(resultsEl) resultsEl.innerHTML='';
    const blob=new Blob([WORKER_SRC],{type:'application/javascript'});
    const url=URL.createObjectURL(blob);
    this._worker=new Worker(url);
    URL.revokeObjectURL(url);
    this._worker.onmessage=e=>{
      if(this._destroyed) return;
      this._worker=null;
      this._setStatus('');
      this._cycles=e.data.cycles;
      this._renderResults();
    };
    this._worker.onerror=err=>{
      if(this._destroyed) return;
      this._setStatus('Error: '+err.message);
    };
    this._worker.postMessage({closes:data.map(b=>b.close),minPeriod:4,maxPeriod:Math.floor(data.length/2),topN:6});
  }
  _renderResults(){
    const el=this.el.querySelector('#cd-results');
    if(!el) return;
    el.innerHTML='';
    const cycles=this._cycles;
    if(!cycles.length){el.innerHTML='<div class="cd-empty">No cycles detected.</div>';return;}
    const domLine=document.createElement('div');
    domLine.className='cd-dominant';
    domLine.innerHTML=`<span class="cd-dominant-label">Dominant</span><span class="cd-dominant-val">${cycles[0].period} bars</span><span class="cd-dominant-str">${cycles[0].strength}% power</span>`;
    el.appendChild(domLine);
    const hdr=document.createElement('div');
    hdr.className='cd-row cd-row--hdr';
    hdr.innerHTML='<span></span><span>Period</span><span>Amplitude</span><span>Strength</span>';
    el.appendChild(hdr);
    cycles.forEach((c,i)=>{
      const row=document.createElement('div');
      row.className='cd-row';
      const sw=document.createElement('span');
      sw.className='cd-swatch';
      sw.style.background=COLORS[i%COLORS.length];
      const period=document.createElement('span');period.textContent=c.period+' bars';
      const amp=document.createElement('span');amp.textContent=c.amp.toFixed(4);
      const str=document.createElement('span');str.textContent=c.strength+'%';
      row.append(sw,period,amp,str);
      row.onclick=()=>{
        if(this._active.has(i)) this._active.delete(i);
        else this._active.add(i);
        row.classList.toggle('cd-row--active',this._active.has(i));
        this._syncChart();
      };
      el.appendChild(row);
    });
  }
  _syncChart(){
    this._pom.clearAll();
    const data=this._chartData;
    if(!data||!this._active.size) return;
    if(this._mode==='composite'){
      const comp=new Array(data.length).fill(0);
      this._active.forEach(i=>this._cycles[i].wave.forEach((v,j)=>comp[j]+=v));
      const plotData=comp.map((v,j)=>({time:data[j].time,value:v})).filter(p=>isFinite(p.value));
      this._pom.addGroup([{type:'line',label:'Composite',data:plotData,opts:{color:'#e2e8f0',lineWidth:2,pane:1}}],'Composite','','#e2e8f0',true);
    }else{
      this._active.forEach(i=>{
        const c=this._cycles[i];
        const col=COLORS[i%COLORS.length];
        const plotData=c.wave.map((v,j)=>({time:data[j].time,value:v})).filter(p=>isFinite(p.value));
        this._pom.addGroup([{type:'line',label:`~${c.period}bar`,data:plotData,opts:{color:col,lineWidth:1,pane:1}}],`Cycle ~${c.period}`,'',col,true);
      });
    }
  }
  destroy(){
    if(this._worker){this._worker.terminate();this._worker=null;}
    this._pom.clearAll();
    this._destroyed=true;
  }
}