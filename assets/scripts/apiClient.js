const IDB_NAME='intraday';const IDB_STORE='kv';let _db=null;
async function idb() {
  if(_db) return _db;
  return new Promise((res,rej)=>{
    const r=indexedDB.open(IDB_NAME,1);
    r.onupgradeneeded=e=>e.target.result.createObjectStore(IDB_STORE);
    r.onsuccess=e=>{_db=e.target.result;res(_db)};
    r.onerror=()=>rej(r.error);
  });
}
async function idbGet(key) {
  const db=await idb();
  return new Promise((res,rej)=>{const r=db.transaction(IDB_STORE).objectStore(IDB_STORE).get(key);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
}
async function idbSet(key,val) {
  const db=await idb();
  return new Promise((res,rej)=>{const r=db.transaction(IDB_STORE,'readwrite').objectStore(IDB_STORE).put(val,key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)});
}
export class ApiClient {
  constructor(endpoint) {this.ep=endpoint}
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
  userConfig()       {return this._get({action:'user_config'})}
  chartData(sym,int,p1,p2) {return this._get({action:'chart_data',symbol:sym,interval:int,...(p1?{p1}:{}),...(p2?{p2}:{})})}
  search(q)          {return this._get({action:'search',q})}
  checkUpdates(sym,int,since) {return this._get({action:'check_updates',symbol:sym,interval:int,since})}
  setTrack(sym,int,en) {return this._post('set_track',{symbol:sym,interval:int,enabled:en?'1':'0'})}
  removeTrack(sym,int){return this._post('remove_track',{symbol:sym,interval:int})}
  addStream(d)       {return this._post('add_stream',d)}
  removeStream(id)   {return this._post('remove_stream',{id})}
  toggleStream(id,en){return this._post('toggle_stream',{id,enabled:en?'1':'0'})}
  manualPost(d)      {return this._post('manual_post',d)}
  async getApiKey()  {return idbGet('cycles_api_key')}
  async setApiKey(k) {return idbSet('cycles_api_key',k)}
}