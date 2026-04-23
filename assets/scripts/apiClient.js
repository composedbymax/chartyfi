import {storage} from './storage.js';
import {getCachedChart,setCachedChart,getCachedSearch,setCachedSearch} from './cache.js';
export class ApiClient {
  constructor(endpoint) {this.ep=endpoint??storage.getLink()??'';if(endpoint)storage.setLink(endpoint)}
  async _get(params) {
    const url=`${this.ep}?${new URLSearchParams(params)}`;
    const r=await fetch(url);
    return r.json();
  }
  async _post(action,data) {
    const body=new URLSearchParams({action,...data});
    const r=await fetch(this.ep,{method:'POST',body});
    return r.json();
  }
  _userConfig()                              {return this._get({action:'user_config'})}
  async _chartData(sym,int,p1,p2,limit,initial=false) {
    const cached=await getCachedChart(sym,int,p1??null,p2??null,limit??null);
    if(cached) return cached;
    const params={action:'chart_data',symbol:sym,interval:int,...(p1?{p1}:{}),...(p2?{p2}:{}),...(limit?{limit}:{})};
    let r=await this._get(params);
    if(initial&&!r.candles?.length){await new Promise(res=>setTimeout(res,1500));r=await this._get(params);}
    if(r.candles?.length) setCachedChart(sym,int,r.candles);
    return r;
  }
  async _searchAPI(q) {
    const cached=await getCachedSearch(q);
    if(cached) return{results:cached};
    const r=await this._get({action:'search',q});
    if(r.results?.length) setCachedSearch(q,r.results);
    return r;
  }
  _checkUpdatesAPI(sym,int,since)               {return this._get({action:'check_updates',symbol:sym,interval:int,since})}
  _setTrackAPI(sym,int,en)                      {return this._post('set_track',{symbol:sym,interval:int,enabled:en?'1':'0'})}
  _removeTrackAPI(sym,int)                      {return this._post('remove_track',{symbol:sym,interval:int})}
  _addStreamAPI(d)                              {return this._post('add_stream',d)}
  _removeStreamAPI(id)                          {return this._post('remove_stream',{id})}
  _toggleStreamAPI(id,en)                       {return this._post('toggle_stream',{id,enabled:en?'1':'0'})}
  _manualPostAPI(d)                             {return this._post('manual_post',d)}
  async _getKeyAPI()                            {return storage.getApiKey()}
  async _setKeyAPI(k)                           {storage.setApiKey(k)}
  async _getChartTz()                           {return storage.getChartTz()||'UTC'}
  async _setChartTz(tz)                         {storage.setChartTz(tz)}
}