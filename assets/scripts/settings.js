import {authModal} from './authPage.js';
import {toast,deny} from './message.js';
import {storage} from './storage.js';
import {tooltip} from './tooltip.js';
import {toolsVisibility} from './tools.js';
import {autofetchEnabled} from './autofetch.js';
import {nonStickyIcon,stickyIcon,sunIcon,moonIcon,toolsIcon,autoIcon} from './svg.js';
import {setGuardBypass} from './appGuard.js';
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
    item.append(this._el('span','text-12 text-secondary flex-1',name),input,box);
    tooltip(item,tip);
    return item;
  }
  _renderToggleSection(container){
    const stored=storage.getTheme();
    const isLight=stored==='light'||(stored===null&&window.matchMedia('(prefers-color-scheme: light)').matches);
    const grid=this._el('div','grid grid-col-1-1 gap-8 p-0-12-12');
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
    const wrap=this._el('div','flex-column');
    const userDiv=this._el('div');
    userDiv.innerHTML=window.userLoggedIn
      ?`<div class="flex-center-space gap-8 p-6-12 text-13"><span class="fw-500">${window.userName||'User'}</span><span class="text-10 bg-4 rounded p-2-7 text-secondary">${window.userRole||'basic'}</span></div>`
      :`<div class="flex-column gap-8 p-8"><a class="link" href="/auth?redirect=/chartyfi/">Sign in</a>to enable advanced features</div>`;
    wrap.append(userDiv,this._el('div','sb-divider'));
    if (!window.userLoggedIn) {userDiv.querySelector('.link')?.addEventListener('click', () => setGuardBypass(true));}
    this._renderToggleSection(wrap);
    const localOpt=this._localTz!=='UTC'
      ?`<option value="${this._localTz}"${chartTz===this._localTz?' selected':''}>${this._localTz}</option>`:'';
    const toggleBtns=(items,active,attr)=>
      items.map(i=>`<button class="toggle-btn${i===active?' active':''}" ${attr}="${i}">${i}</button>`).join('');
    const box=this._el('div','p-0-6 gap-10');
    box.innerHTML=`
      <div class="flex-column gap-8 p-8">
        <label for="chart-tz-select" class="text-11 text-muted fw-600">Chart Timezone</label>
        <select id="chart-tz-select"><option value="UTC"${chartTz==='UTC'?' selected':''}>UTC</option>${localOpt}</select>
      </div>
      <div class="flex-column gap-8 p-8">
        <fieldset class="reset">
          <legend class="text-11 text-muted fw-600">Chart Mode</legend>
          <div class="flex gap-4">${toggleBtns(['candle','line'],this.chart.mode,'data-mode')}</div>
        </fieldset>
      </div>
      <div class="flex-column gap-8 p-8 value-field-row${this.chart.mode==='candle'?' hidden':''}">
        <fieldset class="reset">
          <legend class="text-11 text-muted fw-600">Value Field</legend>
          <div class="flex gap-4">${toggleBtns(['open','high','low','close'],this.chart.field,'data-field')}</div>
        </fieldset>
      </div>
      <div class="flex-column gap-8 p-8">
        <fieldset class="reset">
          <legend class="text-11 text-muted fw-600">Volume</legend>
          <div class="flex gap-4">${toggleBtns(['off','overlay','pane'],this.chart.volMode,'data-vol')}</div>
        </fieldset>
      </div>
      <div class="flex-column gap-8 p-8">
        <label for="ai-model-select" class="text-11 text-muted fw-600">LLM Model</label>
        <select id="ai-model-select">${storage.getModelList().map(m=>`<option value="${m}"${m===storage.getPreferredModel()?' selected':''}>${m}</option>`).join('')}</select>
      </div>
      <form id="manual-post-form" onsubmit="return false;">
        <div class="flex-column gap-8 p-8">
          <label for="api-key-in" class="text-11 text-muted fw-600">Cycles API Key</label>
          <input type="password" id="api-key-in" placeholder="Paste key to save…" autocomplete="off">
        </div>
        <div class="flex-column gap-8 p-8">
          <label for="mp-sid" class="text-11 text-muted fw-600">Manual Post to Cycles</label>
          <div class="flex-column gap-5">
            <div class="flex gap-5">
              <input type="text" id="mp-sid" class="flex-1" placeholder="Stream ID">
              <label for="mp-field" class="sr-only">Field</label>
              <select id="mp-field" class="w-54 flex-shrink-0">${['close','open','high','low'].map(f=>`<option value="${f}">${f}</option>`).join('')}</select>
            </div>
            <button type="button" class="btn-primary mt-2" id="mp-btn">Post Current Chart Data</button>
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
    box.querySelector('#ai-model-select').onchange=e=>storage.setPreferredModel(e.target.value);
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