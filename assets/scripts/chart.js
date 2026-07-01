import {toast} from './message.js';
import {offsetMinutesForZone,shiftTimestamp} from './timezone.js';
export const INTERVALS_S={'1m':60,'2m':120,'5m':300,'15m':900,'30m':1800,'1h':3600,'4h':14400,'1d':86400,'1wk':604800,'1mo':2592000,'3mo':7776000};
export const INTERVALS=Object.keys(INTERVALS_S);
export const INITIAL_LIMIT=750;
function _chartOpts(){
  const s=getComputedStyle(document.documentElement);
  const v=n=>s.getPropertyValue(n).trim();
  return{layout:{background:{type:'solid',color:v('--bg2')},textColor:v('--text2')},grid:{vertLines:{color:v('--bg3')},horzLines:{color:v('--bg3')}},timeScale:{timeVisible:true,secondsVisible:false,borderColor:v('--bg5')},rightPriceScale:{borderColor:v('--bg5')},crosshair:{vertLine:{color:v('--bg5')},horzLine:{color:v('--bg5')}},handleScroll:true,handleScale:true};
}
export class Chart{
  constructor(container,api,timezone='UTC'){
    this.container=container;this.api=api;this.sym=null;this._currentName=null;this.int='1d';this.mode='candle';this.field='close';this.volMode='overlay';this._data=[];this._p1=0;this._p2=0;this._chart=null;this._main=null;this._vol=null;this._listeners=[];this._timezone=timezone;this._tzOffsetMin=0;this._indicators=[];this._isDataset=false;this._datasetFull=[];this._savedPaneLayout=null;this._init();
  }
  _tzOffset(iana){if(!iana||iana==='UTC')return 0;try{return offsetMinutesForZone(iana)}catch(e){return 0}}
  _setTimezone(tz){this._timezone=tz;this._tzOffsetMin=this._tzOffset(tz);if(this._data.length)this._apply()}
  _st(unixSec){return shiftTimestamp(unixSec,this._tzOffsetMin)}
  _init(){this._chart=LightweightCharts.createChart(this.container,{..._chartOpts(),width:this.container.clientWidth,height:this.container.clientHeight});new ResizeObserver(()=>this._chart.resize(this.container.clientWidth,this.container.clientHeight)).observe(this.container);this._buildSeries()}
  _applyTheme(){this._chart.applyOptions(_chartOpts())}
  _buildSeries(){
    if(this._main){try{this._chart.removeSeries(this._main)}catch(e){}}
    if(this._vol){try{this._chart.removeSeries(this._vol)}catch(e){}}
    this._vol=null;
    if(this.mode==='candle'){this._main=this._chart.addSeries(LightweightCharts.CandlestickSeries,{upColor:'#22c55e',downColor:'#ef4444',borderUpColor:'#22c55e',borderDownColor:'#ef4444',wickUpColor:'#22c55e',wickDownColor:'#ef4444'})}
    else{this._main=this._chart.addSeries(LightweightCharts.LineSeries,{color:'#3b82f6',lineWidth:2})}
    if(this.volMode!=='off')this._buildVolSeries();
    if(this._data.length)this._apply();
  }
  _buildVolSeries(){
    const paneIdx=this.volMode==='pane'?1:0;
    const opts={priceFormat:{type:'volume'},color:'rgba(100,116,139,0.4)',priceScaleId:paneIdx===0?'vol':''};
    try{this._vol=this._chart.addSeries(LightweightCharts.HistogramSeries,opts,paneIdx)}catch(e){this._vol=this._chart.addSeries(LightweightCharts.HistogramSeries,{...opts,priceScaleId:'vol'})}
    if(paneIdx===0){try{this._chart.priceScale('vol').applyOptions({scaleMargins:{top:0.82,bottom:0}})}catch(e){}}
  }
  _normalizeData(){
    const map=new Map();
    for(const c of this._data||[]){
      if(c?.time==null||c.open==null||c.high==null||c.low==null||c.close==null)continue;
      const time=Number(c.time);
      if(!Number.isFinite(time))continue;
      map.set(time,{time,open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close),volume:Number(c.volume??0)});
    }
    this._data=[...map.values()].sort((a,b)=>a.time-b.time);
    if(this._data.length){this._p1=this._data[0].time;this._p2=this._data[this._data.length-1].time;this.container.dataset.p1=this._p1;this.container.dataset.p2=this._p2;}
  }
  _futureWhitespace(data,count=20){
    if(data.length<2)return[];
    const n=Math.min(30,data.length-1);
    const tail=data.slice(-(n+1));
    const gaps=[];
    for(let i=1;i<tail.length;i++)gaps.push(tail[i].time-tail[i-1].time);
    const ws=[];let last=data[data.length-1].time;
    for(let i=0;i<count;i++){last+=gaps[i%gaps.length];ws.push({time:this._st(last)});}
    return ws;
  }
  _apply(){
    if(!this._data.length)return;
    this._normalizeData();
    const clean=this._data;
    if(!clean.length)return;
    const ws=this._futureWhitespace(clean,20);
    if(this.mode==='candle'){this._main.setData([...clean.map(c=>({time:this._st(c.time),open:c.open,high:c.high,low:c.low,close:c.close})),...ws])}
    else{this._main.setData([...clean.map(c=>({time:this._st(c.time),value:c[this.field]})),...ws])}
    if(this._vol){this._vol.setData([...clean.map(c=>({time:this._st(c.time),value:c.volume,color:c.close>=c.open?'rgba(34,197,94,0.35)':'rgba(239,68,68,0.35)'})),...ws])}
    this._emit('barsChanged',{count:clean.length});
    this._emit('dataChanged',{sym:this.sym,int:this.int,count:clean.length});
  }
  async load(sym,int,name=null,p1,p2){
    this._isDataset=false;
    this._datasetFull=[];
    this._currentName=name;
    this.sym=sym;
    this.int=int||this.int;
    this._tzOffsetMin=this._tzOffset(this._timezone);
    const res=await this.api._chartData(sym,this.int,{bars:INITIAL_LIMIT,direction:'before',anchor:Math.floor(Date.now()/1000),initial:true});
    if(res.error){toast(res.error,'error');return;}
    this._data=res.candles||[];
    this._p1=res.p1??0;
    this._p2=res.p2??0;
    this._savePaneLayout();
    this._buildSeries();
    this._emit('dataChanged',{sym:this.sym,int:this.int,count:this._data.length});
    this._emit('load',{sym,int:this.int,name:this._currentName,count:this._data.length});
    if(res.end_of_data&&res.loadedBars<INITIAL_LIMIT)toast(`${res.loadedBars} bars loaded. End of avaliable data`,'info',3000);
  }
  _loadDataset(candles,interval){
    this.sym=null;
    this._currentName=null;
    this.int=interval||this.int;
    this._isDataset=true;
    this._datasetFull=[...candles];
    this._data=[...candles];
    this._buildSeries();
    this._emit('dataset-loaded',{int:this.int,count:candles.length});
  }
  async _extendBefore(bars,silent=false){
    const requested=Math.max(1,Math.floor(Number(bars)||0));
    if(this._isDataset){
      const p1=this._data[0]?.time;
      const toAdd=p1?this._datasetFull.filter(c=>c.time<p1).slice(-requested):[];
      if(!toAdd.length){if(!silent)toast('No more data available','warn');return 0;}
      this._data=[...toAdd,...this._data];this._apply();return toAdd.length;
    }
    if(!this.sym||!requested)return 0;
    const anchor=this._data[0]?.time??Math.floor(Date.now()/1000);
    const beforeCount=this._data.length;
    const res=await this.api._chartData(this.sym,this.int,{bars:requested,direction:'before',anchor});
    if(res.error){toast(res.error,'error');return 0}
    const fresh=res.candles||[];
    if(!fresh.length){if(!silent)toast('No more data available','warn');return 0}
    this._data=[...fresh,...this._data];
    this._apply();
    const loaded=this._data.length-beforeCount;
    if(!silent&&loaded<requested){if(res.end_of_data)toast(`${loaded} bars loaded. End of avaliable data`,'info',3000);else toast(`${loaded} bars loaded`,'info',2000)}
    return loaded;
  }
  async _extendAfter(bars,silent=false){
    const requested=Math.max(1,Math.floor(Number(bars)||0));
    if(this._isDataset){
      const p2=this._data[this._data.length-1]?.time;
      const toAdd=p2?this._datasetFull.filter(c=>c.time>p2).slice(0,requested):[];
      if(!toAdd.length){if(!silent) toast('No more data available','warn');return 0;}
      this._data=[...this._data,...toAdd];this._apply();return toAdd.length;
    }
    if(!this.sym||!requested)return 0;
    const anchor=this._data[this._data.length-1]?.time??0;
    if(!anchor){if(!silent) toast('Load a chart first','warn');return 0}
    const beforeCount=this._data.length;
    const res=await this.api._chartData(this.sym,this.int,{bars:requested,direction:'after',anchor});
    if(res.error){if(!silent) toast(res.error,'error');return 0}
    const fresh=res.candles||[];
    if(!fresh.length){if(!silent) toast('No more data available','warn');return 0}
    this._data=[...this._data,...fresh];
    this._apply();
    const loaded=this._data.length-beforeCount;
    if(!silent && loaded<requested){if(res.end_of_data)toast(`${loaded} bars loaded. End of avaliable data`,'info',3000);else toast(`${loaded} bars loaded`,'info',2000)}
    return loaded;
  }
  _trimBefore(bars){if(!this._data.length)return;this._data=this._data.slice(Math.min(bars,this._data.length));if(this._data.length)this._p1=this._data[0].time;this._apply()}
  _trimAfter(bars){if(!this._data.length)return;this._data=this._data.slice(0,Math.max(0,this._data.length-bars));if(this._data.length)this._p2=this._data[this._data.length-1].time;this._apply()}
  _appendCandles(candles){
    if(!candles?.length)return;
    const existing=new Set(this._data.map(c=>c.time));
    const fresh=candles.filter(c=>!existing.has(c.time));
    if(!fresh.length)return;
    this._data=[...this._data,...fresh];
    if(this._data.length>INITIAL_LIMIT)this._data=this._data.slice(this._data.length-INITIAL_LIMIT);
    this._apply();
  }
  _setMode(mode){this.mode=mode;this._buildSeries()}
  _setField(f){this.field=f;if(this.mode==='line')this._apply()}
  _setVolMode(m){this.volMode=m;this._buildSeries()}
  _setIndicators(items, sourceId=this){
    if(!this._indicatorSources) this._indicatorSources=new Map();
    this._indicatorSources.set(sourceId,(items||[]).map(i=>({
      type:i.type,label:i.label,opts:i.opts||{},
      data:(i.data||[]).map(p=>({...p})),
      upper:(i.upper||[]).map(p=>({...p})),
      lower:(i.lower||[]).map(p=>({...p}))
    })));
    this._indicators=[...this._indicatorSources.values()].flat();
  }
  _clearIndicators(sourceId=this){
    if(this._indicatorSources) this._indicatorSources.delete(sourceId);
    this._indicators=this._indicatorSources?[...this._indicatorSources.values()].flat():[];
  }
  _getIndicators(){return this._indicators.slice()}
  get _currentSymbol(){return this.sym}
  get _currentInterval(){return this.int}
  _getBarCount(){return this._data.length}
  _getLastTimestamp(){return this._data.length?this._data[this._data.length-1].time:0}
  _getCurrentData(){return this._tzOffsetMin===0?this._data:this._data.map(c=>({...c,time:this._st(c.time)}))}
  _getRawData(){return this._data}
  _getRange(){return{p1:this._p1,p2:this._p2}}
  _forceResize(){this._chart.resize(this.container.clientWidth,this.container.clientHeight)}
  _savePaneLayout(){
    const panes=this._chart?.panes?.()??[];
    if(!panes.length) return;
    this._savedPaneLayout=panes.map(p=>{try{return{stretchFactor:p.getStretchFactor()};}catch(e){return{stretchFactor:1};}});
  }
  _restorePaneLayout(){
    if(!this._savedPaneLayout?.length) return;
    const layout=this._savedPaneLayout;
    this._savedPaneLayout=null;
    const panes=this._chart?.panes?.()??[];
    layout.forEach((saved,i)=>{if(i<panes.length){try{panes[i].setStretchFactor(saved.stretchFactor);}catch(e){}}});
  }
  _chartOn(evt,fn){this._listeners.push({evt,fn})}
  _emit(evt,data){this._listeners.filter(l=>l.evt===evt).forEach(l=>l.fn(data))}
  buy(time){this._emit('trade',{type:'buy',time})}
  sell(time){this._emit('trade',{type:'sell',time})}
  fitContent(){this._chart?.timeScale().fitContent();this._chart?.priceScale('right')?.applyOptions({autoScale:true})}
  scrollToRealTime(){this._chart?.timeScale().scrollToRealTime()}
}