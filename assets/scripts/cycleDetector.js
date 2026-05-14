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

  // 1. Log-price transform — correct domain for multiplicative price processes;
  //    makes cycles additive in log-return space and stabilises variance.
  const logP=new Float64Array(n);
  for(let i=0;i<n;i++) logP[i]=Math.log(Math.max(closes[i],1e-10));

  // 2. Linear detrend on log prices (OLS slope/intercept).
  let sx=0,sy=0,sxy=0,sxx=0;
  for(let i=0;i<n;i++){sx+=i;sy+=logP[i];sxy+=i*logP[i];sxx+=i*i;}
  const D=n*sxx-sx*sx;
  const slope=D?(n*sxy-sx*sy)/D:0;
  const intercept=(sy-slope*sx)/n;
  const detrended=new Float64Array(n);
  for(let i=0;i<n;i++) detrended[i]=logP[i]-(slope*i+intercept);

  // Total variance of detrended series — used for R² computation on the client.
  let detMean=0;
  for(let i=0;i<n;i++) detMean+=detrended[i];
  detMean/=n;
  let totalVar=0;
  for(let i=0;i<n;i++) totalVar+=(detrended[i]-detMean)**2;

  // 3. Hann window — tapers both ends to zero, eliminating the spectral leakage
  //    caused by the implicit rectangular window of a finite DFT.
  //    coherent gain = windowSum/n ≈ 0.5, so amplitude = 2·|X[k]|/windowSum.
  const windowed=new Float64Array(n);
  let windowSum=0;
  for(let i=0;i<n;i++){
    const w=0.5*(1-Math.cos(2*Math.PI*i/(n-1)));
    windowed[i]=detrended[i]*w;
    windowSum+=w;
  }

  // 4. Zero-pad to next power of 2 (FFT radix-2 requirement).
  let N=1; while(N<n) N<<=1;
  const re=new Float64Array(N);
  const im=new Float64Array(N);
  for(let i=0;i<n;i++) re[i]=windowed[i];
  fft(re,im);

  const half=Math.floor(N/2);
  const mag=new Float64Array(half);
  for(let k=1;k<half;k++){
    const p=N/k;
    if(p>=minPeriod&&p<=maxPeriod)
      mag[k]=Math.sqrt(re[k]*re[k]+im[k]*im[k]);
  }

  // 5. Median-based noise floor — robust against outlier peaks unlike mean;
  //    the median of all valid magnitudes approximates the spectral noise level.
  const allMags=[];
  for(let k=1;k<half;k++) if(mag[k]>0) allMags.push(mag[k]);
  allMags.sort((a,b)=>a-b);
  const noiseFloor=allMags.length?allMags[Math.floor(allMags.length/2)]:1;

  // 6. Local-maxima peak detection with per-peak SNR.
  const peaks=[];
  for(let k=2;k<half-1;k++){
    if(mag[k]>0&&mag[k]>mag[k-1]&&mag[k]>mag[k+1]){
      const period=N/k;
      if(period<minPeriod||period>maxPeriod) continue;
      // Hann-corrected amplitude: A = 2·|X[k]| / windowSum
      const amp=2*mag[k]/windowSum;
      const phase=Math.atan2(im[k],re[k]);
      const snr=mag[k]/noiseFloor;
      peaks.push({k,period,mag:mag[k],amp,phase,snr});
    }
  }
  peaks.sort((a,b)=>b.mag-a.mag);
  const top=peaks.slice(0,topN);
  const totalMag=top.reduce((s,p)=>s+p.mag,0)||1;

  // 7. Build cycle objects.
  const cycles=top.map(p=>{
    const wave=new Array(n);
    for(let i=0;i<n;i++)
      wave[i]=p.amp*Math.cos(2*Math.PI*p.k*i/N+p.phase);

    // Phase at the last bar, normalised to [0, 2π).
    const dTheta=2*Math.PI*p.k/N;          // phase advance per bar
    const lastArg=2*Math.PI*p.k*(n-1)/N+p.phase;
    const theta=((lastArg%(2*Math.PI))+(2*Math.PI))%(2*Math.PI);

    // Bars to next peak  (cos-argument reaches next 2πm).
    const distToPeak=(2*Math.PI-theta)%(2*Math.PI);
    const barsToPeak=+(distToPeak/dTheta).toFixed(1);

    // Bars to next trough (cos-argument reaches next π + 2πm).
    const distToTrough=((Math.PI-theta)+(2*Math.PI))%(2*Math.PI);
    const barsToTrough=+(distToTrough/dTheta).toFixed(1);

    // Where in the cycle are we? (0 = peak, 50 = trough, 100 = peak again)
    const cycleProgress=Math.round(theta/(2*Math.PI)*100);

    const confidence=p.snr>=6?'high':p.snr>=2.5?'med':'low';

    return{
      period:Math.round(p.period*10)/10,
      amp:p.amp,
      strength:Math.round((p.mag/totalMag)*1000)/10,
      snr:Math.round(p.snr*10)/10,
      confidence,
      barsToPeak,
      barsToTrough,
      cycleProgress,
      wave
    };
  });

  // Return detrended series for client-side R² computation.
  self.postMessage({cycles,detrended:Array.from(detrended),totalVar});
  self.close();
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
    this._detrended=null;
    this._totalVar=0;
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
        this._updateR2Display();
        this._syncChart();
      };
    });
    this.el.appendChild(modeRow);

    // R² row — only visible in composite mode when cycles are selected.
    const r2Row=document.createElement('div');
    r2Row.id='cd-r2';
    r2Row.className='cd-r2-row';
    this.el.appendChild(r2Row);

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

  // Recompute and display R² of selected composite vs detrended prices.
  _updateR2Display(){
    const el=this.el.querySelector('#cd-r2');
    if(!el) return;
    if(this._mode!=='composite'||!this._active.size||!this._detrended||!this._totalVar){
      el.textContent='';
      return;
    }
    const comp=new Array(this._chartData.length).fill(0);
    this._active.forEach(i=>this._cycles[i].wave.forEach((v,j)=>comp[j]+=v));
    let ssRes=0;
    for(let i=0;i<this._detrended.length;i++)
      ssRes+=(this._detrended[i]-comp[i])**2;
    const r2=Math.max(0,Math.round((1-ssRes/this._totalVar)*1000)/10);
    el.textContent=`R² = ${r2}% of detrended variance explained`;
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
      this._detrended=e.data.detrended;
      this._totalVar=e.data.totalVar;
      this._renderResults();
    };
    this._worker.onerror=err=>{
      if(this._destroyed) return;
      this._worker.terminate();
      this._worker=null;
      this._setStatus('Error: '+err.message);
    };
    this._worker.postMessage({
      closes:data.map(b=>b.close),
      minPeriod:4,
      maxPeriod:Math.floor(data.length/2),
      topN:6
    });
  }

  _renderResults(){
    const el=this.el.querySelector('#cd-results');
    if(!el) return;
    el.innerHTML='';
    const cycles=this._cycles;
    if(!cycles.length){el.innerHTML='<div class="cd-empty">No cycles detected.</div>';return;}

    // Dominant cycle summary bar.
    const dom=cycles[0];
    const domNear=Math.min(dom.barsToPeak,dom.barsToTrough);
    const domIsPeak=dom.barsToPeak<=dom.barsToTrough;
    const domTurnCls=domIsPeak?'cd-turn--up':'cd-turn--down';
    const domLine=document.createElement('div');
    domLine.className='cd-dominant';
    domLine.innerHTML=`
      <div class="cd-dominant-left">
        <span class="cd-dominant-label">Dominant</span>
        <span class="cd-dominant-val">${dom.period} bars</span>
        <span class="cd-dominant-str">${dom.strength}% power</span>
      </div>
      <span class="cd-dominant-turn ${domTurnCls}" title="${domIsPeak?'Peak':'Trough'} projected in ${domNear} bars">
        ${domIsPeak?'&#8593;':'&#8595;'}&thinsp;${domNear}b
      </span>`;
    el.appendChild(domLine);

    // Column header.
    const hdr=document.createElement('div');
    hdr.className='cd-row cd-row--hdr';
    hdr.innerHTML='<span></span><span>Period</span><span>Power</span><span>Conf</span><span>Turn</span>';
    el.appendChild(hdr);

    // One row per detected cycle.
    cycles.forEach((c,i)=>{
      const row=document.createElement('div');
      row.className='cd-row'+(this._active.has(i)?' cd-row--active':'');

      const sw=document.createElement('span');
      sw.className='cd-swatch';
      sw.style.background=COLORS[i%COLORS.length];

      const periodEl=document.createElement('span');
      periodEl.textContent=c.period+'b';

      const strEl=document.createElement('span');
      strEl.textContent=c.strength+'%';

      // Confidence badge — derived from SNR vs median noise floor.
      // high ≥ 6×, med ≥ 2.5×, low < 2.5×
      const confEl=document.createElement('span');
      confEl.className=`cd-conf cd-conf--${c.confidence}`;
      confEl.textContent=c.confidence==='high'?'HI':c.confidence==='med'?'MD':'LO';
      confEl.title=`SNR ${c.snr}\u00d7 noise floor \u00b7 ${c.cycleProgress}% through cycle`;

      // Next turning point — nearest of projected peak or trough.
      const nearBars=Math.min(c.barsToPeak,c.barsToTrough);
      const isPeak=c.barsToPeak<=c.barsToTrough;
      const turnEl=document.createElement('span');
      turnEl.className=`cd-turn ${isPeak?'cd-turn--up':'cd-turn--down'}`;
      turnEl.textContent=`${isPeak?'\u2191':'\u2193'} ${nearBars}b`;
      turnEl.title=`Peak in ${c.barsToPeak}b \u00b7 Trough in ${c.barsToTrough}b`;

      row.append(sw,periodEl,strEl,confEl,turnEl);
      row.onclick=()=>{
        if(this._active.has(i)) this._active.delete(i);
        else this._active.add(i);
        row.classList.toggle('cd-row--active',this._active.has(i));
        this._syncChart();
        this._updateR2Display();
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
      this._pom.addGroup(
        [{type:'line',label:'Composite',data:plotData,opts:{color:'#e2e8f0',lineWidth:2,pane:1}}],
        'Composite','','#e2e8f0',true
      );
    }else{
      this._active.forEach(i=>{
        const c=this._cycles[i];
        const col=COLORS[i%COLORS.length];
        const plotData=c.wave.map((v,j)=>({time:data[j].time,value:v})).filter(p=>isFinite(p.value));
        this._pom.addGroup(
          [{type:'line',label:`~${c.period}b`,data:plotData,opts:{color:col,lineWidth:1,pane:1}}],
          `Cycle ~${c.period}`,'',col,true
        );
      });
    }
  }

  destroy(){
    if(this._worker){this._worker.terminate();this._worker=null;}
    this._pom.clearAll();
    this._destroyed=true;
  }
}