import {toast} from './message.js';
import {offsetMinutesForZone,shiftTimestamp} from './timezone.js';
export const INTERVALS_S={
  '1m':60,'2m':120,'5m':300,'15m':900,'30m':1800,
  '1h':3600,'4h':14400,'1d':86400,'1wk':604800,'1mo':2592000,'3mo':7776000
};
export const INTERVALS=Object.keys(INTERVALS_S);
const INITIAL_LIMIT=1500;
function _chartOpts(){
  const s=getComputedStyle(document.documentElement);
  const v=n=>s.getPropertyValue(n).trim();
  return {
    layout:{background:{type:'solid',color:v('--bg')},textColor:v('--text2')},
    grid:{vertLines:{color:v('--bg3')},horzLines:{color:v('--bg3')}},
    timeScale:{timeVisible:true,secondsVisible:false,borderColor:v('--bg5')},
    rightPriceScale:{borderColor:v('--bg5')},
    crosshair:{vertLine:{color:v('--bg52')},horzLine:{color:v('--bg52')}},
    handleScroll:true,handleScale:true
  };
}
export class Chart {
  constructor(container,api,timezone='UTC') {
    this.container=container;this.api=api;
    this.sym=null;this.int='1d';
    this.mode='candle';this.field='close';this.volMode='overlay';
    this._data=[];this._p1=0;this._p2=0;
    this._chart=null;this._main=null;this._vol=null;
    this._listeners=[];
    this._timezone=timezone;
    this._tzOffsetMin=0;
    this._indicators=[];
    this._init();
  }
  _tzOffset(iana){
    if(iana==='UTC') return 0;
    try{return offsetMinutesForZone(iana)}catch(e){return 0}
  }
  _setTimezone(tz){
    this._timezone=tz;
    this._tzOffsetMin=this._tzOffset(tz);
    if(this._data.length) this._apply();
  }
  _shiftTime(unixSec){
    return shiftTimestamp(unixSec,this._tzOffsetMin);
  }
  _init() {
    this._chart=LightweightCharts.createChart(this.container,{..._chartOpts(),width:this.container.clientWidth,height:this.container.clientHeight});
    new ResizeObserver(()=>this._chart.resize(this.container.clientWidth,this.container.clientHeight)).observe(this.container);
    this._buildSeries();
  }
  _applyTheme(){
    this._chart.applyOptions(_chartOpts());
  }
  _buildSeries() {
    if(this._main){try{this._chart.removeSeries(this._main)}catch(e){}}
    if(this._vol){try{this._chart.removeSeries(this._vol)}catch(e){}}
    this._vol=null;
    if(this.mode==='candle') {
      this._main=this._chart.addSeries(LightweightCharts.CandlestickSeries,{
        upColor:'#22c55e',downColor:'#ef4444',borderUpColor:'#22c55e',borderDownColor:'#ef4444',
        wickUpColor:'#22c55e',wickDownColor:'#ef4444'
      });
    } else {
      this._main=this._chart.addSeries(LightweightCharts.LineSeries,{color:'#3b82f6',lineWidth:2});
    }
    if(this.volMode!=='off') this._buildVolSeries();
    if(this._data.length) this._apply();
  }
  _buildVolSeries() {
    const paneIdx=this.volMode==='pane'?1:0;
    const opts={priceFormat:{type:'volume'},color:'rgba(100,116,139,0.4)',priceScaleId:paneIdx===0?'vol':''};
    try {
      this._vol=this._chart.addSeries(LightweightCharts.HistogramSeries,opts,paneIdx);
    } catch(e) {
      this._vol=this._chart.addSeries(LightweightCharts.HistogramSeries,{...opts,priceScaleId:'vol'});
    }
    if(paneIdx===0) {
      try {this._chart.priceScale('vol').applyOptions({scaleMargins:{top:0.82,bottom:0}})} catch(e){}
    }
  }
  _apply() {
    if(!this._data.length) return;
    const clean = this._data.filter(c =>
      c.open != null && c.high != null && c.low != null && c.close != null
    ).map(c => ({ ...c, volume: c.volume ?? 0 }));
    if(!clean.length) return;
    if(this.mode === 'candle') {
      this._main.setData(clean.map(c => ({time: this._shiftTime(c.time),open: c.open, high: c.high, low: c.low, close: c.close})));
    } else {
      this._main.setData(clean.map(c => ({time: this._shiftTime(c.time),value: c[this.field]})));
    }
    if(this._vol) {
      this._vol.setData(clean.map(c => ({time: this._shiftTime(c.time),value: c.volume,color: c.close >= c.open ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'})));
    }
    this._emit('barsChanged', { count: clean.length });
    this._emit('dataChanged', {
      sym: this.sym,
      int: this.int,
      count: clean.length
    });
  }
  async load(sym, int, p1, p2) {
    this.sym = sym;
    this.int = int || this.int;
    this._tzOffsetMin = this._tzOffset(this._timezone);
    const res = await this.api._chartData(sym, this.int, p1, p2, INITIAL_LIMIT, true);
    if(res.error){toast(res.error, 'error');return;}
    this._data = res.candles || [];
    this._p1 = res.p1;
    this._p2 = res.p2;
    this._buildSeries();
    this._emit('dataChanged', {sym: this.sym,int: this.int,count: this._data.length});
    this._emit('load', { sym, int: this.int, count: this._data.length });
  }
  async _extendBefore(bars,silent=false) {
    const step=INTERVALS_S[this.int]||86400;
    const firstTs=this._data[0]?.time??this._p1;
    const p2=firstTs;const p1=p2-bars*step;
    const res=await this.api._chartData(this.sym,this.int,p1,p2);
    if(res.error){toast(res.error,'error');return 0}
    if(!res.candles?.length){if(!silent)toast('No more data available','warn');return 0}
    const existing=new Set(this._data.map(c=>c.time));
    const fresh=res.candles.filter(c=>!existing.has(c.time));
    if(!fresh.length){if(!silent)toast('No new data available','warn');return 0}
    this._data=[...fresh,...this._data];
    this._p1=Math.min(this._p1,res.p1);
    this._apply();
    return fresh.length;
  }
  async _extendAfter(bars) {
    const step = INTERVALS_S[this.int] || 86400;
    const lastTs = this._data[this._data.length - 1]?.time ?? this._p2;
    const p1 = lastTs;
    const p2 = p1 + bars * step;
    const res = await this.api._chartData(this.sym, this.int, p1, p2);
    if(res.error){toast(res.error,'error');return}
    if(!res.candles?.length){toast('No more data available','warn');return}
    const existing = new Set(this._data.map(c => c.time));
    const fresh = res.candles.filter(c => !existing.has(c.time));
    if(!fresh.length){toast('No new data available','warn');return}
    this._data = [...this._data, ...fresh];
    this._p2 = Math.max(this._p2, res.p2);
    this._apply();
  }
  _appendCandles(candles) {
    if(!candles?.length) return;
    const existing=new Set(this._data.map(c=>c.time));
    const fresh=candles.filter(c=>!existing.has(c.time));
    if(!fresh.length) return;
    this._data=[...this._data,...fresh].sort((a,b)=>a.time-b.time);
    this._p2=this._data[this._data.length-1].time;
    this._apply();
    toast(`${fresh.length} new bar${fresh.length>1?'s':''}`,'info',2000);
  }
  _setMode(mode) {this.mode=mode;this._buildSeries()}
  _setField(f) {this.field=f;if(this.mode==='line')this._apply()}
  _setVolMode(m) {this.volMode=m;this._buildSeries()}
  _setIndicators(items){this._indicators=(items||[]).map(i=>({type:i.type,label:i.label,opts:i.opts||{},data:(i.data||[]).map(p=>({...p})),upper:(i.upper||[]).map(p=>({...p})),lower:(i.lower||[]).map(p=>({...p}))}))}
  _clearIndicators(){this._indicators=[]}
  _getIndicators(){return this._indicators.slice()}
  get _currentSymbol(){return this.sym}
  get _currentInterval(){return this.int}
  _getBarCount(){return this._data.length}
  _getLastTimestamp(){return this._data.length?this._data[this._data.length-1].time:0}
  _getCurrentData(){return this._data}
  _getRange(){return{p1:this._p1,p2:this._p2}}
  _forceResize(){this._chart.resize(this.container.clientWidth,this.container.clientHeight)}
  _chartOn(evt,fn){this._listeners.push({evt,fn})}
  _emit(evt,data){this._listeners.filter(l=>l.evt===evt).forEach(l=>l.fn(data))}
  buy(time) { this._emit('trade',{type:'buy',time}) }
  sell(time) { this._emit('trade',{type:'sell',time}) }
  fitContent(){this._chart?.timeScale().fitContent()}
  scrollToRealTime(){this._chart?.timeScale().scrollToRealTime()}
}