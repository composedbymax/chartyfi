import {tooltip} from './tooltip.js';
import {cursorIcon,crosshairIcon,moveIcon,trendlineIcon,penIcon,fibIcon,measureIcon,fitIcon,nowIcon,timeframeIcon,deleteIcon} from './svg.js';
import {INTERVALS} from './chart.js';
import {isMobile} from './detector.js';
const LW=()=>window.LightweightCharts||{};
let _toolsVisible=true;
const _listeners=new Set();
export const toolsVisibility={
  get:()=>_toolsVisible,
  set:v=>{const n=!!v;if(n===_toolsVisible)return;_toolsVisible=n;_listeners.forEach(fn=>fn(n));},
  on:fn=>{_listeners.add(fn);fn(_toolsVisible);return ()=>_listeners.delete(fn);}
};
export class Tools{
  constructor(container,chart,api,{visible=true}={}){
    this.container=container;
    this.inner=container.querySelector('#tools-inner')||container;
    this.chart=chart;
    this.api=api;
    this.visible=toolsVisibility.get();
    this.mode='cursor';
    this.drawings=[];
    this.draft=null;
    this.down=false;
    this.raf=0;
    this.selected=null;
    this.dragState=null;
    this._groupPopouts={};
    this.chartWrap=chart.container;
    this.canvas=document.createElement('canvas');
    this.canvas.className='tools-canvas';
    this.ctx=this.canvas.getContext('2d');
    this.chartWrap.appendChild(this.canvas);
    this.tools=[
      {id:'cursor',name:'Cursor',tip:'Default cursor',icon:cursorIcon,group:'cursor',mode:true,action:()=>this._setMode('cursor')},
      {id:'crosshair',name:'Crosshair',tip:'Crosshair cursor',icon:crosshairIcon,group:'cursor',mobileGroup:'single',mobileGroupTool:'crosshair',mode:true,action:()=>this._setMode('crosshair')},
      {id:'select',name:'Select',tip:'Select & move',icon:moveIcon,mode:true,action:()=>this._setMode('select')},
      {id:'brush',name:'Brush',tip:'Brush tool',icon:penIcon,mode:true,action:()=>this._setMode('brush')},
      {id:'trend',name:'Trend',tip:'Trend line tool',icon:trendlineIcon,mode:true,action:()=>this._setMode('trend')},
      {id:'measure',name:'Measure',tip:'Measure mode',icon:measureIcon,mode:true,action:()=>this._setMode('measure')},
      {id:'fib',name:'Fib',tip:'Fib retracement',icon:fibIcon,mode:true,action:()=>this._setMode('fib')},
      {id:'fit',name:'Fit',tip:'Fit chart to screen',icon:fitIcon,action:()=>{this._fitChart();this._syncModeUI();}},
      {id:'live',name:'Live',tip:'Scroll to real time',icon:nowIcon,action:()=>{this._liveChart();this._syncModeUI();}},
      {id:'cycle',name:'TF',tip:'Cycle chart timeframe',icon:timeframeIcon,action:()=>this._cycleInterval()},
      {id:'clear',name:'Clear',tip:'Clear all',icon:deleteIcon,action:()=>{this.clear();this._syncModeUI();}},
    ];
    this._render();
    this._bind();
    this._resizeCanvas();
    this._setMode(visible?this.mode:'cursor',true);
    this.setVisible(visible);
  }
  _groupMeta(groupId){
    const tools=this.tools.filter(t=>t.group===groupId);
    let mobileGroup='group';
    let mobileTool=null;
    for(const t of tools){
      if(t.mobileGroup!=null)mobileGroup=t.mobileGroup;
      if(t.mobileGroupTool)mobileTool=t.mobileGroupTool;
    }
    return {tools,mobileGroup,mobileTool};
  }
  _render(){
    if(this._groupPopouts){
      Object.values(this._groupPopouts).forEach(g=>g.popout.remove());
    }
    this._groupPopouts={};
    this.inner.innerHTML='';
    const panel=document.createElement('div');
    panel.className='tools-panel';
    const list=document.createElement('div');
    list.className='tools-list';
    const seen=new Set();
    this.tools.forEach(tool=>{
      if(tool.group){
        if(seen.has(tool.group))return;
        seen.add(tool.group);
        const meta=this._groupMeta(tool.group);
        const {tools,mobileGroup,mobileTool}=meta;
        if(isMobile){
          if(mobileGroup==='single'){
            const active=tools.find(t=>t.id===mobileTool)||tools[0];
            if(active)list.appendChild(this._btn(active));}
          else{list.appendChild(this._groupBtn(tool.group,tools));}}
        else{list.appendChild(this._groupBtn(tool.group,tools));}}
      else{list.appendChild(this._btn(tool));}
    });
    panel.append(list);
    this.inner.appendChild(panel);
    this._syncModeUI();
  }
  _groupBtn(groupId,tools){
    const wrap=document.createElement('div');
    wrap.className='tool-group';
    const mainBtn=document.createElement('button');
    mainBtn.type='button';
    mainBtn.className='tool-btn tool-group-main';
    const trigger=document.createElement('div');
    trigger.className='tool-group-trigger';
    wrap.append(mainBtn,trigger);
    const popout=document.createElement('div');
    popout.className='tool-group-popout';
    tools.forEach(tool=>popout.appendChild(this._btn(tool)));
    document.body.appendChild(popout);
    this._groupPopouts[groupId]={wrap,mainBtn,trigger,popout,tools};
    const show=()=>{
      const r=wrap.getBoundingClientRect();
      popout.style.left=`${r.right+4}px`;
      popout.style.top=`${r.top}px`;
      popout.classList.add('open');
      trigger.classList.add('open');
    };
    const hide=()=>{
      popout.classList.remove('open');
      trigger.classList.remove('open');
    };
    mainBtn.addEventListener('click',()=>{
      const active=tools.find(t=>t.id===this.mode)||tools[0];
      active.action();
    });
    if(isMobile){
      trigger.addEventListener('click',()=>popout.classList.contains('open')?hide():show());
    }else{
      let lt;
      const cl=()=>clearTimeout(lt);
      const sh=()=>{lt=setTimeout(hide,120);};
      wrap.addEventListener('pointerenter',()=>{cl();show();});
      wrap.addEventListener('pointerleave',sh);
      popout.addEventListener('pointerenter',cl);
      popout.addEventListener('pointerleave',sh);
      trigger.addEventListener('click',()=>popout.classList.contains('open')?hide():show());
    }
    popout.addEventListener('click',hide);
    return wrap;
  }
  _updateGroupIcon(groupId){
    const g=this._groupPopouts[groupId];
    if(!g)return;
    const active=g.tools.find(t=>t.id===this.mode)||g.tools[0];
    g.mainBtn.innerHTML='';
    g.mainBtn.appendChild(active.icon({className:'icon'}));
    tooltip(g.mainBtn,active.tip);
  }
  _btn(tool){
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='tool-btn';
    btn.dataset.tool=tool.id;
    btn.appendChild(tool.icon({className:'icon'}));
    tooltip(btn,tool.tip);
    btn.addEventListener('click',()=>tool.action());
    return btn;
  }
  _bind(){
    this._onResize=()=>this._resizeCanvas();
    this._ro=new ResizeObserver(this._onResize);
    this._ro.observe(this.chartWrap);
    this._onRange=()=>this._scheduleDraw();
    this._onSize=()=>this._resizeCanvas();
    const ts=this.chart._chart?.timeScale?.();
    ts?.subscribeVisibleLogicalRangeChange?.(this._onRange);
    ts?.subscribeSizeChange?.(this._onSize);
    this._onLoad=({sym})=>{if(this._lastSym&&this._lastSym!==sym)this.clear();this._lastSym=sym;this._scheduleDraw()};
    this._onData=()=>this._scheduleDraw();
    this.chart._chartOn?.('load',this._onLoad);
    this.chart._chartOn?.('dataChanged',this._onData);
    this.chart._chartOn?.('barsChanged',this._onData);
    this._onPointer=e=>this._handlePointer(e);
    ['pointerdown','pointermove','pointerup','pointercancel'].forEach(t=>this.chartWrap.addEventListener(t,this._onPointer,true));
    this._onKey=e=>{if(e.key==='Escape')this._cancelDraft()};
    window.addEventListener('keydown',this._onKey);
    this._offToolsVisibility=toolsVisibility.on(v=>{
      if(!v){this.clear();this._setMode('cursor');}
      this.setVisible(v);
    });
  }
  _trashBtn(){
    return this.inner.querySelector('.tool-btn[data-tool="clear"]')||null;
  }
  _setTrashActive(on){
    const btn=this._trashBtn();
    if(btn)btn.classList.toggle('trash-hot',on);
  }
  _isOverTrash(clientX,clientY){
    const btn=this._trashBtn();
    if(!btn)return false;
    const r=btn.getBoundingClientRect();
    return clientX>=r.left&&clientX<=r.right&&clientY>=r.top&&clientY<=r.bottom;
  }
  _setMode(mode,silent=false){
    this.mode=mode;
    this.selected=null;
    this.dragState=null;
    this._setTrashActive(false);
    this._cancelDraft();
    this._applyMode();
    this._syncModeUI();
    if(!silent)this._scheduleDraw();
  }
  _syncModeUI(){
    this.inner.querySelectorAll('.tool-btn[data-tool]').forEach(btn=>btn.classList.toggle('active',btn.dataset.tool===this.mode));
    Object.entries(this._groupPopouts).forEach(([id,g])=>{
      g.mainBtn.classList.toggle('active',g.tools.some(t=>t.id===this.mode));
      g.popout.querySelectorAll('.tool-btn[data-tool]').forEach(btn=>btn.classList.toggle('active',btn.dataset.tool===this.mode));
      this._updateGroupIcon(id);
    });
  }
  _applyMode(){
    const L=LW();
    const crosshair=this.mode==='cursor'?(L.CrosshairMode?.Magnet??0):(L.CrosshairMode?.Normal??1);
    this.chart._chart?.applyOptions?.({crosshair:{mode:crosshair}});
    this.chartWrap.style.cursor=(this.mode==='cursor'||this.mode==='select')?'default':'crosshair';
  }
  _fitChart(){
    if(this.chart.fitContent)this.chart.fitContent();
    else this.chart._chart?.timeScale?.().fitContent?.();
  }
  _liveChart(){
    if(this.chart.scrollToRealTime)this.chart.scrollToRealTime();
    else this.chart._chart?.timeScale?.().scrollToRealTime?.();
  }
  _cycleInterval(){
    const sym=this.chart._currentSymbol;
    if(!sym)return;
    const current=this.chart._currentInterval;
    const idx=INTERVALS.indexOf(current);
    const next=INTERVALS[(idx+1+INTERVALS.length)%INTERVALS.length];
    this._setMode(this.mode,true);
    this.chart.load(sym,next);
  }
  _resizeCanvas(){
    const r=this.chartWrap.getBoundingClientRect();
    const dpr=Math.max(1,window.devicePixelRatio||1);
    const w=Math.max(1,Math.round(r.width));
    const h=Math.max(1,Math.round(r.height));
    const pxW=Math.max(1,Math.round(w*dpr));
    const pxH=Math.max(1,Math.round(h*dpr));
    if(this.canvas.width!==pxW||this.canvas.height!==pxH){
      this.canvas.width=pxW;
      this.canvas.height=pxH;
      this.canvas.style.width=`${w}px`;
      this.canvas.style.height=`${h}px`;
      this.ctx.setTransform(dpr,0,0,dpr,0,0);
      this._scheduleDraw();
    }
  }
  _scheduleDraw(){
    if(this.raf)return;
    this.raf=requestAnimationFrame(()=>{
      this.raf=0;
      this._draw();
    });
  }
  _data(){
    return this.chart._getCurrentData?.()||[];
  }
  _pixelToPoint(x,y){
    const data=this._data();
    if(!data.length||!this.chart._chart||!this.chart._main)return null;
    const logical=this.chart._chart.timeScale().coordinateToLogical(x);
    const price=this.chart._main.coordinateToPrice(y);
    if(logical==null||price==null)return null;
    const idx=Math.max(0,Math.min(data.length-1,Math.round(logical)));
    const bar=data[idx];
    if(!bar)return null;
    return {time:bar.time,price,x,y,idx};
  }
  _pickPoint(e){
    const r=this.chartWrap.getBoundingClientRect();
    return this._pixelToPoint(e.clientX-r.left,e.clientY-r.top);
  }
  _clonePoint(p){
    return {time:p.time,price:p.price,idx:p.idx,x:p.x,y:p.y};
  }
  _distToSegment(px,py,ax,ay,bx,by){
    const dx=bx-ax,dy=by-ay;
    const lenSq=dx*dx+dy*dy;
    if(lenSq===0)return Math.hypot(px-ax,py-ay);
    const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/lenSq));
    return Math.hypot(px-(ax+t*dx),py-(ay+t*dy));
  }
  _handleMetrics(){
    return isMobile?{r:9,hit:14}:{r:5,hit:8};
  }
  _hitTestDrawing(d,x,y){
    const m=this._handleMetrics();
    if(d.type==='brush'){
      const xy=d.points.map(p=>this._xy(p)).filter(Boolean);
      for(let i=0;i<xy.length-1;i++){
        if(this._distToSegment(x,y,xy[i].x,xy[i].y,xy[i+1].x,xy[i+1].y)<6)return 'body';
      }
      return null;
    }
    const p1=this._xy(d.a);
    const p2=this._xy(d.b);
    if(!p1||!p2)return null;
    if(Math.hypot(x-p1.x,y-p1.y)<m.hit)return 'a';
    if(Math.hypot(x-p2.x,y-p2.y)<m.hit)return 'b';
    if(this._distToSegment(x,y,p1.x,p1.y,p2.x,p2.y)<6)return 'body';
    return null;
  }
  _hitTest(x,y){
    for(let i=this.drawings.length-1;i>=0;i--){
      const h=this._hitTestDrawing(this.drawings[i],x,y);
      if(h)return {idx:i,handle:h};
    }
    return null;
  }
  _cancelDraft(){
    this.draft=null;
    this.down=false;
    this._scheduleDraw();
  }
  _commitDraft(){
    if(!this.draft)return;
    if(this.draft.type==='brush'){
      if(this.draft.points.length>1)this.drawings.push({type:'brush',points:this.draft.points.map(p=>this._clonePoint(p))});
    }else if(this.draft.a&&this.draft.b){
      this.drawings.push({type:this.draft.type,a:this._clonePoint(this.draft.a),b:this._clonePoint(this.draft.b)});
    }
    this.draft=null;
    this.down=false;
    this._scheduleDraw();
  }
  _handlePointer(e){
    if(this.mode==='cursor'||this.mode==='fit'||this.mode==='live'||this.mode==='cycle')return;
    if(e.button!==undefined&&e.button!==0&&e.type==='pointerdown')return;
    if(this.mode==='select'){
      const r=this.chartWrap.getBoundingClientRect();
      const x=e.clientX-r.left;
      const y=e.clientY-r.top;
      if(e.type==='pointerdown'){
        e.preventDefault();
        e.stopImmediatePropagation();
        const hit=this._hitTest(x,y);
        if(hit){
          this.selected=hit.idx;
          const d=this.drawings[hit.idx];
          if(hit.handle==='body'){
            if(d.type==='brush'){this.dragState={idx:hit.idx,handle:'body',origXY:d.points.map(p=>this._xy(p)),startX:x,startY:y};}
            else{this.dragState={idx:hit.idx,handle:'body',origA:this._clonePoint(d.a),origB:this._clonePoint(d.b),startX:x,startY:y};}
          }else{
            this.dragState={idx:hit.idx,handle:hit.handle};
          }
          this._setTrashActive(true);
          try{this.chartWrap.setPointerCapture?.(e.pointerId)}catch(_){}
        }else{
          this.selected=null;
          this.dragState=null;
        }
        this._scheduleDraw();
        return;
      }
      if(e.type==='pointermove'){
        if(this.dragState){
          e.preventDefault();
          e.stopImmediatePropagation();
          this._setTrashActive(true);
          const btn=this._trashBtn();
          if(btn)btn.classList.toggle('trash-over',this._isOverTrash(e.clientX,e.clientY));
          const d=this.drawings[this.dragState.idx];
          if(d){
            if(this.dragState.handle==='body'){
              const dx=x-this.dragState.startX;
              const dy=y-this.dragState.startY;
              if(d.type==='brush'){d.points=this.dragState.origXY.map(xy=>xy?this._pixelToPoint(xy.x+dx,xy.y+dy):null).filter(Boolean);}
              else{const oa=this._xy(this.dragState.origA);const ob=this._xy(this.dragState.origB);
                if(oa&&ob){const na=this._pixelToPoint(oa.x+dx,oa.y+dy);const nb=this._pixelToPoint(ob.x+dx,ob.y+dy);
                  if(na&&nb){d.a=na;d.b=nb;}
                }
              }
            }else{
              const p=this._pixelToPoint(x,y);
              if(p){
                if(this.dragState.handle==='a')d.a=p;
                else d.b=p;
              }
            }
          }
          this._scheduleDraw();
        }else{
          const hit=this._hitTest(x,y);
          this.chartWrap.style.cursor=hit?(hit.handle==='body'?'move':'crosshair'):'default';
        }
        return;
      }
      if(e.type==='pointerup'||e.type==='pointercancel'){
        if(this.dragState){
          if(this._isOverTrash(e.clientX,e.clientY)){
            this.drawings.splice(this.dragState.idx,1);
            if(this.selected===this.dragState.idx)this.selected=null;
            else if(this.selected>this.dragState.idx)this.selected--;
          }
          const btn=this._trashBtn();
          if(btn)btn.classList.remove('trash-over');
          this._setTrashActive(false);
          this.dragState=null;
        }
        this.chartWrap.style.cursor='default';
        try{this.chartWrap.releasePointerCapture?.(e.pointerId)}catch(_){}
        this._scheduleDraw();
      }
      return;
    }
    const activeDrawing=this.mode==='trend'||this.mode==='brush'||this.mode==='fib'||this.mode==='measure';
    if(!activeDrawing)return;
    const p=this._pickPoint(e);
    if(!p)return;
    if(e.type==='pointerdown'){
      e.preventDefault();
      e.stopImmediatePropagation();
      this.down=true;
      try{this.chartWrap.setPointerCapture?.(e.pointerId)}catch(_){}
      if(this.mode==='brush'){this.draft={type:'brush',points:[p]};this._scheduleDraw();
        return;
      }
      if(!this.draft||this.draft.type!==this.mode){this.draft={type:this.mode,a:p,b:p};this._scheduleDraw();
        return;
      }
      this.draft.b=p;
      this._commitDraft();
      return;
    }
    if(e.type==='pointermove'){
      if(this.mode==='brush'){
        if(!this.down||!this.draft||this.draft.type!=='brush')return;
        const last=this.draft.points[this.draft.points.length-1];
        if(!last||last.time!==p.time||last.price!==p.price)this.draft.points.push(p);
        this._scheduleDraw();
        return;
      }
      if(this.draft&&this.draft.type===this.mode){this.draft.b=p;this._scheduleDraw();}
      return;
    }
    if(e.type==='pointerup'||e.type==='pointercancel'){
      if(this.mode==='brush'&&this.draft?.type==='brush'){
        const last=this.draft.points[this.draft.points.length-1];
        if(last&&(last.time!==p.time||last.price!==p.price))this.draft.points.push(p);
        e.preventDefault();
        e.stopImmediatePropagation();
        try{this.chartWrap.releasePointerCapture?.(e.pointerId)}catch(_){}
        this._commitDraft();
        return;
      }
      this.down=false;
      try{this.chartWrap.releasePointerCapture?.(e.pointerId)}catch(_){}
    }
  }
  _xy(p){
    if(!p||!this.chart._chart||!this.chart._main)return null;
    const x=this.chart._chart.timeScale().timeToCoordinate(p.time);
    const y=this.chart._main.priceToCoordinate(p.price);
    if(x==null||y==null)return null;
    return {x,y};
  }
  _fmtPrice(v){
    const f=this.chart._main?.priceFormatter?.();
    if(f?.format)return f.format(v);
    const a=Math.abs(v);
    const d=a<1?4:a<100?2:0;
    return Number(v).toFixed(d);
  }
  _fmtSpan(sec){
    const s=Math.abs(sec);
    if(s<60)return `${s.toFixed(0)}s`;
    if(s<3600)return `${(s/60).toFixed(1)}m`;
    if(s<86400)return `${(s/3600).toFixed(1)}h`;
    return `${(s/86400).toFixed(1)}d`;
  }
  _styles(){
    const s=getComputedStyle(document.documentElement);
    return {
      accent:s.getPropertyValue('--accent').trim(),
      accentHl:s.getPropertyValue('--accent-hl').trim(),
      bg:s.getPropertyValue('--bg').trim(),
      bg2:s.getPropertyValue('--bg2').trim(),
      border:s.getPropertyValue('--bg5').trim(),
      text:s.getPropertyValue('--text').trim(),
      text2:s.getPropertyValue('--text2').trim(),
      green:s.getPropertyValue('--green').trim(),
      red:s.getPropertyValue('--red').trim(),
      font:s.getPropertyValue('--fnt').trim()||'system-ui, sans-serif',
    };
  }
  _tag(ctx,x,y,lines,opts={}){
    const padX=6,padY=4,lineH=13;
    ctx.save();
    ctx.font=`11px ${this._styles().font}`;
    const widths=lines.map(t=>ctx.measureText(t).width);
    const w=Math.max(...widths)+padX*2;
    const h=lines.length*lineH+padY*2;
    const left=opts.align==='right'?x-w:x;
    const top=y-h/2;
    ctx.fillStyle=opts.fill||this._styles().bg2;
    ctx.strokeStyle=opts.stroke||this._styles().border;
    ctx.lineWidth=1;
    ctx.beginPath();
    ctx.roundRect(left,top,w,h,4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle=opts.color||this._styles().text;
    ctx.textBaseline='top';
    ctx.textAlign='left';
    lines.forEach((t,i)=>ctx.fillText(t,left+padX,top+padY+i*lineH));
    ctx.restore();
  }
  _endpoints(ctx,a,b,color){
    ctx.save();
    ctx.fillStyle=color;
    [a,b].forEach(p=>{
      ctx.beginPath();
      ctx.arc(p.x,p.y,3,0,Math.PI*2);
      ctx.fill();
    });
    ctx.restore();
  }
  _drawLine(ctx,a,b,opts={}){
    const p1=this._xy(a);
    const p2=this._xy(b);
    if(!p1||!p2)return;
    ctx.save();
    ctx.strokeStyle=opts.color||this._styles().accent;
    ctx.lineWidth=opts.width||2;
    ctx.setLineDash(opts.dash||[]);
    ctx.lineCap='round';
    ctx.beginPath();
    ctx.moveTo(p1.x,p1.y);
    ctx.lineTo(p2.x,p2.y);
    ctx.stroke();
    if(opts.points!==false)this._endpoints(ctx,p1,p2,opts.color||this._styles().accent);
    ctx.restore();
  }
  _drawBrush(ctx,pts,opts={}){
    if(!pts||pts.length<2)return;
    const xy=pts.map(p=>this._xy(p)).filter(Boolean);
    if(xy.length<2)return;
    ctx.save();
    ctx.strokeStyle=opts.color||this._styles().accent;
    ctx.lineWidth=opts.width||2;
    ctx.lineCap='round';
    ctx.lineJoin='round';
    ctx.beginPath();
    ctx.moveTo(xy[0].x,xy[0].y);
    for(let i=1;i<xy.length;i++)ctx.lineTo(xy[i].x,xy[i].y);
    ctx.stroke();
    ctx.restore();
  }
  _drawMeasure(ctx,a,b,opts={}){
    const p1=this._xy(a);
    const p2=this._xy(b);
    if(!p1||!p2)return;
    const s=this._styles();
    ctx.save();
    ctx.strokeStyle=opts.color||s.accent;
    ctx.fillStyle=opts.color||s.accent;
    ctx.lineWidth=1.5;
    ctx.setLineDash([5,4]);
    ctx.beginPath();
    ctx.moveTo(p1.x,p1.y);
    ctx.lineTo(p2.x,p2.y);
    ctx.stroke();
    ctx.setLineDash([]);
    const dP=b.price-a.price;
    const pct=a.price?dP/a.price*100:0;
    const lines=[`Δ ${this._fmtPrice(dP)}`,`${pct>=0?'+':''}${pct.toFixed(2)}%`];
    const span=typeof a.time==='number'&&typeof b.time==='number'?Math.abs(b.time-a.time):null;
    if(span!=null)lines.push(this._fmtSpan(span));
    this._tag(ctx,(p1.x+p2.x)/2,(p1.y+p2.y)/2,lines,{fill:s.bg2,stroke:s.border,color:s.text});
    this._endpoints(ctx,p1,p2,opts.color||s.accent);
    ctx.restore();
  }
  _drawFib(ctx,a,b,opts={}){
    const p1=this._xy(a);
    const p2=this._xy(b);
    if(!p1||!p2)return;
    const s=this._styles();
    const levels=[0,.236,.382,.5,.618,.786,1];
    const w=this.canvas.clientWidth;
    ctx.save();
    ctx.setLineDash([6,4]);
    ctx.strokeStyle=opts.color||s.text2;
    ctx.fillStyle=opts.color||s.text2;
    ctx.lineWidth=1;
    levels.forEach(l=>{
      const price=a.price+(b.price-a.price)*l;
      const y=this.chart._main.priceToCoordinate(price);
      if(y==null)return;
      ctx.beginPath();
      ctx.moveTo(Math.min(p1.x,p2.x),y);
      ctx.lineTo(Math.max(p1.x,p2.x),y);
      ctx.stroke();
      const label=`${(l*100).toFixed(1)}%  ${this._fmtPrice(price)}`;
      this._tag(ctx,w-8,y,[label],{align:'right',fill:s.bg2,stroke:s.border,color:s.text});
    });
    ctx.setLineDash([]);
    this._endpoints(ctx,p1,p2,opts.color||s.accent);
    ctx.restore();
  }
  _drawSelectionHandles(ctx,s){
    const st=this._styles();
    const {r}=this._handleMetrics();
    ctx.save();
    ctx.fillStyle=st.bg;
    ctx.strokeStyle=st.accent;
    ctx.lineWidth=1.5;
    const drawHandle=(x,y)=>{
      ctx.beginPath();
      ctx.arc(x,y,r,0,Math.PI*2);
      ctx.fill();
      ctx.stroke();
    };
    if(s.type==='brush'){
      const first=this._xy(s.points[0]);
      const last=this._xy(s.points[s.points.length-1]);
      if(first)drawHandle(first.x,first.y);
      if(last&&(last.x!==first?.x||last.y!==first?.y))drawHandle(last.x,last.y);
    }else{
      const p1=this._xy(s.a);
      const p2=this._xy(s.b);
      if(p1)drawHandle(p1.x,p1.y);
      if(p2)drawHandle(p2.x,p2.y);
    }
    ctx.restore();
  }
  _drawShape(ctx,s,preview=false,selected=false){
    const alpha=preview?0.7:1;
    ctx.globalAlpha=alpha;
    if(s.type==='brush')this._drawBrush(ctx,s.points,{color:this._styles().accent,width:2});
    else if(s.type==='trend')this._drawLine(ctx,s.a,s.b,{color:this._styles().accent,width:2});
    else if(s.type==='measure')this._drawMeasure(ctx,s.a,s.b,{color:this._styles().accent});
    else if(s.type==='fib')this._drawFib(ctx,s.a,s.b,{color:this._styles().text2});
    ctx.globalAlpha=1;
    if(selected)this._drawSelectionHandles(ctx,s);
  }
  _draw(){
    if(!this.ctx)return;
    const ctx=this.ctx;
    const w=this.canvas.clientWidth;
    const h=this.canvas.clientHeight;
    ctx.clearRect(0,0,w,h);
    this.drawings.forEach((s,i)=>this._drawShape(ctx,s,false,this.mode==='select'&&i===this.selected));
    if(this.draft)this._drawShape(ctx,this.draft,true,false);
  }
  clear(){
    this.drawings=[];
    this.selected=null;
    this.dragState=null;
    this._cancelDraft();
  }
  setVisible(v){
    this.visible=!!v;
    this.container.classList.toggle('hidden',!this.visible);
  }
}