import {toast,deny} from './message.js';
export class Settings {
  constructor(chart,api,config,localTz,{onTzChange,onRerender}){
    this.chart=chart;
    this.api=api;
    this._config=config;
    this._localTz=localTz;
    this._onTzChange=onTzChange;
    this._onRerender=onRerender;
  }
  render(container,chartTz){
    const wrap=document.createElement('div');
    wrap.className='settings-panel';
    const localOpt=this._localTz!=='UTC'
      ?`<option value="${this._localTz}"${chartTz===this._localTz?' selected':''}>${this._localTz}</option>`:'';
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
          <select id="chart-tz-select"><option value="UTC"${chartTz==='UTC'?' selected':''}>UTC</option>${localOpt}</select>
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
    container.appendChild(wrap);
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
      await this.api.setChartTz(e.target.value);
      this._onTzChange(e.target.value);
    };
    _bindToggleGroup('[data-mode]',btn=>{
      this.chart._setMode(btn.dataset.mode);
      localStorage.setItem('chart_mode',btn.dataset.mode);
      valueFieldRow.classList.toggle('hidden',btn.dataset.mode==='candle');
    });
    _bindToggleGroup('[data-field]',btn=>{
      this.chart._setField(btn.dataset.field);
      localStorage.setItem('chart_field',btn.dataset.field);
    });
    _bindToggleGroup('[data-vol]',btn=>{
      this.chart._setVolMode(btn.dataset.vol);
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
      const sym=this.chart._currentSymbol;
      const int=this.chart._currentInterval;
      if(!sym){deny('No symbol loaded');return}
      if(!sid||!key){deny('Stream ID and API Key required');return}
      const r=this.chart._getRange();
      const res=await this.api.manualPost({symbol:sym,interval:int,field,api_key:key,stream_id:sid,p1:r.p1,p2:r.p2});
      if(res.error){deny(res.error);return}
      toast(`Posted ${res.sent} bars`,'success');
    };
    if(window.userLoggedIn&&this.chart._currentSymbol){
      const sym=this.chart._currentSymbol;
      const int=this.chart._currentInterval;
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
        this._onRerender();
      };
      container.appendChild(document.createElement('div')).className='sb-divider';
      container.appendChild(btn);
    }
  }
}