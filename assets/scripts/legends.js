const _chartLegendState=new WeakMap();
function _fmtVal(v){
  if(v==null||typeof v!=='number'||!isFinite(v)) return '';
  const av=Math.abs(v);
  if(av>=1000) return v.toFixed(1);
  if(av>=1) return v.toFixed(2);
  return v.toFixed(4);
}
function _ensureState(chart){
  let st=_chartLegendState.get(chart);
  if(st) return st;
  st={
    overlay:null,
    legends:new Map(),
    mainLegend:null,
    mainLabel:'',
    raf:null,
    dragging:false,
    lastSig:null,
    lastCrosshair:null,
  };
  _chartLegendState.set(chart,st);
  _initOverlay(chart,st);
  return st;
}
function _initOverlay(chart,st){
  const container=chart.container;
  if(getComputedStyle(container).position==='static') container.style.position='relative';
  const overlay=document.createElement('div');
  overlay.className='absolute inset-0 pointer-none z-2';
  container.appendChild(overlay);
  st.overlay=overlay;
  const ro=new ResizeObserver(()=>_scheduleLayout(chart,st));
  ro.observe(container);
  st._ro=ro;
  container.addEventListener('mousedown',()=>_startDragWatch(chart,st));
  container.addEventListener('touchstart',()=>_startDragWatch(chart,st),{passive:true});
  chart._chart.subscribeCrosshairMove(param=>{
    st.lastCrosshair=param;
    _updateAllValues(chart,st);
  });
  chart._chartOn('dataChanged',()=>_scheduleLayout(chart,st));
  chart._chartOn('barsChanged',()=>_scheduleLayout(chart,st));
  _scheduleLayout(chart,st);
}
function _startDragWatch(chart,st){
  if(st.dragging) return;
  st.dragging=true;
  const tick=()=>{
    if(!st.dragging) return;
    _layoutNow(chart,st);
    st.raf=requestAnimationFrame(tick);
  };
  st.raf=requestAnimationFrame(tick);
  const stop=()=>{
    st.dragging=false;
    if(st.raf) cancelAnimationFrame(st.raf);
    st.raf=null;
    _layoutNow(chart,st);
    window.removeEventListener('mouseup',stop);
    window.removeEventListener('touchend',stop);
  };
  window.addEventListener('mouseup',stop);
  window.addEventListener('touchend',stop);
}
function _scheduleLayout(chart,st){
  if(st.raf) return;
  st.raf=requestAnimationFrame(()=>{
    st.raf=null;
    _layoutNow(chart,st);
  });
}
function _paneOffsets(chart){
  const panes=chart._chart.panes?.()??[];
  const offsets=[];
  let top=0;
  for(const p of panes){
    let h=30;
    try{h=p.getHeight()}catch(e){}
    offsets.push({top,height:h});
    top+=h;
  }
  return offsets;
}
function _layoutNow(chart,st){
  const offsets=_paneOffsets(chart);
  st.lastSig=offsets.map(o=>o.top+':'+o.height).join('|');
  _positionEls(chart,st,offsets);
}
function _positionEls(chart,st,offsets){
  if(st.mainLegend){
    const o=offsets[0];
    if(o){st.mainLegend.style.display='';st.mainLegend.style.top=(o.top+6)+'px';st.mainLegend.style.left='8px';}
    else{st.mainLegend.style.display='none';}
  }
  const byPane=new Map();
  for(const entry of st.legends.values()){
    if(!byPane.has(entry.paneIndex)) byPane.set(entry.paneIndex,[]);
    byPane.get(entry.paneIndex).push(entry);
  }
  for(const [paneIndex,entries] of byPane){
    const o=offsets[paneIndex];
    entries.forEach(entry=>{
      if(!o){entry.el.style.display='none';return;}
      entry.el.style.display='';
      entry.el.style.top=(o.top+6)+'px';
      entry.el.style.left='8px';
    });
  }
  _restack(offsets,st);
}
function _restack(offsets,st){
  const mainEntries=[...st.legends.values()].filter(e=>e.paneIndex===0 && offsets[0]);
  mainEntries.sort((a,b)=>a.order-b.order);
  let acc=(st.mainLegend && offsets[0])?st.mainLegend.offsetHeight+4:0;
  mainEntries.forEach(entry=>{
    entry.el.style.transform=`translateY(${acc}px)`;
    acc+=entry.el.offsetHeight+4;
  });
  const byPane=new Map();
  for(const entry of st.legends.values()){
    if(entry.paneIndex===0) continue;
    if(!byPane.has(entry.paneIndex)) byPane.set(entry.paneIndex,[]);
    byPane.get(entry.paneIndex).push(entry);
  }
  for(const entries of byPane.values()){
    entries.sort((a,b)=>a.order-b.order);
    let a=0;
    entries.forEach(entry=>{
      entry.el.style.transform=`translateY(${a}px)`;
      a+=entry.el.offsetHeight+4;
    });
  }
}
function _updateAllValues(chart,st){
  const param=st.lastCrosshair;
  if(st.mainLegend && st._mainSeries){
    const d=param && param.time ? param.seriesData.get(st._mainSeries) : null;
    const v=d?(d.value!=null?d.value:d.close):null;
    const el=st.mainLegend.querySelector('.pl-val');
    if(el) el.textContent=v!=null?_fmtVal(v):'';
  }
  for(const entry of st.legends.values()){
    entry.items.forEach(item=>{
      const d=param && param.time ? param.seriesData.get(item.series) : null;
      let text='';
      if(d){
        if(d.value!=null) text=_fmtVal(d.value);
        else if(d.close!=null) text=_fmtVal(d.close);
      }
      item.valEl.textContent=text;
    });
  }
}
function _makeLegendBox(color){
  const box=document.createElement('div');
  box.className='absolute flex items-start gap-6 p-4-6 shadow blur-6 border-soft rounded pointer-auto wm-260';
  const dot=document.createElement('span');
  dot.className='dot-sm mt-3 flex-shrink-0';
  dot.style.background=color||'var(--bg3)';
  box.appendChild(dot);
  const body=document.createElement('div');
  body.className='flex-column gap-1 min-w-0';
  box.appendChild(body);
  return {box,body,dot};
}
async function _isLive(st,token,sym){
  if(!sym||!st._mainDot) return;
  try{
    const r=await fetch(window.LIV.api,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol:sym}),});
    const j=await r.json();
    if(st._loadToken!==token) return;
    if(typeof j.live!=='boolean') return;
    st._live=j.live;
    if(st._mainDot) st._mainDot.style.background=j.live?'var(--green)':'var(--red)';
  }catch(e){}
}
export function attachMainLegend(chart,mainSeries){
  const st=_ensureState(chart);
  if(st.mainLegend){st.mainLegend.remove();st.mainLegend=null;}
  st._mainSeries=mainSeries;
  const {box,body,dot}=_makeLegendBox(null);
  st._mainDot=dot;
  if(st._live!=null) dot.style.background=st._live?'var(--green)':'var(--red)';
  const row=document.createElement('div');
  row.className='flex-center gap-6 text-11 lh-14 nowrap';
  const lbl=document.createElement('span');
  lbl.className='text-secondary text-ellipsis fw-600';
  lbl.textContent=st.mainLabel||'';
  const val=document.createElement('span');
  val.className='pl-val text-primary tabular-nums ml-auto';
  row.appendChild(lbl);
  row.appendChild(val);
  body.appendChild(row);
  st.overlay.appendChild(box);
  st.mainLegend=box;
  st._mainLabelEl=lbl;
  if(!st._mainListeners){
    st._mainListeners=true;
    chart._chartOn('load',({sym,int,name})=>{
      const token=(st._loadToken||0)+1;
      st._loadToken=token;
      clearTimeout(st._nameTimer);
      st._live=null;
      if(st._mainDot) st._mainDot.style.background='var(--bg3)';
      _isLive(st,token,sym);
      const known=name||(chart._currentSymbol===sym&&chart._currentName&&chart._currentName!==sym?chart._currentName:null);
      setMainLegendText(chart,known||sym||'');
      if(known) return;
      const started=Date.now();
      const poll=()=>{
        if(st._loadToken!==token) return;
        const n=chart._currentName;
        if(chart._currentSymbol===sym&&n&&n!==sym){
          setMainLegendText(chart,n);
          return;
        }
        if(Date.now()-started>8000) return;
        st._nameTimer=setTimeout(poll,120);
      };
      st._nameTimer=setTimeout(poll,120);
    });
    chart._chartOn('dataset-loaded',()=>{
      st._loadToken=(st._loadToken||0)+1;
      clearTimeout(st._nameTimer);
      if(st._mainDot) st._mainDot.style.background='var(--bg3)';
      setMainLegendText(chart,'Dataset');
    });
  }
  _scheduleLayout(chart,st);
  return box;
}
export function setMainLegendText(chart,text){
  const st=_ensureState(chart);
  st.mainLabel=text;
  if(st._mainLabelEl) st._mainLabelEl.textContent=text;
}
function _resolveGroupPaneMap(group){
  const map=new Map();
  let seriesIdx=0;
  group.plotFns.forEach(pf=>{
    const count=pf.type==='band'?2:1;
    const paneRaw=pf.opts.pane!=null?pf.opts.pane:(pf.type==='hist'||pf.type==='dot'?1:0);
    const paneIndex=paneRaw===0?0:(group._paneBase!=null?group._paneBase+(paneRaw-1):paneRaw);
    if(!map.has(paneIndex)) map.set(paneIndex,[]);
    for(let i=0;i<count;i++){
      const s=group.series[seriesIdx+i];
      if(s) map.get(paneIndex).push({pf,series:s,sub:i});
    }
    seriesIdx+=count;
  });
  return map;
}
export function syncGroupLegends(chart,pom,group,opts={}){
  const st=_ensureState(chart);
  for(const [key,entry] of [...st.legends]){
    if(entry.groupId===group.id && entry.pomId===pom){
      entry.el.remove();
      st.legends.delete(key);
    }
  }
  if(!group || !group.series || !group.series.length){_scheduleLayout(chart,st);return;}
  const paneMap=_resolveGroupPaneMap(group);
  const groupOnRemove=opts.onRemove||null;
  const removable=opts.removable!==false;
  let order=(opts.orderBase!=null?opts.orderBase:0);
  for(const [paneIndex,items] of paneMap){
    if(paneIndex===0 && opts.skipMainPane){order++;continue;}
    const perPlotRemovers=items.map(it=>it.pf.opts.onRemove).filter(Boolean);
    const uniformPerPlot=perPlotRemovers.length===items.length && perPlotRemovers.every(f=>f===perPlotRemovers[0]);
    const onRemove=uniformPerPlot?perPlotRemovers[0]:groupOnRemove;
    const color=items[0]?.pf.opts.color||group.color||'#a78bfa';
    const {box,body}=_makeLegendBox(color);
    const nameRow=document.createElement('div');
    nameRow.className='flex-center gap-6 text-11 lh-14 nowrap';
    const nameLbl=document.createElement('span');
    nameLbl.className='text-secondary text-ellipsis fw-600';
    nameLbl.textContent=items.length===1?(items[0].pf.label||group.name):group.name;
    nameRow.appendChild(nameLbl);
    const valueItems=[];
    const multi=items.length>1;
    let subWrap=null;
    let caret=null;
    if(!multi){
      const v=document.createElement('span');
      v.className='text-primary tabular-nums ml-auto';
      nameRow.appendChild(v);
      valueItems.push({series:items[0].series,valEl:v});
    }else{
      caret=document.createElement('button');
      caret.className='flex-center-justify text-muted flex-shrink-0 w-14 h-14 squared text-12 lh-1 transition-trans-15';
      caret.type='button';
      caret.textContent='>';
      caret.title='Toggle sub-items';
      nameRow.appendChild(caret);
    }
    if(removable && onRemove){
      const rm=document.createElement('button');
      rm.className='flex-center-justify text-muted flex-shrink-0 w-14 h-14 squared text-12 lh-1 hov-red';
      rm.type='button';
      rm.innerHTML='&times;';
      rm.title='Remove';
      rm.onclick=e=>{e.stopPropagation();onRemove();};
      nameRow.appendChild(rm);
    }
    body.appendChild(nameRow);
    if(multi){
      subWrap=document.createElement('div');
      subWrap.className='flex-column gap-1 hidden';
      items.forEach(it=>{
        const r=document.createElement('div');
        r.className='flex-center gap-6 text-11 lh-14 nowrap pl-8';
        const l=document.createElement('span');
        l.className='text-muted text-ellipsis fw-600';
        l.textContent=it.pf.type==='band'?(it.pf.label+(it.sub===0?' U':' L')):it.pf.label;
        const v=document.createElement('span');
        v.className='text-primary tabular-nums ml-auto';
        r.appendChild(l);
        r.appendChild(v);
        subWrap.appendChild(r);
        valueItems.push({series:it.series,valEl:v});
      });
      body.appendChild(subWrap);
      caret.onclick=e=>{
        e.stopPropagation();
        const open=subWrap.classList.toggle('hidden');
        caret.classList.toggle('transr-90',!open);
        _scheduleLayout(chart,st);
      };
    }
    st.overlay.appendChild(box);
    st.legends.set(group.id+':'+paneIndex,{
      el:box,
      paneIndex,
      groupId:group.id,
      pomId:pom,
      order:order++,
      items:valueItems,
    });
  }
  _scheduleLayout(chart,st);
  _updateAllValues(chart,st);
}
export function removeGroupLegends(chart,pom,groupId){
  const st=_chartLegendState.get(chart);
  if(!st) return;
  for(const [key,entry] of [...st.legends]){
    if(entry.groupId===groupId && entry.pomId===pom){
      entry.el.remove();
      st.legends.delete(key);
    }
  }
  _scheduleLayout(chart,st);
}
export function clearPomLegends(chart,pom){
  const st=_chartLegendState.get(chart);
  if(!st) return;
  for(const [key,entry] of [...st.legends]){
    if(entry.pomId===pom){
      entry.el.remove();
      st.legends.delete(key);
    }
  }
  _scheduleLayout(chart,st);
}