import {toast,confirm,deny} from './message.js';
import {settingsIcon,codeIcon,miniAppsIcon} from './svg.js';
import {Chart,INTERVALS} from './chart.js';
import {Exporter} from './export.js';
import {Editor} from './editor.js';
import {tooltip} from './tooltip.js';
import {Settings} from './settings.js';
import {storage} from './storage.js';
import {MiniApps} from './miniApps.js';
export class Sidebar {
  constructor(container,chart,api,config,localTimezone){
    this.el=container;this.chart=chart;this.api=api;this.config=config;
    this.open=false;this.showSettings=false;this.showEditor=false;this.showMiniApps=false;this._activeApp=null;
    this._config=config;
    this._localTz=localTimezone||'UTC';
    this._chartTz='UTC';
    this.onTimezoneChange=null;
    this._editor=new Editor(document.createElement('div'),chart);
    this._settings=new Settings(chart,api,config,this._localTz,{
      onTzChange:tz=>{this._chartTz=tz;this._applyChartTz();},
      onRerender:()=>this._renderSidebar(),
    });
    this._miniApps=new MiniApps(chart,api);
    this.api._getChartTz().then(tz=>{
      if(tz&&tz!==this._chartTz){this._chartTz=tz;this._applyChartTz();}
    }).catch(()=>{});
    this._renderSidebar();
    this._restoreChartPrefs();
    this._exporter=new Exporter(chart);
    this._exporter.timezone=this._chartTz;
    this.chart._chartOn('barsChanged',({count})=>this._updateBarCount(count));
    this.chart._chartOn('load',({int})=>this._updateActiveTf(int));
    document.addEventListener('symbol-changed',e=>this._onSymbolChange(e.detail));
    this._handleOutsideClick=this._handleOutsideClick.bind(this);
    this._handleKeydown=this._handleKeydown.bind(this);
    document.addEventListener('click',this._handleOutsideClick);
    document.addEventListener('keydown',this._handleKeydown);
    this.el.addEventListener('click',e=>e.stopPropagation());
  }
  _updateActiveTf(int){
    this.el.querySelectorAll('.tf-btn').forEach(b=>{
      b.classList.toggle('active',b.dataset.int===int);
    });
  }
  _applyChartTz(){
    if(this._exporter) this._exporter.timezone=this._chartTz;
    if(this.onTimezoneChange) this.onTimezoneChange(this._chartTz);
  }
  _restoreChartPrefs(){
    const mode=storage.getChartMode();
    const field=storage.getChartField();
    const vol=storage.getChartVol();
    if(mode) this.chart._setMode(mode);
    if(field) this.chart._setField(field);
    if(vol) this.chart._setVolMode(vol);
  }
  _handleOutsideClick(e){
    if(!this.open) return;
    if(storage.getSidebarSticky()) return;
    if(e.target.closest('#export-table-overlay')) return;
    const sidebarEl=document.getElementById('sidebar');
    const toggleBtn=document.getElementById('sb-toggle');
    if(!sidebarEl.contains(e.target)&&!toggleBtn?.contains(e.target)) this.toggle();
  }
  _handleKeydown(e){
    if(e.key==='Escape'&&this.open&&!storage.getSidebarSticky()) this.toggle();
  }
  toggle(){
    this.open=!this.open;
    document.getElementById('sidebar').classList.toggle('open',this.open);
  }
  _setSidebarWidth(w,mobileW){
    const el=document.getElementById('sidebar');
    if(w) el.style.setProperty('--sb-w-override',typeof w==='number'?w+'px':w);
    else el.style.removeProperty('--sb-w-override');
    if(mobileW) el.style.setProperty('--sb-w-mobile-override',typeof mobileW==='number'?mobileW+'px':mobileW);
    else el.style.removeProperty('--sb-w-mobile-override');
  }
  _clearSidebarWidth(){
    const el=document.getElementById('sidebar');
    el.style.removeProperty('--sb-w-override');
    el.style.removeProperty('--sb-w-mobile-override');
  }
  _openMiniApp(appInstance){
    this._activeApp=appInstance;
    const cfg=appInstance.constructor.config||{};
    this._setSidebarWidth(cfg.width||null,cfg.mobileWidth||null);
    this._renderSidebar();
  }
  _renderSidebar(){
    this.el.classList.toggle('ed-mode',this.showEditor);
    this.el.innerHTML='';
    this._renderTop();
    if(this.showEditor){
      this._renderEditor();
    }else if(this.showSettings){
      this._renderSettings();
    }else if(this._activeApp){
      this._renderApp();
    }else if(this.showMiniApps){
      this._renderMiniAppList();
    }else{
      this._renderMain();
    }
  }
  _renderTop(){
    let title='Menu';
    if(this.showSettings) title='Settings';
    if(this.showEditor) title='Indicators';
    if(this.showMiniApps) title='Mini Apps';
    if(this._activeApp) title=this._activeApp.constructor.config?.title||'App';
    const inSub=this.showSettings||this.showEditor||this.showMiniApps||this._activeApp;
    const row=Object.assign(document.createElement('div'),{
      className:'sb-section sb-top-row',
      innerHTML:`<span class="sb-menu-title">${title}</span>
        <div class="sb-top-btns">
          ${inSub
            ?`<button class="icon-btn" id="sb-back">←</button>`
            :`<button class="icon-btn" id="sb-miniapps-toggle"></button>
              <button class="icon-btn" id="sb-editor-toggle"></button>
              <button class="icon-btn" id="sb-settings-toggle"></button>`
          }
        </div>`
    });
    this.el.append(row,Object.assign(document.createElement('div'),{className:'sb-divider'}));
    if(inSub){
      const back=row.querySelector('#sb-back');
      back.title='Back';
      tooltip(back,'Back');
      back.onclick=()=>{
        if(this._activeApp){
          this._miniApps.close();
          this._activeApp=null;
          this._clearSidebarWidth();
          this._renderSidebar();
          return;
        }
        this.showSettings=false;
        this.showEditor=false;
        this.showMiniApps=false;
        this._editor._setHelpVisible(false);
        this._renderSidebar();
      };
    }else{
      const ma=row.querySelector('#sb-miniapps-toggle');
      const ed=row.querySelector('#sb-editor-toggle');
      const st=row.querySelector('#sb-settings-toggle');
      ma.appendChild(miniAppsIcon({className:'icon'}));
      ed.appendChild(codeIcon({className:'icon'}));
      st.appendChild(settingsIcon({className:'icon'}));
      ma.title='Mini Apps';st.title='Settings';ed.title='Indicators';
      tooltip(ma,'Mini Apps');tooltip(ed,'Indicators');tooltip(st,'Settings');
      ma.onclick=()=>{this.showMiniApps=true;this.showEditor=false;this.showSettings=false;this._renderSidebar();};
      ed.onclick=()=>{this.showEditor=true;this.showSettings=false;this.showMiniApps=false;this._renderSidebar();};
      st.onclick=()=>{this.showSettings=true;this.showEditor=false;this.showMiniApps=false;this._renderSidebar();};
    }
  }
  _renderEditor(){
    const editorEl=this._editor.el;
    editorEl.className='ed-container';
    this.el.appendChild(editorEl);
    this._editor._render();
  }
  _renderMain(){
    this._renderTimeframes();
    this._renderDataControls();
    if(window.userLoggedIn) this._renderSavedAssets();
  }
  _renderSettings(){
    this._settings._renderSettingsUI(this.el,this._chartTz);
  }
  _renderMiniAppList(){
    const apps=this._miniApps.getApps();
    const wrap=document.createElement('div');
    wrap.className='ma-list';
    apps.forEach(AppClass=>{
      const cfg=AppClass.config||{};
      const card=document.createElement('div');
      card.className='ma-card';
      card.innerHTML=`<div class="ma-card-title">${cfg.title||AppClass.name}</div>
        <div class="ma-card-desc">${cfg.description||''}</div>`;
      card.onclick=()=>this._miniApps.open(AppClass,this);
      wrap.appendChild(card);
    });
    this.el.appendChild(wrap);
  }
  _renderApp(){
    if(!this._activeApp) return;
    this._activeApp.el.className='da-wrap';
    this.el.appendChild(this._activeApp.el);
  }
  _renderTimeframes(){
    const lbl=document.createElement('div');lbl.className='sb-label';lbl.textContent='Timeframe';
    this.el.appendChild(lbl);
    const grid=document.createElement('div');grid.className='tf-grid';
    grid.innerHTML=INTERVALS.map(i=>`<button class="tf-btn${this.chart._currentInterval===i?' active':''}" data-int="${i}">${i}</button>`).join('');
    grid.querySelectorAll('.tf-btn').forEach(b=>{
      b.onclick = () => {
        grid.querySelectorAll('.tf-btn').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        const sym = this.chart._currentSymbol;
        if (sym) {this.chart.load(sym, b.dataset.int);}
        else {this.chart.int = b.dataset.int;}
      };
    });
    this.el.appendChild(grid);
    const d=document.createElement('div');d.className='sb-divider';this.el.appendChild(d);
  }
  _renderDataControls(){
    const lbl=document.createElement('div');lbl.className='sb-label';lbl.textContent='Data';
    this.el.appendChild(lbl);
    const wrap=document.createElement('div');wrap.className='data-ctrl';
    wrap.innerHTML=`
      <div class="ctrl-row">
        <label for="bars-count">Bars</label>
        <input type="number" id="bars-count" value="200" min="1" max="2000">
      </div>
      <div class="data-action-grid">
        <span class="data-grid-hdr">Start</span>
        <span class="data-grid-hdr">End</span>
        <button id="btn-extend-before">← Extend</button>
        <button id="btn-extend-after">Extend →</button>
        <button id="btn-trim-before">Trim →</button>
        <button id="btn-trim-after">← Trim</button>
      </div>
      <div class="ctrl-row bar-count-row">
        <span id="sb-bar-count">Bars loaded: ${this.chart._getBarCount().toLocaleString()}</span>
      </div>
      <div class="ctrl-row export-row">
        <span class="export-label">Export</span>
        <select id="exp-timefmt" class="export-timefmt-select">
          <option value="unix">Unix</option>
          <option value="iso">ISO</option>
          <option value="datetime">Datetime</option>
        </select>
      </div>
      <div class="ctrl-row export-row">
        <button class="btn-sm" id="exp-csv">CSV</button>
        <button class="btn-sm" id="exp-json">JSON</button>
        <button class="btn-sm" id="exp-txt">TXT</button>
        <button class="btn-sm" id="exp-table">Table</button>
      </div>`;
    const getBars=()=>+wrap.querySelector('#bars-count').value||200;
    wrap.querySelector('#btn-extend-before').onclick=()=>this.chart._extendBefore(getBars());
    wrap.querySelector('#btn-extend-after').onclick=()=>this.chart._extendAfter(getBars());
    wrap.querySelector('#btn-trim-before').onclick=()=>this.chart._trimBefore(getBars());
    wrap.querySelector('#btn-trim-after').onclick=()=>this.chart._trimAfter(getBars());
    wrap.querySelector('#exp-timefmt').onchange=e=>{this._exporter.timeFmt=e.target.value};
    wrap.querySelector('#exp-csv').onclick=()=>this._exporter._exportCSV();
    wrap.querySelector('#exp-json').onclick=()=>this._exporter._exportJSON();
    wrap.querySelector('#exp-txt').onclick=()=>this._exporter._exportTXT();
    wrap.querySelector('#exp-table').onclick=()=>this._exporter._showTable();
    this.el.appendChild(wrap);
    const d=document.createElement('div');d.className='sb-divider';this.el.appendChild(d);
  }
  _updateBarCount(count){
    const el=document.getElementById('sb-bar-count');
    if(el) el.textContent=`Bars loaded: ${count.toLocaleString()}`;
  }
  _renderSavedAssets(){
    const tracked=this._config?.tracked||[];
    const streams=this._config?.streams||[];
    const lbl=this._collapsible('Saved Assets',true);
    const body=document.createElement('div');body.className='sb-collapsible';
    this.el.appendChild(lbl);this.el.appendChild(body);
    if(!tracked.length){const e=document.createElement('div');e.className='sb-empty';e.textContent='No tracked assets.';body.appendChild(e);return}
    tracked.forEach(t=>{
      const stream=streams.find(s=>s.symbol===t.symbol&&s.interval===t.interval);
      body.appendChild(this._assetCard(t,stream));
    });
  }
  _assetCard(t,stream){
    const uid=`${t.symbol}-${t.interval}`.replace(/[^a-z0-9]/gi,'-');
    const autoId=`auto-toggle-${uid}`;
    const card=document.createElement('div');card.className='asset-card';
    card.innerHTML=`<div class="asset-card-top">
      <span class="ac-sym">${t.symbol}</span><span class="ac-int">${t.interval}</span>
      <div class="ac-actions">
        <button class="btn-sm load-btn">Load</button>
        <button class="btn-sm danger rm-btn">Remove</button>
      </div>
    </div>
    <div class="ac-switch-row">
      <label class="switch" for="${autoId}"><input type="checkbox" id="${autoId}" class="auto-toggle" ${t.auto_update_enabled?'checked':''}><span class="slider"></span></label>
      <span>Auto-update</span>
    </div>`;
    card.querySelector('.load-btn').onclick=()=>{
      this.chart.load(t.symbol,t.interval);
      document.getElementById('asset-name').textContent=t.symbol;
      document.getElementById('asset-sym').textContent=t.interval;
    };
    card.querySelector('.rm-btn').onclick=async()=>{
      if(!await confirm(`Remove ${t.symbol} ${t.interval} from tracking?`)) return;
      const r=await this.api._removeTrackAPI(t.symbol,t.interval);
      if(r.error){deny(r.error);return}
      this._config.tracked=this._config.tracked.filter(x=>!(x.symbol===t.symbol&&x.interval===t.interval));
      toast('Removed','success');this._renderSidebar();
    };
    card.querySelector('.auto-toggle').onchange=async e=>{
      const en=e.target.checked;
      const r=await this.api._setTrackAPI(t.symbol,t.interval,en);
      if(r.error){deny(r.error);e.target.checked=!en;return}
      t.auto_update_enabled=en?1:0;
    };
    const sd=document.createElement('div');sd.className='stream-row';
    if(stream){
      const stId=`stream-toggle-${uid}`;
      const tzLabel=stream.stream_timezone&&stream.stream_timezone!=='UTC'?stream.stream_timezone:'UTC';
      sd.innerHTML=`<span class="stream-id">Stream: ${stream.stream_id} <span class="stream-tz-badge">${tzLabel}</span></span>
        <label class="switch" for="${stId}"><input type="checkbox" id="${stId}" class="stream-toggle" ${stream.enabled?'checked':''}><span class="slider"></span></label>
        <button class="btn-sm danger rm-stream">×</button>`;
      sd.querySelector('.stream-toggle').onchange=async e=>{
        const r=await this.api._toggleStreamAPI(stream.id,e.target.checked);
        if(r.error){deny(r.error);e.target.checked=!e.target.checked}
      };
      sd.querySelector('.rm-stream').onclick=async()=>{
        if(!await confirm('Remove stream?')) return;
        const r=await this.api._removeStreamAPI(stream.id);
        if(r.error){deny(r.error);return}
        this._config.streams=this._config.streams.filter(s=>s.id!==stream.id);
        toast('Stream removed','success');this._renderSidebar();
      };
    }else{
      sd.innerHTML=`<button class="btn-sm add-stream-btn btn-full-width">+ Add Stream</button>`;
      sd.querySelector('.add-stream-btn').onclick=()=>this._showAddStreamForm(t,sd,card);
    }
    card.appendChild(sd);
    return card;
  }
  _showAddStreamForm(t,sd){
    const uid=`asf-${t.symbol}-${t.interval}`.replace(/[^a-z0-9]/gi,'-');
    const sidId=`${uid}-sid`;
    const keyId=`${uid}-key`;
    const fieldId=`${uid}-field`;
    const tzId=`${uid}-tz`;
    sd.innerHTML=`<div class="add-stream-form">
      <div class="row">
        <label for="${sidId}" class="sr-only">Stream ID</label>
        <input type="text" id="${sidId}" placeholder="Stream ID">
        <label for="${fieldId}" class="sr-only">Field</label>
        <select id="${fieldId}">${['close','open','high','low'].map(f=>`<option value="${f}">${f}</option>`).join('')}</select>
      </div>
      <div class="row">
        <label for="${tzId}" class="sr-only">Stream Timezone</label>
        <select id="${tzId}" class="stream-tz-select">
          <option value="UTC">UTC</option>
          ${this._localTz!=='UTC'?`<option value="${this._localTz}">${this._localTz}</option>`:''}
        </select>
      </div>
      <label for="${keyId}" class="sr-only">Cycles API Key</label>
      <form id="manual-post-form" onsubmit="return false;">
        <input type="password" id="${keyId}" autocomplete="off" placeholder="Cycles API Key (or use saved)">
        <div class="row row-end">
          <button class="btn-sm" id="asf-cancel">Cancel</button>
          <button class="btn-primary" id="asf-save">Save</button>
        </div>
      </form>
    </div>`;
    sd.querySelector('#asf-cancel').onclick=()=>this._renderSidebar();
    sd.querySelector('#asf-save').onclick=async()=>{
      const sid=sd.querySelector(`#${sidId}`).value.trim();
      let key=sd.querySelector(`#${keyId}`).value.trim();
      if(!key) key=await this.api._getKeyAPI()||'';
      const field=sd.querySelector(`#${fieldId}`).value;
      const streamTz=sd.querySelector(`#${tzId}`).value;
      if(!sid||!key){deny('Stream ID and API Key required');return}
      const r=await this.api._addStreamAPI({symbol:t.symbol,interval:t.interval,stream_id:sid,api_key:key,field,stream_timezone:streamTz});
      if(r.error){deny(r.error);return}
      if(key) await this.api._setKeyAPI(key);
      this._config.streams.push({id:r.id,stream_id:sid,symbol:t.symbol,interval:t.interval,field,enabled:1,stream_timezone:streamTz});
      toast('Stream added','success');this._renderSidebar();
    };
  }
  _collapsible(label,open=true){
    const div=document.createElement('div');
    div.className=`sb-label${open?'':' collapsed'}`;
    div.classList.add('sb-label-clickable');
    div.innerHTML=`${label} <span class="caret">▾</span>`;
    div.onclick=()=>{
      div.classList.toggle('collapsed');
      const body=div.nextElementSibling;
      body.style.maxHeight=div.classList.contains('collapsed')?'0':body.scrollHeight+'px';
    };
    return div;
  }
  _onSymbolChange({sym}){
    if(!this.showSettings) return;
    this._renderSidebar();
  }
}