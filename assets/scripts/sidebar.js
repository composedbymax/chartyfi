import {toast,confirm,deny} from './message.js';
import {settingsIcon, codeIcon} from './svg.js';
import {Chart,INTERVALS} from './chart.js';
import {Exporter} from './export.js';
import {Editor} from './editor.js';
export class Sidebar {
  constructor(container,chart,api,config,localTimezone) {
    this.el=container;this.chart=chart;this.api=api;this.config=config;
    this.open=false;this.showSettings=false;this.showEditor=false;
    this._config=config;
    this._localTz=localTimezone||'UTC';
    this._chartTz='UTC';
    this.onTimezoneChange=null;
    this._editor=new Editor(document.createElement('div'),chart);
    this.api.getChartTz().then(tz=>{
      if(tz&&tz!==this._chartTz){this._chartTz=tz;this._applyChartTz();}
    }).catch(()=>{});
    this._render();
    this._restoreChartPrefs();
    this._exporter=new Exporter(chart);
    this._exporter.timezone=this._chartTz;
    this.chart.on('barsChanged',({count})=>this._updateBarCount(count));
    this.chart.on('load',({int})=>this._updateActiveTf(int));
    document.addEventListener('symbol-changed',e=>this._onSymbolChange(e.detail));
    this._handleOutsideClick=this._handleOutsideClick.bind(this);
    this._handleKeydown=this._handleKeydown.bind(this);
    document.addEventListener('click',this._handleOutsideClick);
    document.addEventListener('keydown',this._handleKeydown);
    this.el.addEventListener('click',e=>e.stopPropagation());
  }
  _updateActiveTf(int) {
    this.el.querySelectorAll('.tf-btn').forEach(b=>{
      b.classList.toggle('active',b.dataset.int===int);
    });
  }
  _applyChartTz(){
    if(this._exporter) this._exporter.timezone=this._chartTz;
    if(this.onTimezoneChange) this.onTimezoneChange(this._chartTz);
  }
  _restoreChartPrefs() {
    const mode=localStorage.getItem('chart_mode');
    const field=localStorage.getItem('chart_field');
    const vol=localStorage.getItem('chart_vol');
    if(mode) this.chart.setMode(mode);
    if(field) this.chart.setField(field);
    if(vol) this.chart.setVolMode(vol);
  }
  _handleOutsideClick(e) {
    if(!this.open) return;
    const sidebarEl=document.getElementById('sidebar');
    const toggleBtn=document.getElementById('sb-toggle');
    if(!sidebarEl.contains(e.target)&&!toggleBtn?.contains(e.target)) this.toggle();
  }
  _handleKeydown(e) {
    if(e.key==='Escape'&&this.open) this.toggle();
  }
  toggle() {
    this.open=!this.open;
    document.getElementById('sidebar').classList.toggle('open',this.open);
  }
  _render() {
    this.el.classList.toggle('ed-mode',this.showEditor);
    this.el.innerHTML='';
    this._renderTop();
    if(this.showEditor){
      this._renderEditor();
    }else if(this.showSettings){
      this._renderSettings();
    }else{
      this._renderMain();
    }
  }
  _renderTop() {
    let title = 'Menu';
    if (this.showSettings) title = 'Settings';
    if (this.showEditor)   title = 'Indicators';
    const row = Object.assign(document.createElement('div'), {
      className: 'sb-section sb-top-row',
      innerHTML: `<span class="sb-menu-title">${title}</span>
        <div class="sb-top-btns">
          ${(this.showSettings || this.showEditor)
            ? `<button class="icon-btn" id="sb-back" title="Back">←</button>`
            : `<button class="icon-btn" id="sb-editor-toggle" title="Indicators"></button>
              <button class="icon-btn" id="sb-settings-toggle" title="Settings"></button>`
          }
        </div>`
    });
    this.el.append(row, Object.assign(document.createElement('div'), { className: 'sb-divider' }));
    if (this.showSettings || this.showEditor) {
      row.querySelector('#sb-back').onclick = () => {
        this.showSettings = false; this.showEditor = false;
        this._editor.setHelpVisible(false);
        this._render();
      };
    } else {
      row.querySelector('#sb-editor-toggle')
        .appendChild(codeIcon({ className: 'icon', title: 'Indicators' }));
      row.querySelector('#sb-settings-toggle')
        .appendChild(settingsIcon({ className: 'icon', title: 'Settings' }));
      row.querySelector('#sb-editor-toggle').onclick = () => {
        this.showEditor = true; this.showSettings = false; this._render();
      };
      row.querySelector('#sb-settings-toggle').onclick = () => {
        this.showSettings = true; this.showEditor = false; this._render();
      };
    }
  }
  _renderEditor(){
    const editorEl=this._editor.el;
    editorEl.className='ed-container';
    this.el.appendChild(editorEl);
    this._editor.render();
  }
  _renderMain() {
    this._renderTimeframes();
    this._renderDataControls();
    if(window.userLoggedIn) this._renderSavedAssets();
  }
  _renderTimeframes() {
    const lbl=document.createElement('div');lbl.className='sb-label';lbl.textContent='Timeframe';
    this.el.appendChild(lbl);
    const grid=document.createElement('div');grid.className='tf-grid';
    grid.innerHTML=INTERVALS.map(i=>`<button class="tf-btn${this.chart.currentInterval===i?' active':''}" data-int="${i}">${i}</button>`).join('');
    grid.querySelectorAll('.tf-btn').forEach(b=>{
      b.onclick=()=>{
        grid.querySelectorAll('.tf-btn').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');
        const sym=this.chart.currentSymbol;
        if(sym) this.chart.load(sym,b.dataset.int);
      };
    });
    this.el.appendChild(grid);
    const d=document.createElement('div');d.className='sb-divider';this.el.appendChild(d);
  }
  _renderDataControls() {
    const lbl=document.createElement('div');lbl.className='sb-label';lbl.textContent='Data';
    this.el.appendChild(lbl);
    const wrap=document.createElement('div');wrap.className='data-ctrl';
    wrap.innerHTML=`
      <div class="ctrl-row">
        <label for="bars-before">Extend before</label>
        <input type="number" id="bars-before" value="200" min="1" max="2000">
        <button id="btn-before">← Fetch</button>
      </div>
      <div class="ctrl-row">
        <label for="bars-after">Extend after</label>
        <input type="number" id="bars-after" value="200" min="1" max="2000">
        <button id="btn-after">Fetch →</button>
      </div>
      <div class="ctrl-row bar-count-row">
        <span id="sb-bar-count">Bars loaded: ${this.chart.getBarCount().toLocaleString()}</span>
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
    wrap.querySelector('#btn-before').onclick=()=>this.chart.extendBefore(+wrap.querySelector('#bars-before').value||200);
    wrap.querySelector('#btn-after').onclick=()=>this.chart.extendAfter(+wrap.querySelector('#bars-after').value||200);
    wrap.querySelector('#exp-timefmt').onchange=e=>{this._exporter.timeFmt=e.target.value};
    wrap.querySelector('#exp-csv').onclick=()=>this._exporter.exportCSV();
    wrap.querySelector('#exp-json').onclick=()=>this._exporter.exportJSON();
    wrap.querySelector('#exp-txt').onclick=()=>this._exporter.exportTXT();
    wrap.querySelector('#exp-table').onclick=()=>this._exporter.showTable();
    this.el.appendChild(wrap);
    const d=document.createElement('div');d.className='sb-divider';this.el.appendChild(d);
  }
  _updateBarCount(count) {
    const el=document.getElementById('sb-bar-count');
    if(el) el.textContent=`Bars loaded: ${count.toLocaleString()}`;
  }
  _renderSavedAssets() {
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
  _assetCard(t,stream) {
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
      const r=await this.api.removeTrack(t.symbol,t.interval);
      if(r.error){deny(r.error);return}
      this._config.tracked=this._config.tracked.filter(x=>!(x.symbol===t.symbol&&x.interval===t.interval));
      toast('Removed','success');this._render();
    };
    card.querySelector('.auto-toggle').onchange=async e=>{
      const en=e.target.checked;
      const r=await this.api.setTrack(t.symbol,t.interval,en);
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
        const r=await this.api.toggleStream(stream.id,e.target.checked);
        if(r.error){deny(r.error);e.target.checked=!e.target.checked}
      };
      sd.querySelector('.rm-stream').onclick=async()=>{
        if(!await confirm('Remove stream?')) return;
        const r=await this.api.removeStream(stream.id);
        if(r.error){deny(r.error);return}
        this._config.streams=this._config.streams.filter(s=>s.id!==stream.id);
        toast('Stream removed','success');this._render();
      };
    }else{
      sd.innerHTML=`<button class="btn-sm add-stream-btn btn-full-width">+ Add Stream</button>`;
      sd.querySelector('.add-stream-btn').onclick=()=>this._showAddStreamForm(t,sd,card);
    }
    card.appendChild(sd);
    return card;
  }
  _showAddStreamForm(t,sd,card) {
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
    sd.querySelector('#asf-cancel').onclick=()=>this._render();
    sd.querySelector('#asf-save').onclick=async()=>{
      const sid=sd.querySelector(`#${sidId}`).value.trim();
      let key=sd.querySelector(`#${keyId}`).value.trim();
      if(!key) key=await this.api.getApiKey()||'';
      const field=sd.querySelector(`#${fieldId}`).value;
      const streamTz=sd.querySelector(`#${tzId}`).value;
      if(!sid||!key){deny('Stream ID and API Key required');return}
      const r=await this.api.addStream({symbol:t.symbol,interval:t.interval,stream_id:sid,api_key:key,field,stream_timezone:streamTz});
      if(r.error){deny(r.error);return}
      if(key) await this.api.setApiKey(key);
      this._config.streams.push({id:r.id,stream_id:sid,symbol:t.symbol,interval:t.interval,field,enabled:1,stream_timezone:streamTz});
      toast('Stream added','success');this._render();
    };
  }
  _renderSettings() {
    const wrap=document.createElement('div');
    wrap.className='settings-panel';
    const localOpt=
      this._localTz!=='UTC'
        ?`<option value="${this._localTz}"${this._chartTz===this._localTz?' selected':''}>
${this._localTz}</option>`:'';
    const createToggleBtns=(items,active,attr)=>
      items.map(i=>`<button class="toggle-btn${i===active?' active':''}" ${attr}="${i}">${i}</button>`).join('');
    wrap.innerHTML=`
      ${window.userLoggedIn
        ?`<div class="user-info"><span class="name">${window.userName||'User'}</span><span class="role-badge">${window.userRole||'basic'}</span></div>`
        :`<div class="setting-row"><a href="/auth?redirect=/chart/">Sign in</a> to enable auto-updates & streams</div>`}
      <div class="sb-divider"></div>
      <div class="setting-box">
        <div class="setting-row">
          <label for="chart-tz-select">Chart Timezone</label>
          <select id="chart-tz-select"><option value="UTC"${this._chartTz==='UTC'?' selected':''}>UTC</option>${localOpt}</select>
        </div>
        <div class="setting-row chart-mode-row">
          <fieldset class="fieldset-reset">
            <legend class="setting-row-legend">Chart Mode</legend>
            <div class="toggle-group">${createToggleBtns(['candle','line'],this.chart.mode,'data-mode')}</div>
          </fieldset>
        </div>
        <div class="setting-row value-field-row${this.chart.mode==='candle'?' hidden':''}">
          <fieldset class="fieldset-reset">
            <legend class="setting-row-legend">Value Field</legend>
            <div class="toggle-group">${createToggleBtns(['open','high','low','close'],this.chart.field,'data-field')}</div>
          </fieldset>
        </div>
        <div class="setting-row">
          <fieldset class="fieldset-reset">
            <legend class="setting-row-legend">Volume</legend>
            <div class="toggle-group">${createToggleBtns(['off','overlay','pane'],this.chart.volMode,'data-vol')}</div>
          </fieldset>
        </div>
        <form id="manual-post-form" onsubmit="return false;">
          <div class="setting-row">
            <label for="api-key-in">Cycles API Key</label>
            <input type="password" id="api-key-in" placeholder="Paste key to save…" autocomplete="off">
          </div>
          <div class="setting-row">
            <label for="mp-sid">Manual Post to Cycles</label>
            <div class="manual-post-wrap">
              <div class="row">
                <input type="text" id="mp-sid" placeholder="Stream ID">
                <label for="mp-field" class="sr-only">Field</label>
                <select id="mp-field">${['close','open','high','low'].map(f=>`<option value="${f}">${f}</option>`).join('')}</select>
              </div>
              <button class="btn-primary btn-mt" id="mp-btn">Post Current Chart Data</button>
            </div>
          </div>
        </form>
      </div>
    `;
    this.el.appendChild(wrap);
    const valueFieldRow=wrap.querySelector('.value-field-row');
    const _bindToggleGroup=(selector,callback)=>{
      wrap.querySelectorAll(selector).forEach(btn=>{
        btn.onclick=()=>{
          wrap.querySelectorAll(selector).forEach(b=>b.classList.remove('active'));
          btn.classList.add('active');
          callback(btn);
        };
      });
    };
    wrap.querySelector('#chart-tz-select').onchange=async e=>{
      this._chartTz=e.target.value;
      await this.api.setChartTz(this._chartTz);
      this._applyChartTz();
    };
    _bindToggleGroup('[data-mode]',btn=>{
      this.chart.setMode(btn.dataset.mode);
      localStorage.setItem('chart_mode',btn.dataset.mode);
      valueFieldRow.classList.toggle('hidden',btn.dataset.mode==='candle');
    });
    _bindToggleGroup('[data-field]',btn=>{
      this.chart.setField(btn.dataset.field);
      localStorage.setItem('chart_field',btn.dataset.field);
    });
    _bindToggleGroup('[data-vol]',btn=>{
      this.chart.setVolMode(btn.dataset.vol);
      localStorage.setItem('chart_vol',btn.dataset.vol);
    });
    const keyIn=wrap.querySelector('#api-key-in');
    this.api.getApiKey().then(k=>{if(k) keyIn.value=k});
    keyIn.onchange=async()=>{
      if(keyIn.value.trim()){
        await this.api.setApiKey(keyIn.value.trim());
        toast('API key saved','success');
      }
    };
    wrap.querySelector('#mp-btn').onclick=async()=>{
      const sid=wrap.querySelector('#mp-sid').value.trim();
      const key=keyIn.value.trim()||await this.api.getApiKey()||'';
      const field=wrap.querySelector('#mp-field').value;
      const sym=this.chart.currentSymbol;
      const int=this.chart.currentInterval;
      if(!sym){deny('No symbol loaded');return}
      if(!sid||!key){deny('Stream ID and API Key required');return}
      const r=this.chart.getRange();
      const res=await this.api.manualPost({symbol:sym,interval:int,field,api_key:key,stream_id:sid,p1:r.p1,p2:r.p2});
      if(res.error){deny(res.error);return}
      toast(`Posted ${res.sent} bars`,'success');
    };
    if(window.userLoggedIn&&this.chart.currentSymbol){
      const sym=this.chart.currentSymbol;
      const int=this.chart.currentInterval;
      const isTracked=this._config?.tracked?.some(t=>t.symbol===sym&&t.interval===int);
      const btn=document.createElement('button');
      btn.className=`btn-primary btn-track-wide${isTracked?' btn-tracked':''}`;
      btn.textContent=isTracked?'✓ Auto-updating':'Enable Auto-Update';
      btn.onclick=async()=>{
        if(isTracked){toast('Already tracking','info');return}
        const r=await this.api.setTrack(sym,int,true);
        if(r.error){deny(r.error);return}
        this._config.tracked.push({symbol:sym,interval:int,auto_update_enabled:1});
        toast('Auto-update enabled','success');
        this._render();
      };
      this.el.appendChild(document.createElement('div')).className='sb-divider';
      this.el.appendChild(btn);
    }
  }
  _collapsible(label,open=true) {
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
  _onSymbolChange({sym}) {
    if(!this.showSettings) return;
    this._render();
  }
}