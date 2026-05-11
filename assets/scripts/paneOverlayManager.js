import {deny} from './message.js';
const _registry=new WeakMap();
function _reg(chart,group){
  if(!_registry.has(chart))_registry.set(chart,new Set());
  _registry.get(chart).add(group);
}
function _unreg(chart,group){
  _registry.get(chart)?.delete(group);
}
function rawPaneOf(pf){
  if(pf.type==='hist'||pf.type==='dot') return pf.opts.pane!=null?pf.opts.pane:1;
  return pf.opts.pane!=null?pf.opts.pane:0;
}
function nextFreePaneBase(groups,chart){
  let next=(chart&&chart.volMode==='pane')?2:1;
  const all=chart?[...(_registry.get(chart)||[])]:groups;
  for(const g of all){
    if(g._paneBase!=null) next=Math.max(next,g._paneBase+g._panesUsed);
  }
  return next;
}
function buildPaneResolver(plotFns,groups,chart){
  const rawPanes=plotFns.map(rawPaneOf);
  const subPanes=rawPanes.filter(p=>p>0);
  if(!subPanes.length) return{_resolvePane:pf=>rawPaneOf(pf),_paneBase:null,_panesUsed:0};
  const _paneBase=nextFreePaneBase(groups,chart);
  const _panesUsed=Math.max(...subPanes);
  const _resolvePane=pf=>{const raw=rawPaneOf(pf);if(raw===0)return 0;return _paneBase+(raw-1);};
  return{_resolvePane,_paneBase,_panesUsed};
}
function _createSeries(lwChart,plotFns,groups,silent,chart){
  const{_resolvePane,_paneBase,_panesUsed}=buildPaneResolver(plotFns,groups,chart);
  const series=[];
  plotFns.forEach(pf=>{
    try{
      const pane=_resolvePane(pf);
      let s=null;
      if(pf.type==='line'){
        s=lwChart.addSeries(LightweightCharts.LineSeries,{color:pf.opts.color||'#a78bfa',lineWidth:pf.opts.lineWidth||2,lineStyle:pf.opts.lineStyle||0,title:pf.label},pane);
        s.setData(pf.data);
      }else if(pf.type==='hist'){
        s=lwChart.addSeries(LightweightCharts.HistogramSeries,{color:pf.opts.color||'#3b82f6',title:pf.label},pane);
        s.setData(pf.data);
      }else if(pf.type==='band'){
        const c=pf.opts.color||'#a78bfa';
        const su=lwChart.addSeries(LightweightCharts.LineSeries,{color:c,lineWidth:1,title:pf.label+' U'},pane);
        const sl=lwChart.addSeries(LightweightCharts.LineSeries,{color:c,lineWidth:1,title:pf.label+' L'},pane);
        su.setData(pf.upper);
        sl.setData(pf.lower);
        series.push(su,sl);
      }else if(pf.type==='dot'){
        s=lwChart.addSeries(LightweightCharts.LineSeries,{color:pf.opts.color||'#f59e0b',lineVisible:false,pointMarkersVisible:true,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false,title:pf.label},pane);
        s.setData(pf.data);
      }else if(pf.type==='area'){
        s=lwChart.addSeries(LightweightCharts.AreaSeries,{lineColor:pf.opts.color||'#a78bfa',topColor:pf.opts.topColor||'rgba(167,139,250,0.35)',bottomColor:pf.opts.bottomColor||'rgba(167,139,250,0.02)',lineWidth:pf.opts.lineWidth||2,title:pf.label},pane);
        s.setData(pf.data);
      }else if(pf.type==='candle'){
        s=lwChart.addSeries(LightweightCharts.CandlestickSeries,{upColor:pf.opts.upColor||'#22c55e',downColor:pf.opts.downColor||'#ef4444',borderUpColor:pf.opts.upColor||'#22c55e',borderDownColor:pf.opts.downColor||'#ef4444',wickUpColor:pf.opts.upColor||'#22c55e',wickDownColor:pf.opts.downColor||'#ef4444',title:pf.label},pane);
        s.setData(pf.data);
      }else if(pf.type==='label'){
        s=lwChart.addSeries(LightweightCharts.LineSeries,{lineVisible:false,pointMarkersVisible:false,lastValueVisible:false,priceLineVisible:false,crosshairMarkerVisible:false,title:''},pane);
        s.setData(pf.data.map(d=>({time:d.time,value:d.value})));
        const markers=pf.data.filter(d=>d.text!=null).map(d=>({time:d.time,position:d.position||pf.opts.position||'aboveBar',color:d.color||pf.opts.color||'#e2e8f0',shape:d.shape||pf.opts.shape||'circle',text:String(d.text),size:d.size||pf.opts.size||1}));
        if(markers.length) LightweightCharts.createSeriesMarkers(s,markers);
      }
      if(s) series.push(s);
    }catch(e){
      if(!silent) deny('Plot error ('+pf.label+'): '+e.message);
    }
  });
  return{series,_paneBase,_panesUsed};
}
export class PaneOverlayManager{
  constructor(chart){
    this._chart=chart;
    this._groups=[];
    this._counter=0;
    this._suspended=false;
    this._suspendedVolMode=null;
  }
  getGroups(){return this._groups;}
  getAllPlotFns(){return this._groups.flatMap(g=>g.plotFns||[]);}
  addGroup(plotFns,name,code,color,silent=false){
    const{series,_paneBase,_panesUsed}=_createSeries(this._chart._chart,plotFns,this._groups,silent,this._chart);
    if(!series.length) return null;
    const id=++this._counter;
    const group={id,name,code,color,series,plotFns,_paneBase,_panesUsed};
    this._groups.push(group);
    _reg(this._chart,group);
    this._chart._setIndicators(this.getAllPlotFns());
    return group;
  }
  removeGroup(id){
    const idx=this._groups.findIndex(g=>g.id===id);
    if(idx===-1) return null;
    const g=this._groups[idx];
    g.series.forEach(s=>{try{this._chart._chart.removeSeries(s)}catch(e){}});
    _unreg(this._chart,g);
    this._groups.splice(idx,1);
    this._chart._setIndicators(this.getAllPlotFns());
    this._chart._forceResize();
    return g;
  }
  clearAll(){
    this._groups.forEach(g=>{
      g.series.forEach(s=>{try{this._chart._chart.removeSeries(s)}catch(e){}});
      _unreg(this._chart,g);
    });
    this._groups=[];
    this._chart._clearIndicators();
    this._chart._forceResize();
  }
  suspendAll(){
    if(this._suspended) return;
    this._suspended=true;
    this._suspendedVolMode=this._chart.volMode;
    if(this._chart.volMode!=='off') this._chart._setVolMode('off');
    this._groups.forEach(g=>{
      g.series.forEach(s=>{try{this._chart._chart.removeSeries(s)}catch(e){}});
      g.series=[];
      _unreg(this._chart,g);
    });
    this._chart._forceResize();
  }
  restoreAll(){
    if(!this._suspended) return;
    this._suspended=false;
    if(this._suspendedVolMode!=='off') this._chart._setVolMode(this._suspendedVolMode);
    this._suspendedVolMode=null;
    const restored=[];
    for(const g of this._groups){
      const{series,_paneBase,_panesUsed}=_createSeries(this._chart._chart,g.plotFns,restored,true,this._chart);
      g.series=series;
      g._paneBase=_paneBase;
      g._panesUsed=_panesUsed;
      _reg(this._chart,g);
      restored.push(g);
    }
    this._chart._forceResize();
  }
}