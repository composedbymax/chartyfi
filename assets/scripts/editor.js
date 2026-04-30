import { toast, confirm, deny } from './message.js';
import { createExplorePanel, createShareModal } from './editorShare.js';
import { codeIcon } from './svg.js';
import { tooltip } from './tooltip.js';
import { runBacktest } from './backtester.js';
import { openFullscreen } from './editorFullscreen.js';
const DB_NAME='indicator-snippets';
const DB_VER=1;
const STORE='snippets';
const HELP_CACHE_KEY='editor-help-content';
const HELP_JSON_URL='././api/editorHelp.json';
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
function openDB(){
  return new Promise((res,rej)=>{
    const req=indexedDB.open(DB_NAME,DB_VER);
    req.onupgradeneeded=e=>{
      const db=e.target.result;
      if(!db.objectStoreNames.contains(STORE)){
        const s=db.createObjectStore(STORE,{keyPath:'id',autoIncrement:true});
        s.createIndex('name','name',{unique:false});
      }
    };
    req.onsuccess=e=>res(e.target.result);
    req.onerror=e=>rej(e.target.error);
  });
}
async function listSnippets(){
  const db=await openDB();
  return new Promise((res,rej)=>{
    const tx=db.transaction(STORE,'readonly');
    const req=tx.objectStore(STORE).getAll();
    req.onsuccess=e=>res(e.target.result||[]);
    req.onerror=e=>rej(e.target.error);
  });
}
async function saveSnippet(name,code){
  const db=await openDB();
  return new Promise((res,rej)=>{
    const tx=db.transaction(STORE,'readwrite');
    const req=tx.objectStore(STORE).add({name,code,updatedAt:Date.now()});
    req.onsuccess=e=>res(e.target.result);
    req.onerror=e=>rej(e.target.error);
  });
}
async function updateSnippet(id,name,code){
  const db=await openDB();
  return new Promise((res,rej)=>{
    const tx=db.transaction(STORE,'readwrite');
    const req=tx.objectStore(STORE).put({id,name,code,updatedAt:Date.now()});
    req.onsuccess=e=>res(e.target.result);
    req.onerror=e=>rej(e.target.error);
  });
}
async function deleteSnippet(id){
  const db=await openDB();
  return new Promise((res,rej)=>{
    const tx=db.transaction(STORE,'readwrite');
    const req=tx.objectStore(STORE).delete(id);
    req.onsuccess=()=>res();
    req.onerror=e=>rej(e.target.error);
  });
}
async function fetchHelpContent(){
  const cached=sessionStorage.getItem(HELP_CACHE_KEY);
  if(cached) return cached;
  const res=await fetch(HELP_JSON_URL);
  if(!res.ok) throw new Error(`Failed to load help (${res.status})`);
  const json=await res.json();
  const html=String(json.html??'');
  sessionStorage.setItem(HELP_CACHE_KEY,html);
  return html;
}
function rawPaneOf(pf) {
  if (pf.type === 'hist' || pf.type === 'dot') {
    return pf.opts.pane != null ? pf.opts.pane : 1;
  }
  return pf.opts.pane != null ? pf.opts.pane : 0;
}
function nextFreePaneBase(indicatorGroups) {
  let next = 1;
  for (const g of indicatorGroups) {
    if (g._paneBase != null) {
      next = Math.max(next, g._paneBase + g._panesUsed);
    }
  }
  return next;
}
function buildPaneResolver(plotFns, indicatorGroups) {
  const rawPanes = plotFns.map(rawPaneOf);
  const subPanes = rawPanes.filter(p => p > 0);
  if (!subPanes.length) {
    return {
      _resolvePane: pf => rawPaneOf(pf),
      _paneBase: null,
      _panesUsed: 0,
    };
  }
  const _paneBase = nextFreePaneBase(indicatorGroups);
  const _panesUsed = Math.max(...subPanes);
  const _resolvePane = pf => {
    const raw = rawPaneOf(pf);
    if (raw === 0) return 0;
    return _paneBase + (raw - 1);
  };
  return { _resolvePane, _paneBase, _panesUsed };
}
export class Editor{
  constructor(container,chart){
    this.el=container;
    this.chart=chart;
    this._code='';
    this._snippetId=null;
    this._snippetName='Untitled';
    this._showHelp=false;
    this._helpLoaded=false;
    this._helpHtml='';
    this._indicatorGroups=[];
    this._indicatorListCollapsed=false;
    this._groupCounter=0;
    this._editingGroupId=null;
    this._rendered=false;
    this._shareUi=null;
    this._exploreUi=null;
    this._running=false;
    this.chart._chartOn('dataChanged', () => this._refreshIndicators());
  }
  _setHelpVisible(v){
    this._showHelp=v;
    if(this._rendered) this._updateHelpToggle();
  }
  clear(){
    this._clearOverlays(true);
  }
  _updateHelpToggle(){
    const edArea=this.el.querySelector('.ed-code-area');
    const helpArea=this.el.querySelector('.ed-help-area');
    const btn=this.el.querySelector('#ed-help-toggle');
    if(!edArea||!helpArea) return;
    if(this._showHelp){
      edArea.classList.add('hidden');
      helpArea.classList.remove('hidden');
      if(btn) btn.classList.add('active');
      this._ensureHelpContent(helpArea);
    }else{
      edArea.classList.remove('hidden');
      helpArea.classList.add('hidden');
      if(btn) btn.classList.remove('active');
    }
  }
  _ensureHelpContent(helpArea){
    if(this._helpHtml){
      helpArea.innerHTML=this._helpHtml;
      return;
    }
    helpArea.innerHTML='<p class="ed-help-loading">Loading…</p>';
    fetchHelpContent()
      .then(html=>{
        this._helpLoaded=true;
        this._helpHtml=html;
        helpArea.innerHTML=html;
        helpArea.querySelectorAll('pre').forEach(pre=>{
          const w=document.createElement('div');
          w.className='pre-wrap';
          pre.replaceWith(w);
          w.appendChild(pre);
          const b=document.createElement('button');
          b.className='pre-copy-btn';
          b.textContent='Copy';
          b.onclick=()=>navigator.clipboard.writeText(pre.textContent).then(()=>{b.textContent='✓';setTimeout(()=>{b.textContent='Copy'},1500)});
          w.appendChild(b);
        });
      })
      .catch(err=>{
        helpArea.innerHTML=`<p class="ed-help-error">Failed to load help content. ${err.message}</p>`;
      });
  }
  _showBtProgress(pct, label) {
    const wrap  = this.el.querySelector('#ed-bt-progress');
    const bar   = this.el.querySelector('#ed-bt-bar');
    const lbl   = this.el.querySelector('#ed-bt-label');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    if (bar) bar.style.width = Math.min(100, pct).toFixed(1) + '%';
    if (lbl) lbl.textContent = label || `Backtesting… ${pct.toFixed(0)}%`;
  }
  _hideBtProgress() {
    const wrap = this.el.querySelector('#ed-bt-progress');
    if (wrap) wrap.classList.add('hidden');
    const bar = this.el.querySelector('#ed-bt-bar');
    if (bar) bar.style.width = '0%';
  }
  _render(){
    this._rendered=true;
    this.el.innerHTML='';
    const toolbar=document.createElement('div');
    toolbar.className='ed-toolbar';
    toolbar.innerHTML=`
      <div class="ed-top-row">
        <input class="ed-name-in" id="ed-name" value="${this._snippetName}" placeholder="Snippet name">
        <button class="icon-btn ed-help-btn" id="ed-help-toggle" title="Help / Docs">?</button>
        <button class="btn-sm ed-share-btn" id="ed-share">Share</button>
        <button class="btn-sm ed-explore-btn" id="ed-explore">Explore</button>
      </div>
      <div class="ed-bottom-row">
        <select id="ed-snippets" class="ed-select"><option value="">— Load snippet —</option></select>
        <button class="btn-sm" id="ed-new">New</button>
        <button class="btn-sm" id="ed-save">Save</button>
        <button class="btn-sm danger" id="ed-delete">Del</button>
      </div>`;
    tooltip(toolbar.querySelector('#ed-help-toggle'), 'Help / Docs');
    tooltip(toolbar.querySelector('#ed-share'), 'Share indicator publicly');
    tooltip(toolbar.querySelector('#ed-explore'), 'Explore public indicators');
    tooltip(toolbar.querySelector('#ed-new'), 'Add new indicator');
    tooltip(toolbar.querySelector('#ed-save'), 'Save indicator locally');
    tooltip(toolbar.querySelector('#ed-delete'), 'Delete local indicator');
    this.el.appendChild(toolbar);
    const helpArea=document.createElement('div');
    helpArea.className='ed-help-area hidden';
    this.el.appendChild(helpArea);
    const codeArea=document.createElement('div');
    codeArea.className='ed-code-area';
    const taWrap=document.createElement('div');
    taWrap.className='ed-code-wrap';
    const ta=document.createElement('textarea');
    ta.className='ed-textarea';
    ta.id='ed-code';
    ta.spellcheck=false;
    ta.value=this._code;
    ta.placeholder='// Write indicator logic here\n// Access: bars, plot(), plotHist(), plotBand(), plotLabel()\n// Async supported: await backtest({ strategy, params })';
    const fsBtn=document.createElement('button');
    fsBtn.className='icon-btn ed-fs-btn';
    fsBtn.title='Fullscreen editor';
    fsBtn.innerHTML='⛶';
    fsBtn.onclick=()=>openFullscreen({code:this._code,name:this._snippetName,onChange:v=>{this._code=v;ta.value=v;},onClose:v=>{this._code=v;ta.value=v;}});
    taWrap.append(ta,fsBtn);
    codeArea.appendChild(taWrap);
    this.el.appendChild(codeArea);
    const runRow=document.createElement('div');
    runRow.className='ed-run-row';
    runRow.innerHTML=`
      <button class="btn-primary ed-run-btn" id="ed-run">▶ Run</button>
      <button class="btn-sm" id="ed-update">↺ Update</button>
      <button class="btn-sm" id="ed-clear">Clear All</button>`;
    tooltip(runRow.querySelector('#ed-run'), 'Run indicator');
    tooltip(runRow.querySelector('#ed-update'), 'Update chart');
    tooltip(runRow.querySelector('#ed-clear'), 'Clear all indicators');
    this.el.appendChild(runRow);
    const btProgress=document.createElement('div');
    btProgress.id='ed-bt-progress';
    btProgress.className='ed-bt-progress hidden';
    btProgress.innerHTML=`
      <div class="ed-bt-track"><div class="ed-bt-bar" id="ed-bt-bar"></div></div>
      <span class="ed-bt-label" id="ed-bt-label">Backtesting...</span>`;
    this.el.appendChild(btProgress);
    const indicatorList=document.createElement('div');
    indicatorList.className='ed-indicator-list';
    indicatorList.id='ed-indicator-list';
    this.el.appendChild(indicatorList);
    this._shareUi=createShareModal({getSource:()=>document.querySelector('.tv-lightweight-charts,#chart-wrap')});
    this._exploreUi=createExplorePanel({onLoad:item=>this._loadSharedItem(item)});
    this.el.appendChild(this._shareUi.root);
    this.el.appendChild(this._exploreUi.root);
    this._populateSnippets();
    this._bindEvents(ta);
    this._updateHelpToggle();
    this._renderIndicatorList();
  }
  _loadSharedItem(item){
    this._snippetId=null;
    this._snippetName=item.name||'Untitled';
    this._code=item.code||'';
    const ta=this.el.querySelector('#ed-code');
    const name=this.el.querySelector('#ed-name');
    const sel=this.el.querySelector('#ed-snippets');
    if(ta) ta.value=this._code;
    if(name) name.value=this._snippetName;
    if(sel) sel.value='';
    toast(item.description||item.name||'Untitled','info',6000);
    this._run().then(()=>{
      const last=this._indicatorGroups[this._indicatorGroups.length-1];
      if(last){ this._editingGroupId=last.id; this._renderIndicatorList(); }
    });
  }
  async _populateSnippets(){
    const sel=this.el.querySelector('#ed-snippets');
    if(!sel) return;
    const items=await listSnippets().catch(()=>[]);
    sel.innerHTML='<option value="">— Load snippet —</option>';
    items.forEach(s=>{
      const o=document.createElement('option');
      o.value=s.id;
      o.textContent=s.name;
      if(s.id===this._snippetId) o.selected=true;
      sel.appendChild(o);
    });
  }
  _bindEvents(ta){
    ta.oninput=()=>{this._code=ta.value};
    ta.onkeydown=e=>{
      if(e.key==='Tab'){
        e.preventDefault();
        const s=ta.selectionStart,end=ta.selectionEnd;
        ta.value=ta.value.substring(0,s)+'  '+ta.value.substring(end);
        ta.selectionStart=ta.selectionEnd=s+2;
        this._code=ta.value;
      }
    };
    this.el.querySelector('#ed-name').oninput=e=>{this._snippetName=e.target.value};
    this.el.querySelector('#ed-help-toggle').onclick=()=>{this._showHelp=!this._showHelp;this._updateHelpToggle()};
    this.el.querySelector('#ed-share').onclick=()=>{this._shareUi.open({name:this._snippetName,code:this._code})};
    this.el.querySelector('#ed-explore').onclick=()=>{this._exploreUi.open()};
    this.el.querySelector('#ed-new').onclick=()=>{
      this._code='';this._snippetId=null;this._snippetName='Untitled';
      this._editingGroupId=null;
      ta.value='';
      this.el.querySelector('#ed-name').value='Untitled';
      this.el.querySelector('#ed-snippets').value='';
      this._renderIndicatorList();
    };
    this.el.querySelector('#ed-save').onclick=async()=>{
      const name=this._snippetName.trim()||'Untitled';
      try{
        if(this._snippetId){
          await updateSnippet(this._snippetId,name,this._code);
          toast('Snippet updated','success');
        }else{
          this._snippetId=await saveSnippet(name,this._code);
          toast('Snippet saved','success');
        }
        await this._populateSnippets();
      }catch(e){
        deny('Failed to save snippet: '+e.message);
      }
    };
    this.el.querySelector('#ed-delete').onclick=async()=>{
      if(!this._snippetId) return;
      const ok=await confirm(`Delete "${this._snippetName}"?`);
      if(!ok) return;
      try{
        await deleteSnippet(this._snippetId);
        this._snippetId=null;this._code='';this._snippetName='Untitled';
        ta.value='';
        this.el.querySelector('#ed-name').value='Untitled';
        await this._populateSnippets();
        toast('Snippet deleted','info');
      }catch(e){
        deny('Failed to delete snippet: '+e.message);
      }
    };
    this.el.querySelector('#ed-snippets').onchange=async e=>{
      const id=parseInt(e.target.value);
      if(!id) return;
      try{
        const db=await openDB();
        const tx=db.transaction(STORE,'readonly');
        const req=tx.objectStore(STORE).get(id);
        req.onsuccess=ev=>{
          const s=ev.target.result;
          if(!s) return;
          this._snippetId=s.id;
          this._snippetName=s.name;
          this._code=s.code;
          ta.value=s.code;
          this.el.querySelector('#ed-name').value=s.name;
          toast(`Loaded "${s.name}"`,'info');
        };
        req.onerror=()=>deny('Failed to load snippet');
      }catch(e){
        deny('Failed to load snippet: '+e.message);
      }
    };
    this.el.querySelector('#ed-run').onclick=()=>this._run();
    this.el.querySelector('#ed-update').onclick=()=>this._update();
    this.el.querySelector('#ed-clear').onclick=()=>this._clearOverlays();
  }
  _clearOverlays(silent=false){
    this._indicatorGroups.forEach(g=>{
      g.series.forEach(s=>{try{this.chart._chart.removeSeries(s)}catch(e){}});
    });
    this._indicatorGroups=[];
    this._editingGroupId=null;
    this.chart._clearIndicators();
    if(typeof this.chart.clearTrades==='function') this.chart.clearTrades();
    this._renderIndicatorList();
    this.chart._forceResize();
    if(!silent) toast('All overlays cleared','info');
  }
  _removeGroup(id){
    const idx=this._indicatorGroups.findIndex(g=>g.id===id);
    if(idx===-1) return;
    const g=this._indicatorGroups[idx];
    g.series.forEach(s=>{try{this.chart._chart.removeSeries(s)}catch(e){}});
    this._indicatorGroups.splice(idx,1);
    if(this._editingGroupId===id) this._editingGroupId=null;
    const remaining=this._indicatorGroups.flatMap(grp=>grp.plotFns||[]);
    this.chart._setIndicators(remaining);
    this._renderIndicatorList();
    this.chart._forceResize();
    toast(`Removed "${g.name}"`,'info');
  }
  _renderIndicatorList(){
    const el=this.el.querySelector('#ed-indicator-list');
    if(!el) return;
    if(!this._indicatorGroups.length){
      el.innerHTML='';
      el.classList.remove('has-items');
      return;
    }
    el.classList.add('has-items');
    el.innerHTML='';
    const hdr=document.createElement('div');
    hdr.className='ed-indlist-hdr';
    const caret=document.createElement('span');
    caret.className='ed-indlist-caret';
    caret.setAttribute('aria-label','Toggle indicator list');
    caret.innerHTML=this._indicatorListCollapsed?'&#9654;':'&#9660;';
    const hdrLabel=document.createElement('span');
    hdrLabel.textContent='Active indicators';
    hdr.appendChild(caret);
    hdr.appendChild(hdrLabel);
    hdr.onclick=()=>{
      this._indicatorListCollapsed=!this._indicatorListCollapsed;
      caret.innerHTML=this._indicatorListCollapsed?'&#9654;':'&#9660;';
      rows.forEach(r=>r.style.display=this._indicatorListCollapsed?'none':'');
    };
    el.appendChild(hdr);
    const rows=[];
    this._indicatorGroups.forEach(g=>{
      const row=document.createElement('div');
      row.className='ed-indicator-row';
      if(g.id===this._editingGroupId) row.classList.add('ed-indicator-row--selected');
      if(this._indicatorListCollapsed) row.style.display='none';
      const swatch=document.createElement('span');
      swatch.className='ed-ind-swatch';
      swatch.style.background=g.color||'#a78bfa';
      const lbl=document.createElement('span');
      lbl.className='ed-indicator-lbl';
      lbl.textContent=g.name;
      lbl.title=g.name;
      const editBtn=document.createElement('button');
      editBtn.className='icon-btn ed-indicator-edit';
      editBtn.title=`Load "${g.name}" into editor`;
      editBtn.appendChild(codeIcon({width:14,height:14}));
      editBtn.onclick=e=>{
        e.stopPropagation();
        this._editingGroupId=g.id;
        this._snippetName=g.name;
        this._code=g.code||'';
        const ta=this.el.querySelector('#ed-code');
        const nameIn=this.el.querySelector('#ed-name');
        if(ta) ta.value=this._code;
        if(nameIn) nameIn.value=this._snippetName;
        this._renderIndicatorList();
        toast(`Editing "${g.name}"`,'info');
      };
      const badge=document.createElement('span');
      badge.className='ed-ind-badge';
      badge.textContent=g.series.length;
      const rmBtn=document.createElement('button');
      rmBtn.className='icon-btn ed-indicator-rm';
      rmBtn.innerHTML='&times;';
      rmBtn.title=`Remove "${g.name}"`;
      rmBtn.onclick=e=>{e.stopPropagation();this._removeGroup(g.id)};
      row.append(swatch,lbl,editBtn,badge,rmBtn);
      el.appendChild(row);
      rows.push(row);
    });
  }
  async _update(){
    if(!this._editingGroupId){
      toast('No indicator selected','warn');
      return;
    }
    const idx=this._indicatorGroups.findIndex(g=>g.id===this._editingGroupId);
    if(idx===-1){
      toast('Selected indicator no longer exists','warn');
      this._editingGroupId=null;
      return;
    }
    const old=this._indicatorGroups[idx];
    old.series.forEach(s=>{try{this.chart._chart.removeSeries(s)}catch(e){}});
    this._indicatorGroups.splice(idx,1);
    await this._run();
    if(this._indicatorGroups.length){
      this._editingGroupId=this._indicatorGroups[this._indicatorGroups.length-1].id;
      this._renderIndicatorList();
    }
  }
  async _refreshIndicators() {
    if (!this._indicatorGroups.length) return;
    const groups = [...this._indicatorGroups];
    const selectedIndex = groups.findIndex(g => g.id === this._editingGroupId);
    const savedCode = this._code;
    const savedName = this._snippetName;
    const savedSnippetId = this._snippetId;
    groups.forEach(g => {
      g.series.forEach(s => {
        try { this.chart._chart.removeSeries(s); } catch (e) {}
      });
    });
    this.chart._clearIndicators();
    this._indicatorGroups = [];
    this._editingGroupId = null;
    for (const g of groups) {
      this._snippetName = g.name;
      this._code = g.code || '';
      await this._run(true);
    }
    this._code = savedCode;
    this._snippetName = savedName;
    this._snippetId = savedSnippetId;
    if (selectedIndex >= 0 && this._indicatorGroups[selectedIndex]) {
      this._editingGroupId = this._indicatorGroups[selectedIndex].id;
    } else {
      this._editingGroupId = this._indicatorGroups.at(-1)?.id ?? null;
    }
    this._renderIndicatorList();
  }
  async _run(silent = false) {
    if (this._running) {
      if (!silent) toast('Already running…', 'warn');
      return;
    }
    this._running = true;
    const runBtn = this.el.querySelector('#ed-run');
    if (runBtn) { runBtn.disabled = true; runBtn.textContent = 'Running'; }
    try {
      await this._runInner(silent);
    } finally {
      this._running = false;
      this._hideBtProgress();
      if (runBtn) { runBtn.disabled = false; runBtn.textContent = '▶ Run'; }
    }
  }
  async _runInner(silent = false) {
    const bars = this.chart._getCurrentData();
    if (!bars.length) {
      if (!silent) deny('No chart data available');
      return;
    }
    const plotFns = [];
    const trades  = [];
    const findBar  = time => bars.find(b => b.time === time) || null;
    const normTrade = (type, time, price) => {
      const bar = findBar(time);
      const px  = price != null ? price : (bar ? bar.close : null);
      if (time == null || px == null) return;
      trades.push({ type, time, price: px });
    };
    const plot       = (label, data, opts = {}) => plotFns.push({ type: 'line',   label, data, opts });
    const plotHist   = (label, data, opts = {}) => plotFns.push({ type: 'hist',   label, data, opts });
    const plotBand   = (label, upper, lower, opts = {}) => plotFns.push({ type: 'band',  label, upper, lower, opts });
    const plotDot    = (label, data, opts = {}) => plotFns.push({ type: 'dot',    label, data, opts });
    const plotArea   = (label, data, opts = {}) => plotFns.push({ type: 'area',   label, data, opts });
    const plotCandle = (label, data, opts = {}) => plotFns.push({ type: 'candle', label, data, opts });
    const plotLabel  = (label, data, opts = {}) => plotFns.push({ type: 'label',  label, data, opts });
    const buy        = (time, price) => normTrade('buy',  time, price);
    const sell       = (time, price) => normTrade('sell', time, price);
    const backtest = (opts) => {
      return runBacktest({
        ...opts,
        bars,
        onProgress: (pct, done, total) => {
          this._showBtProgress(pct, `Backtesting... ${done}/${total} (${pct.toFixed(0)}%)`);
          if (opts.onProgress) opts.onProgress(pct, done, total);
        },
      });
    };
    try {
      const fn = new AsyncFunction(
        'bars', 'plot', 'plotHist', 'plotBand', 'plotDot', 'plotArea', 'plotCandle',
        'plotLabel',
        'buy', 'sell', 'backtest',
        this._code
      );
      await fn(bars, plot, plotHist, plotBand, plotDot, plotArea, plotCandle, plotLabel, buy, sell, backtest);
    } catch (err) {
      if (!silent) deny('Error: ' + err.message);
      return;
    }
    if (!plotFns.length && !trades.length) {
      if (!silent) toast('No series produced', 'warn');
      return;
    }
    const allIndicators = [
      ...this._indicatorGroups.flatMap(g => g.plotFns || []),
      ...plotFns
    ];
    this.chart._setIndicators(allIndicators);
    if (trades.length && typeof this.chart.setTrades === 'function') {
      this.chart.setTrades(trades);
    }
    const groupColor  = plotFns[0]?.opts?.color || plotFns[0]?.opts?.upColor || '#a78bfa';
    const groupId     = ++this._groupCounter;
    const groupName   = this._snippetName.trim() || `Run ${groupId}`;
    const groupSeries = [];
    const { _resolvePane, _paneBase, _panesUsed } = buildPaneResolver(plotFns, this._indicatorGroups);
    plotFns.forEach(pf => {
      try {
        const pane = _resolvePane(pf);
        let s = null;
        if (pf.type === 'line') {
          s = this.chart._chart.addSeries(LightweightCharts.LineSeries, {
            color:     pf.opts.color     || '#a78bfa',
            lineWidth: pf.opts.lineWidth || 2,
            lineStyle: pf.opts.lineStyle || 0,
            title:     pf.label
          }, pane);
          s.setData(pf.data);
        } else if (pf.type === 'hist') {
          s = this.chart._chart.addSeries(LightweightCharts.HistogramSeries, {
            color: pf.opts.color || '#3b82f6',
            title: pf.label
          }, pane);
          s.setData(pf.data);
        } else if (pf.type === 'band') {
          const c  = pf.opts.color || '#a78bfa';
          const su = this.chart._chart.addSeries(LightweightCharts.LineSeries, { color: c, lineWidth: 1, title: pf.label + ' U' }, pane);
          const sl = this.chart._chart.addSeries(LightweightCharts.LineSeries, { color: c, lineWidth: 1, title: pf.label + ' L' }, pane);
          su.setData(pf.upper);
          sl.setData(pf.lower);
          groupSeries.push(su, sl);
        } else if (pf.type === 'dot') {
          s = this.chart._chart.addSeries(LightweightCharts.LineSeries, {
            color:                   pf.opts.color || '#f59e0b',
            lineVisible:             false,
            pointMarkersVisible:     true,
            lastValueVisible:        false,
            priceLineVisible:        false,
            crosshairMarkerVisible:  false,
            title:                   pf.label
          }, pane);
          s.setData(pf.data);
        } else if (pf.type === 'area') {
          s = this.chart._chart.addSeries(LightweightCharts.AreaSeries, {
            lineColor:   pf.opts.color      || '#a78bfa',
            topColor:    pf.opts.topColor   || 'rgba(167,139,250,0.35)',
            bottomColor: pf.opts.bottomColor|| 'rgba(167,139,250,0.02)',
            lineWidth:   pf.opts.lineWidth  || 2,
            title:       pf.label
          }, pane);
          s.setData(pf.data);
        } else if (pf.type === 'candle') {
          s = this.chart._chart.addSeries(LightweightCharts.CandlestickSeries, {
            upColor:        pf.opts.upColor   || '#22c55e',
            downColor:      pf.opts.downColor || '#ef4444',
            borderUpColor:  pf.opts.upColor   || '#22c55e',
            borderDownColor:pf.opts.downColor || '#ef4444',
            wickUpColor:    pf.opts.upColor   || '#22c55e',
            wickDownColor:  pf.opts.downColor || '#ef4444',
            title:          pf.label
          }, pane);
          s.setData(pf.data);
        } else if (pf.type === 'label') {
          s = this.chart._chart.addSeries(LightweightCharts.LineSeries, {
            lineVisible:            false,
            pointMarkersVisible:    false,
            lastValueVisible:       false,
            priceLineVisible:       false,
            crosshairMarkerVisible: false,
            title:                  ''
          }, pane);
          s.setData(pf.data.map(d => ({ time: d.time, value: d.value })));
          const markers = pf.data
            .filter(d => d.text != null)
            .map(d => ({
              time:     d.time,
              position: d.position || pf.opts.position || 'aboveBar',
              color:    d.color    || pf.opts.color    || '#e2e8f0',
              shape:    d.shape    || pf.opts.shape    || 'circle',
              text:     String(d.text),
              size:     d.size     || pf.opts.size     || 1,
            }));
          if (markers.length) LightweightCharts.createSeriesMarkers(s, markers);
        }
        if (s) groupSeries.push(s);
      } catch (e) {
        if (!silent) deny('Plot error (' + pf.label + '): ' + e.message);
      }
    });
    if (groupSeries.length) {
      this._indicatorGroups.push({
        id: groupId,
        name: groupName,
        color: groupColor,
        series: groupSeries,
        plotFns,
        code: this._code,
        _paneBase,
        _panesUsed,
      });
      this._editingGroupId = groupId;
      if (!silent) {
        this._renderIndicatorList();
        toast(`"${groupName}" added (${groupSeries.length} series)`, 'success');
      }
    }
    if (trades.length && !silent) toast(`Recorded ${trades.length} trades`, 'success');
  }
}