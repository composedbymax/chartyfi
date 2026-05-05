import {toast} from './message.js';
import {isOnline, onNetworkChange} from './network.js';
import {storage} from './storage.js'
import {getCachedChart,setCachedChart,getCachedSearch,setCachedSearch,getLastCachedTime} from './cache.js'
import {INTERVALS_S} from './chart.js'
export class ApiClient{
  constructor(endpoint){
    this.ep=endpoint??storage.getLink()??'';
    if(endpoint)storage.setLink(endpoint);
    this._wasOffline = false;
    this._offlineToast = null;
    this.onBackfill=null;
    onNetworkChange((online) => {
      if(!online){this._wasOffline = true;
        if(this._offlineToast) return;this._offlineToast = toast("You are offline","error",1e9,true);
      } else {
        if(this._wasOffline){toast("Back online", "success", 4000);
          if(this._offlineToast){this._offlineToast.remove();this._offlineToast = null;}
        }
        this._wasOffline = false;
      }
    });
  }
  async _get(params){const url=`${this.ep}?${new URLSearchParams(params)}`;const r=await fetch(url);return r.json()}
  async _post(action,data){const body=new URLSearchParams({action,...data});const r=await fetch(this.ep,{method:'POST',body});return r.json()}
  _userConfig(){return this._get({action:'user_config'})}
  async _chartData(sym,int,p1,p2,limit,initial=false){
    const opts=typeof p1==='object'&&p1!==null?{...p1}:{p1,p2,limit,initial}
    if(opts.initial==null)opts.initial=initial
    const cached=await getCachedChart(sym,int,opts)
    if(cached){
      if(opts.initial)this._backfillToNow(sym,int).catch(()=>{})
      return cached
    }
    const params={action:'chart_data',symbol:sym,interval:int}
    if(opts.p1!=null)params.p1=opts.p1
    if(opts.p2!=null)params.p2=opts.p2
    if(opts.bars!=null)params.bars=opts.bars
    if(opts.direction)params.direction=opts.direction
    if(opts.anchor!=null)params.anchor=opts.anchor
    if(opts.limit!=null)params.limit=opts.limit
    let r=await this._get(params)
    if(opts.initial&&!r.candles?.length){await new Promise(res=>setTimeout(res,1500));r=await this._get(params)}
    if(r.candles?.length)try{await setCachedChart(sym,int,r.candles)}catch(e){}
    return r
  }
  async _backfillToNow(sym,int){
    const last=await getLastCachedTime(sym,int)
    if(!last)return
    const now=Math.floor(Date.now()/1000)
    const step=INTERVALS_S[int]??0
    if(step&&now-last<step*1.5)return
    const r=await this._get({action:'chart_data',symbol:sym,interval:int,p1:last,p2:now})
    if(!r.candles?.length)return
    try{await setCachedChart(sym,int,r.candles)}catch(e){}
    this.onBackfill?.(sym,int,r.candles)
  }
  async _searchAPI(q){const cached=await getCachedSearch(q);if(cached)return{results:cached};const r=await this._get({action:'search',q});if(r.results?.length)try{setCachedSearch(q,r.results)}catch(e){}return r}
  _checkUpdatesAPI(sym,int,since){return this._get({action:'check_updates',symbol:sym,interval:int,since})}
  _setTrackAPI(sym,int,en){return this._post('set_track',{symbol:sym,interval:int,enabled:en?'1':'0'})}
  _removeTrackAPI(sym,int){return this._post('remove_track',{symbol:sym,interval:int})}
  _addStreamAPI(d){return this._post('add_stream',d)}
  _removeStreamAPI(id){return this._post('remove_stream',{id})}
  _toggleStreamAPI(id,en){return this._post('toggle_stream',{id,enabled:en?'1':'0'})}
  _manualPostAPI(d){return this._post('manual_post',d)}
  async _getKeyAPI(){return storage.getApiKey()}
  async _setKeyAPI(k){storage.setApiKey(k)}
  async _getChartTz(){return storage.getChartTz()||'UTC'}
  async _setChartTz(tz){storage.setChartTz(tz)}
}