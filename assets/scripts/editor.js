import {toast,confirm,deny} from './message.js';
import {createExplorePanel,createShareModal} from './editorShare.js';
import {codeIcon} from './svg.js';
import {tooltip} from './tooltip.js';
import {runBacktest} from './backtester.js';
import {openFullscreen} from './editorFullscreen.js';
import {attachSpinner} from './spinner.js';
import {PaneOverlayManager} from './paneOverlayManager.js';
const DB_NAME='indicator-snippets';
const DB_VER=1;
const STORE='snippets';
const HELP_CACHE_KEY='editor-help-content';
const HELP_JSON_URL='././api/data/editorHelp.json';
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
export class Editor{
  constructor(container, chart) {
    this.el = container;
    this.chart = chart;
    this._code = '';
    this._snippetId = null;
    this._snippetName = 'Untitled';
    this._showHelp = false;
    this._helpLoaded = false;
    this._helpHtml = '';
    this._pom = new PaneOverlayManager(chart);
    this._indicatorListCollapsed = false;
    this._editingGroupId = null;
    this._rendered = false;
    this._shareUi = null;
    this._exploreUi = null;
    this._activeCtrl = null;
    this._refreshSnapshot = null;
    this._refreshTimer = null;
    this._helpSpinner = null;
    this.chart._chartOn('dataChanged', () => this._refreshIndicators());
  }
  _cancelActive() {
    if (this._activeCtrl) {
      this._activeCtrl.abort();
      this._activeCtrl = null;
    }
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
      if(this._helpSpinner){ this._helpSpinner.destroy(); this._helpSpinner = null; }
      helpArea.innerHTML=this._helpHtml;
      return;
    }
    helpArea.innerHTML='';
    if(!this._helpSpinner){this._helpSpinner = attachSpinner(helpArea,{ size: 40, color: 'var(--accent)' });}
    this._helpSpinner.show();
    requestAnimationFrame(() => {
      fetchHelpContent()
        .then(html=>{
          this._helpLoaded=true;
          this._helpHtml=html;
          if(this._helpSpinner){ this._helpSpinner.destroy(); this._helpSpinner = null; }
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
          if(this._helpSpinner){ this._helpSpinner.destroy(); this._helpSpinner = null; }
          helpArea.innerHTML=`<p class="ed-help-error">Failed to load help content. ${err.message}</p>`;
        });
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
  _render() {
    this._rendered = true;
    this.el.innerHTML = '';
    const toolbar = document.createElement('div');
    toolbar.className = 'ed-toolbar';
    toolbar.innerHTML = `
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
    const helpArea = document.createElement('div');
    helpArea.className = 'ed-help-area hidden';
    this.el.appendChild(helpArea);
    const codeArea = document.createElement('div');
    codeArea.className = 'ed-code-area';
    const taWrap = document.createElement('div');
    taWrap.className = 'ed-code-wrap';
    const ta = document.createElement('textarea');
    ta.className = 'ed-textarea';
    ta.id = 'ed-code';
    ta.spellcheck = false;
    ta.value = this._code;
    ta.placeholder = '// Write indicator logic here\n// Access: bars, plot(), plotHist(), plotBand(), plotLabel()\n// Async supported: await backtest({ strategy, params })';
    const fsBtn = document.createElement('button');
    fsBtn.className = 'icon-btn ed-fs-btn';
    fsBtn.title = 'Fullscreen editor';
    fsBtn.innerHTML = '⛶';
    fsBtn.onclick = () => openFullscreen({ code: this._code, name: this._snippetName, onChange: v => { this._code = v; ta.value = v; }, onClose: v => { this._code = v; ta.value = v; } });
    taWrap.append(ta, fsBtn);
    codeArea.appendChild(taWrap);
    this.el.appendChild(codeArea);
    const runRow = document.createElement('div');
    runRow.className = 'ed-run-row';
    runRow.innerHTML = `
      <button class="btn-primary ed-run-btn" id="ed-run">▶ Run</button>
      <button class="btn-sm" id="ed-update">↺ Update</button>
      <button class="btn-sm" id="ed-clear">Clear All</button>`;
    tooltip(runRow.querySelector('#ed-run'), 'Run indicator');
    tooltip(runRow.querySelector('#ed-update'), 'Update chart');
    tooltip(runRow.querySelector('#ed-clear'), 'Clear all indicators');
    this.el.appendChild(runRow);
    const btProgress = document.createElement('div');
    btProgress.id = 'ed-bt-progress';
    btProgress.className = 'ed-bt-progress hidden';
    btProgress.innerHTML = `
      <div class="ed-bt-track"><div class="ed-bt-bar" id="ed-bt-bar"></div></div>
      <span class="ed-bt-label" id="ed-bt-label">Backtesting...</span>
      <button class="ed-bt-cancel" id="ed-bt-cancel" title="Cancel backtest">&times;</button>`;
    this.el.appendChild(btProgress);
    const indicatorList = document.createElement('div');
    indicatorList.className = 'ed-indicator-list';
    indicatorList.id = 'ed-indicator-list';
    this.el.appendChild(indicatorList);
    this._shareUi = createShareModal({ getSource: () => document.querySelector('.tv-lightweight-charts,#chart-wrap') });
    this._exploreUi = createExplorePanel({ onLoad: item => this._loadSharedItem(item) });
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
      const groups=this._pom.getGroups();
      const last=groups[groups.length-1];
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
  _bindEvents(ta) {
    ta.oninput = () => { this._code = ta.value };
    ta.onkeydown = e => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const s = ta.selectionStart, end = ta.selectionEnd;
        ta.value = ta.value.substring(0, s) + '  ' + ta.value.substring(end);
        ta.selectionStart = ta.selectionEnd = s + 2;
        this._code = ta.value;
      }
    };
    this.el.querySelector('#ed-name').oninput = e => { this._snippetName = e.target.value };
    this.el.querySelector('#ed-help-toggle').onclick = () => { this._showHelp = !this._showHelp; this._updateHelpToggle() };
    this.el.querySelector('#ed-share').onclick = () => { this._shareUi.open({ name: this._snippetName, code: this._code }) };
    this.el.querySelector('#ed-explore').onclick = () => { this._exploreUi.open() };
    this.el.querySelector('#ed-new').onclick = () => {
      this._code = ''; this._snippetId = null; this._snippetName = 'Untitled';
      this._editingGroupId = null;
      ta.value = '';
      this.el.querySelector('#ed-name').value = 'Untitled';
      this.el.querySelector('#ed-snippets').value = '';
      this._renderIndicatorList();
    };
    this.el.querySelector('#ed-save').onclick = async () => {
      const name = this._snippetName.trim() || 'Untitled';
      try {
        if (this._snippetId) {
          await updateSnippet(this._snippetId, name, this._code);
          toast('Snippet updated', 'success');
        } else {
          this._snippetId = await saveSnippet(name, this._code);
          toast('Snippet saved', 'success');
        }
        await this._populateSnippets();
      } catch (e) {
        deny('Failed to save snippet: ' + e.message);
      }
    };
    this.el.querySelector('#ed-delete').onclick = async () => {
      if (!this._snippetId) return;
      const ok = await confirm(`Delete "${this._snippetName}"?`);
      if (!ok) return;
      try {
        await deleteSnippet(this._snippetId);
        this._snippetId = null; this._code = ''; this._snippetName = 'Untitled';
        ta.value = '';
        this.el.querySelector('#ed-name').value = 'Untitled';
        await this._populateSnippets();
        toast('Snippet deleted', 'info');
      } catch (e) {
        deny('Failed to delete snippet: ' + e.message);
      }
    };
    this.el.querySelector('#ed-snippets').onchange = async e => {
      const id = parseInt(e.target.value);
      if (!id) return;
      try {
        const db = await openDB();
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).get(id);
        req.onsuccess = ev => {
          const s = ev.target.result;
          if (!s) return;
          this._snippetId = s.id;
          this._snippetName = s.name;
          this._code = s.code;
          ta.value = s.code;
          this.el.querySelector('#ed-name').value = s.name;
          toast(`Loaded "${s.name}"`, 'info');
        };
        req.onerror = () => deny('Failed to load snippet');
      } catch (e) {
        deny('Failed to load snippet: ' + e.message);
      }
    };
    this.el.querySelector('#ed-run').onclick = () => this._run();
    this.el.querySelector('#ed-update').onclick = () => this._update();
    this.el.querySelector('#ed-clear').onclick = () => this._clearOverlays();
    this.el.querySelector('#ed-bt-cancel').onclick = () => this._cancelActive();
  }
  _clearOverlays(silent=false){
    this._pom.clearAll();
    this._editingGroupId=null;
    if(typeof this.chart.clearTrades==='function') this.chart.clearTrades();
    this._renderIndicatorList();
    if(!silent) toast('All overlays cleared','info');
  }
  _removeGroup(id){
    const g=this._pom.removeGroup(id);
    if(!g) return;
    if(this._editingGroupId===id) this._editingGroupId=null;
    this._renderIndicatorList();
    toast(`Removed "${g.name}"`,'info');
  }
  _renderIndicatorList(){
    const el=this.el.querySelector('#ed-indicator-list');
    if(!el) return;
    const groups=this._pom.getGroups();
    if(!groups.length){
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
    groups.forEach(g=>{
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
    if(!this._editingGroupId){toast('No indicator selected','warn'); return;}
    const groups=this._pom.getGroups();
    const idx=groups.findIndex(g=>g.id===this._editingGroupId);
    if(idx===-1){
      toast('Selected indicator no longer exists','warn');
      this._editingGroupId=null;
      return;
    }
    this._refreshSnapshot=groups.map(g=>
      g.id===this._editingGroupId
        ?{...g,code:this._code,name:this._snippetName.trim()||g.name}
        :g
    );
    await this._doRefresh();
  }
  async _doRefresh() {
    const groups = this._refreshSnapshot;
    if (!groups?.length) return;
    this._cancelActive();
    const ctrl = new AbortController();
    this._activeCtrl = ctrl;
    const signal = ctrl.signal;
    const selectedIndex = groups.findIndex(g => g.id === this._editingGroupId);
    const savedCode = this._code;
    const savedName = this._snippetName;
    const savedSnippetId = this._snippetId;
    this._pom.clearAll();
    this._editingGroupId = null;
    for (const g of groups) {
      if (signal.aborted) break;
      this._snippetName = g.name;
      this._code = g.code || '';
      await this._run(true, signal);
    }
    if (signal.aborted) {
      if (this._activeCtrl === ctrl) this._activeCtrl = null;
      return;
    }
    this._refreshSnapshot = null;
    this._code = savedCode;
    this._snippetName = savedName;
    this._snippetId = savedSnippetId;
    const newGroups = this._pom.getGroups();
    if (selectedIndex >= 0 && newGroups[selectedIndex]) {
      this._editingGroupId = newGroups[selectedIndex].id;
    } else {
      this._editingGroupId = newGroups.at(-1)?.id ?? null;
    }
    this._renderIndicatorList();
    if (this._activeCtrl === ctrl) this._activeCtrl = null;
  }
  _refreshIndicators() {
    const groups=this._pom.getGroups();
    if (groups.length) {
      this._refreshSnapshot = [...groups];
    }
    clearTimeout(this._refreshTimer);
    this._refreshTimer = setTimeout(() => this._doRefresh(), 200);
  }
  async _run(silent = false, signal = null) {
    const isOwned = !signal;
    if (isOwned) {
      this._cancelActive();
      const ctrl = new AbortController();
      this._activeCtrl = ctrl;
      signal = ctrl.signal;
    }
    if (signal.aborted) return;
    const runBtn = this.el.querySelector('#ed-run');
    if (isOwned && runBtn) { runBtn.disabled = true; runBtn.textContent = 'Running'; }
    try {
      await this._runInner(silent, signal);
    } catch (e) {
      if (e?.name !== 'AbortError' && !silent) deny('Error: ' + e.message);
    } finally {
      this._hideBtProgress();
      if (isOwned && runBtn) { runBtn.disabled = false; runBtn.textContent = '▶ Run'; }
      if (isOwned && this._activeCtrl?.signal === signal) this._activeCtrl = null;
    }
  }
  async _runInner(silent = false, signal = null) {
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
        signal,
        onProgress: (pct, done, total) => {
          this._showBtProgress(pct, `Backtesting... ${done}/${total} (${pct.toFixed(0)}%)`);
          if (opts.onProgress) opts.onProgress(pct, done, total);
        },
      });
    };
    try {
      const fn = new AsyncFunction(
        'bars', 'plot', 'plotHist', 'plotBand', 'plotDot', 'plotArea', 'plotCandle',
        'plotLabel', 'buy', 'sell', 'backtest',
        this._code
      );
      await fn(bars, plot, plotHist, plotBand, plotDot, plotArea, plotCandle, plotLabel, buy, sell, backtest);
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      if (!silent) deny('Error: ' + err.message);
      return;
    }
    if (signal?.aborted) return;
    if (!plotFns.length && !trades.length) {
      if (!silent) toast('No series produced', 'warn');
      return;
    }
    if (trades.length && typeof this.chart.setTrades === 'function') {
      this.chart.setTrades(trades);
    }
    if (plotFns.length) {
      const groupColor = plotFns[0]?.opts?.color || plotFns[0]?.opts?.upColor || '#a78bfa';
      const groupName = this._snippetName.trim() || `Run ${this._pom.getGroups().length + 1}`;
      const group = this._pom.addGroup(plotFns, groupName, this._code, groupColor, silent);
      if (group) {
        this._editingGroupId = group.id;
        if (!silent) {
          this._renderIndicatorList();
          toast(`"${groupName}" added (${group.series.length} series)`, 'success');
        }
      }
    }
    if (trades.length && !silent) toast(`Recorded ${trades.length} trades`, 'success');
  }
}