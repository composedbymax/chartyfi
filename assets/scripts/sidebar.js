import {toast,confirm,deny} from './message.js';
const INTERVALS=['1m','2m','5m','15m','30m','1h','4h','1d','1wk','1mo','3mo'];
export class Sidebar {
  constructor(container,chart,api,config) {
    this.el=container;this.chart=chart;this.api=api;this.config=config;
    this.open=false;this.showSettings=false;
    this._config=config;
    this._render();
    document.addEventListener('symbol-changed',e=>this._onSymbolChange(e.detail));
    this._handleOutsideClick = this._handleOutsideClick.bind(this);
    this._handleKeydown = this._handleKeydown.bind(this);
    document.addEventListener('click', this._handleOutsideClick);
    document.addEventListener('keydown', this._handleKeydown);
    this.el.addEventListener('click', e => e.stopPropagation());
  }
  _handleOutsideClick(e) {
    if (!this.open) return;
    const sidebarEl = document.getElementById('sidebar');
    const toggleBtn = document.getElementById('sb-toggle');
    const isInside = sidebarEl.contains(e.target);
    const isToggle = toggleBtn?.contains(e.target);
    if (!isInside && !isToggle) this.toggle();
  }
  _handleKeydown(e) {
    if (e.key === 'Escape' && this.open) this.toggle();
  }
  toggle() {
    this.open=!this.open;
    document.getElementById('sidebar').classList.toggle('open',this.open);
  }
  _render() {
    this.el.innerHTML='';
    this._renderTop();
    this.showSettings?this._renderSettings():this._renderMain();
  }
  _renderTop() {
    const div=document.createElement('div');
    div.className='sb-section sb-top-row';
    div.innerHTML=`<span class="sb-menu-title">Menu</span>
      <button class="icon-btn" id="sb-settings-toggle" title="Settings">⚙</button>`;
    div.querySelector('#sb-settings-toggle').onclick=()=>{this.showSettings=!this.showSettings;this._render()};
    this.el.appendChild(div);
    const div2=document.createElement('div');div2.className='sb-divider';this.el.appendChild(div2);
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
      </div>`;
    wrap.querySelector('#btn-before').onclick=()=>this.chart.extendBefore(+wrap.querySelector('#bars-before').value||200);
    wrap.querySelector('#btn-after').onclick=()=>this.chart.extendAfter(+wrap.querySelector('#bars-after').value||200);
    this.el.appendChild(wrap);
    const d=document.createElement('div');d.className='sb-divider';this.el.appendChild(d);
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
    if(stream) {
      const stId=`stream-toggle-${uid}`;
      sd.innerHTML=`<span class="stream-id">Stream: ${stream.stream_id}</span>
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
    } else {
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
    sd.innerHTML=`<div class="add-stream-form">
      <div class="row">
        <label for="${sidId}" class="sr-only">Stream ID</label>
        <input type="text" id="${sidId}" placeholder="Stream ID">
        <label for="${fieldId}" class="sr-only">Field</label>
        <select id="${fieldId}">${['close','open','high','low'].map(f=>`<option value="${f}">${f}</option>`).join('')}</select>
      </div>
      <label for="${keyId}" class="sr-only">Cycles API Key</label>
      <input type="password" id="${keyId}" placeholder="Cycles API Key (or use saved)">
      <div class="row row-end">
        <button class="btn-sm" id="asf-cancel">Cancel</button>
        <button class="btn-primary" id="asf-save">Save</button>
      </div>
    </div>`;
    sd.querySelector('#asf-cancel').onclick=()=>this._render();
    sd.querySelector('#asf-save').onclick=async()=>{
      const sid=sd.querySelector(`#${sidId}`).value.trim();
      let key=sd.querySelector(`#${keyId}`).value.trim();
      if(!key) key=await this.api.getApiKey()||'';
      const field=sd.querySelector(`#${fieldId}`).value;
      if(!sid||!key){deny('Stream ID and API Key required');return}
      const r=await this.api.addStream({symbol:t.symbol,interval:t.interval,stream_id:sid,api_key:key,field});
      if(r.error){deny(r.error);return}
      if(key) await this.api.setApiKey(key);
      this._config.streams.push({id:r.id,stream_id:sid,symbol:t.symbol,interval:t.interval,field,enabled:1});
      toast('Stream added','success');this._render();
    };
  }
  _renderSettings() {
    const lbl=document.createElement('div');lbl.className='sb-label';lbl.textContent='Settings';
    this.el.appendChild(lbl);
    const wrap=document.createElement('div');wrap.className='settings-panel';
    if(window.userLoggedIn) {
      wrap.innerHTML+=`<div class="user-info">
        <span class="name">${window.userName||'User'}</span>
        <span class="role-badge">${window.userRole||'basic'}</span>
      </div>`;
    } else {
      wrap.innerHTML+=`<div class="setting-row"><a href="/auth">Sign in</a> to enable auto-updates & streams</div>`;
    }
    wrap.innerHTML+=`<div class="sb-divider"></div>`;
    wrap.innerHTML+=`<div class="setting-row"><label>Chart Mode</label>
      <div class="toggle-group">
        <button class="toggle-btn${this.chart.mode==='candle'?' active':''}" data-mode="candle">OHLC</button>
        <button class="toggle-btn${this.chart.mode==='line'?' active':''}" data-mode="line">Line</button>
      </div></div>`;
    wrap.innerHTML+=`<div class="setting-row"><label>Value Field</label>
      <div class="toggle-group" id="field-group">${['open','high','low','close'].map(f=>`<button class="toggle-btn${this.chart.field===f?' active':''}" data-field="${f}">${f}</button>`).join('')}</div></div>`;
    wrap.innerHTML+=`<div class="setting-row"><label>Volume</label>
      <div class="toggle-group" id="vol-group">${['off','overlay','pane'].map(v=>`<button class="toggle-btn${this.chart.volMode===v?' active':''}" data-vol="${v}">${v}</button>`).join('')}</div></div>`;
    wrap.innerHTML+=`<div class="setting-row">
      <label for="api-key-in">Cycles API Key</label>
      <input type="password" id="api-key-in" placeholder="Paste key to save…"></div>`;
    wrap.innerHTML+=`<div class="setting-row"><label>Manual Post to Cycles</label>
      <div class="manual-post-wrap">
        <div class="row">
          <label for="mp-sid" class="sr-only">Stream ID</label>
          <input type="text" id="mp-sid" placeholder="Stream ID">
          <label for="mp-field" class="sr-only">Field</label>
          <select id="mp-field">${['close','open','high','low'].map(f=>`<option value="${f}">${f}</option>`).join('')}</select>
        </div>
        <button class="btn-primary btn-mt" id="mp-btn">Post Current Chart Data</button>
      </div></div>`;
    this.el.appendChild(wrap);
    this.api.getApiKey().then(k=>{if(k) wrap.querySelector('#api-key-in').value=k});
    wrap.querySelectorAll('[data-mode]').forEach(b=>{
      b.onclick=()=>{
        wrap.querySelectorAll('[data-mode]').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');this.chart.setMode(b.dataset.mode);
      };
    });
    wrap.querySelectorAll('[data-field]').forEach(b=>{
      b.onclick=()=>{
        wrap.querySelectorAll('[data-field]').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');this.chart.setField(b.dataset.field);
      };
    });
    wrap.querySelectorAll('[data-vol]').forEach(b=>{
      b.onclick=()=>{
        wrap.querySelectorAll('[data-vol]').forEach(x=>x.classList.remove('active'));
        b.classList.add('active');this.chart.setVolMode(b.dataset.vol);
      };
    });
    const keyIn=wrap.querySelector('#api-key-in');
    keyIn.addEventListener('change',async()=>{if(keyIn.value.trim()){await this.api.setApiKey(keyIn.value.trim());toast('API key saved','success')}});
    wrap.querySelector('#mp-btn').onclick=async()=>{
      const sid=wrap.querySelector('#mp-sid').value.trim();
      let key=keyIn.value.trim()||await this.api.getApiKey()||'';
      const field=wrap.querySelector('#mp-field').value;
      const sym=this.chart.currentSymbol;const int=this.chart.currentInterval;
      if(!sym){deny('No symbol loaded');return}
      if(!sid||!key){deny('Stream ID and API Key required');return}
      const r=this.chart.getRange();
      const res=await this.api.manualPost({symbol:sym,interval:int,field,api_key:key,stream_id:sid,p1:r.p1,p2:r.p2});
      if(res.error){deny(res.error);return}
      toast(`Posted ${res.sent} bars`,'success');
    };
    if(window.userLoggedIn&&this.chart.currentSymbol) {
      const div=document.createElement('div');div.className='sb-divider';this.el.appendChild(div);
      const sym=this.chart.currentSymbol;const int=this.chart.currentInterval;
      const isTracked=this._config?.tracked?.some(t=>t.symbol===sym&&t.interval===int);
      const btn=document.createElement('button');
      btn.className=`btn-primary btn-track-wide${isTracked?' btn-tracked':''}`;
      btn.textContent=isTracked?'✓ Auto-updating':'Enable Auto-Update';
      btn.onclick=async()=>{
        if(isTracked){toast('Already tracking','info');return}
        const r=await this.api.setTrack(sym,int,true);
        if(r.error){deny(r.error);return}
        this._config.tracked.push({symbol:sym,interval:int,auto_update_enabled:1});
        toast('Auto-update enabled','success');this._render();
      };
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