import {authModal} from './authPage.js';
import {toast,deny} from './message.js';
import {storage} from './storage.js';
import {tooltip} from './tooltip.js';
import {toolsVisibility} from './tools.js';
import {autofetchEnabled} from './autofetch.js';
import {nonStickyIcon,stickyIcon,sunIcon,moonIcon,toolsIcon,autoIcon} from './svg.js';
export class Settings {
  constructor(chart,api,config,localTz,{onTzChange,onRerender}){
    this.chart=chart;
    this.api=api;
    this._config=config;
    this._localTz=localTz;
    this._onTzChange=onTzChange;
    this._onRerender=onRerender;
  }
  _el(tag,cls,text){
    const e=document.createElement(tag);
    if(cls) e.className=cls;
    if(text!=null) e.textContent=text;
    return e;
  }
  _makeToggle(name,checked,onIcon,offIcon,tip,onChange){
    const item=this._el('label','setting-toggle-item');
    const box=this._el('span','setting-toggle-box');
    ['stb-on','stb-off'].forEach((cls,i)=>{
      const s=this._el('span',cls);
      const icon=[onIcon,offIcon][i];
      typeof icon==='string' ? s.textContent=icon : s.appendChild(icon);
      box.appendChild(s);
    });
    const input=Object.assign(this._el('input'),{type:'checkbox',checked,onchange:()=>onChange(input.checked)});
    item.append(this._el('span','setting-toggle-name',name),input,box);
    tooltip(item,tip);
    return item;
  }
  _renderToggleSection(container){
    const stored=storage.getTheme();
    const isLight=stored==='light'||(stored===null&&window.matchMedia('(prefers-color-scheme: light)').matches);
    const grid=this._el('div','setting-toggle-grid');
    [
      ['Toasts',    storage.getToasts(),          '✓', '✕', 'Show toast notifications',                  v=>storage.setToasts(v)],
      ['Tooltips',  storage.getTooltips(),         '?', '✕', 'Show hover tooltips',                       v=>storage.setTooltips(v)],
      ['Sticky Sidebar', storage.getSidebarSticky(), stickyIcon({className:'icon'}), nonStickyIcon({className:'icon'}), 'Sidebar stays open when clicking outside', v=>storage.setSidebarSticky(v)],
      ['Tools Bar',storage.getTools(),toolsIcon({className:'icon'}),'✕','Show chart tools column',v=>{storage.setTools(v);toolsVisibility.set(v)}],
      ['Auto-Fetch', storage.getAutofetch(), autoIcon({className:'icon'}), '✕', 'Auto-fetch historical data when scrolling left', v=>{storage.setAutofetch(v);autofetchEnabled.set(v)}],
      ['Light Mode', isLight, sunIcon({className:'icon'}), moonIcon({className:'icon'}), 'Toggle light/dark theme', v=>{const t=v?'light':'dark';storage.setTheme(t);document.documentElement.setAttribute('data-theme',t);this.chart._applyTheme();}],
    ].forEach(([name,checked,on,off,tip,cb])=>grid.appendChild(this._makeToggle(name,checked,on,off,tip,cb)));
    container.append(this._el('div','sb-label','Preferences'),grid,this._el('div','sb-divider'));
  }
  _renderSettingsUI(container,chartTz){
    const wrap=this._el('div','settings-panel');
    const userDiv=this._el('div');
    userDiv.innerHTML=window.userLoggedIn
      ?`<div class="user-info"><span class="name">${window.userName||'User'}</span><span class="role-badge">${window.userRole||'basic'}</span></div>`
      :`<div class="setting-row"><a href="/auth?redirect=/chartyfi/">Sign in</a> to enable auto-updates & streams</div>`;
    wrap.append(userDiv,this._el('div','sb-divider'));
    this._renderToggleSection(wrap);
    const localOpt=this._localTz!=='UTC'
      ?`<option value="${this._localTz}"${chartTz===this._localTz?' selected':''}>${this._localTz}</option>`:'';
    const toggleBtns=(items,active,attr)=>
      items.map(i=>`<button class="toggle-btn${i===active?' active':''}" ${attr}="${i}">${i}</button>`).join('');
    const box=this._el('div','setting-box');
    box.innerHTML=`
      <div class="setting-row">
        <label for="chart-tz-select">Chart Timezone</label>
        <select id="chart-tz-select"><option value="UTC"${chartTz==='UTC'?' selected':''}>UTC</option>${localOpt}</select>
      </div>
      <div class="setting-row">
        <fieldset class="fieldset-reset">
          <legend class="setting-row-legend">Chart Mode</legend>
          <div class="toggle-group">${toggleBtns(['candle','line'],this.chart.mode,'data-mode')}</div>
        </fieldset>
      </div>
      <div class="setting-row value-field-row${this.chart.mode==='candle'?' hidden':''}">
        <fieldset class="fieldset-reset">
          <legend class="setting-row-legend">Value Field</legend>
          <div class="toggle-group">${toggleBtns(['open','high','low','close'],this.chart.field,'data-field')}</div>
        </fieldset>
      </div>
      <div class="setting-row">
        <fieldset class="fieldset-reset">
          <legend class="setting-row-legend">Volume</legend>
          <div class="toggle-group">${toggleBtns(['off','overlay','pane'],this.chart.volMode,'data-vol')}</div>
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
    `;
    wrap.appendChild(box);
    container.appendChild(wrap);
    const bindGroup=(sel,cb)=>box.querySelectorAll(sel).forEach(btn=>btn.onclick=()=>{
      box.querySelectorAll(sel).forEach(b=>b.classList.remove('active'));
      btn.classList.add('active');
      cb(btn);
    });
    const valueFieldRow=box.querySelector('.value-field-row');
    box.querySelector('#chart-tz-select').onchange=async e=>{
      await this.api._setChartTz(e.target.value);
      this._onTzChange(e.target.value);
    };
    bindGroup('[data-mode]',btn=>{
      this.chart._setMode(btn.dataset.mode);
      storage.setChartMode(btn.dataset.mode);
      valueFieldRow.classList.toggle('hidden',btn.dataset.mode==='candle');
    });
    bindGroup('[data-field]',btn=>{this.chart._setField(btn.dataset.field);storage.setChartField(btn.dataset.field)});
    bindGroup('[data-vol]',  btn=>{this.chart._setVolMode(btn.dataset.vol);storage.setChartVol(btn.dataset.vol)});
    const keyIn=box.querySelector('#api-key-in');
    this.api._getKeyAPI().then(k=>{if(k) keyIn.value=k});
    keyIn.onchange=async()=>{
      if(keyIn.value.trim()){await this.api._setKeyAPI(keyIn.value.trim());toast('API key saved','success')}
    };
    box.querySelector('#mp-btn').onclick=async()=>{
      const sid=box.querySelector('#mp-sid').value.trim();
      const key=keyIn.value.trim()||await this.api._getKeyAPI()||'';
      const field=box.querySelector('#mp-field').value;
      const {_currentSymbol:sym,_currentInterval:int}=this.chart;
      if(!sym)      {deny('No symbol loaded');return}
      if(!sid||!key){deny('Stream ID and API Key required');return}
      const r=this.chart._getRange();
      const res=await this.api._manualPostAPI({symbol:sym,interval:int,field,api_key:key,stream_id:sid,p1:r.p1,p2:r.p2});
      if(res.error){deny(res.error);return}
      toast(`Posted ${res.sent} bars`,'success');
    };
    if(this.chart._currentSymbol){
      const {_currentSymbol:sym,_currentInterval:int}=this.chart;
      const isTracked=this._config?.tracked?.some(t=>t.symbol===sym&&t.interval===int);
      const btn=this._el('button',`btn-primary btn-track-wide${isTracked?' btn-tracked':''}`);
      btn.textContent=isTracked?'✓ Auto-updating':'Enable Auto-Update';
      btn.onclick = async (e) => {
        e?.preventDefault?.();
        if (!window.userLoggedIn) {authModal.open(); return;}
        if (isTracked) {toast('Already tracking', 'info'); return;}
        const r = await this.api._setTrackAPI(sym, int, true);
        if (r.error) {deny(r.error);return;}
        this._config.tracked.push({symbol: sym,interval: int,auto_update_enabled: 1});
        toast('Auto-update enabled', 'success');
        this._onRerender();
      };
      container.append(this._el('div', 'sb-divider'), btn);
    }
  }
}