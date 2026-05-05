const DB_NAME='chartcache',DB_VER=4,CHART_STORE='charts',SEARCH_STORE='search',EXPIRY=60*24*60*60*1000
let _db=null
const _writeQueues=new Map()
const _dbReady=new Promise((res,rej)=>{const req=indexedDB.open(DB_NAME,DB_VER);req.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains(CHART_STORE))db.createObjectStore(CHART_STORE);if(!db.objectStoreNames.contains(SEARCH_STORE))db.createObjectStore(SEARCH_STORE)};req.onsuccess=e=>{_db=e.target.result;res(_db)};req.onerror=e=>rej(e.target.error)})
function _tx(store,mode,fn){return _dbReady.then(db=>new Promise((res,rej)=>{const tx=db.transaction(store,mode);const st=tx.objectStore(store);const req=fn(st);req.onsuccess=()=>res(req.result);req.onerror=e=>rej(e.target.error)}))}
function _get(store,key){return _tx(store,'readonly',st=>st.get(key))}
function _put(store,key,val){return _tx(store,'readwrite',st=>st.put(val,key))}
function _enqueue(key,fn){const prev=_writeQueues.get(key)||Promise.resolve();const next=prev.catch(()=>{}).then(fn);_writeQueues.set(key,next);return next.finally(()=>{if(_writeQueues.get(key)===next)_writeQueues.delete(key)})}
function _normalizeCandles(candles){const map=new Map();for(const c of candles||[]){if(c?.time==null)continue;const time=Number(c.time);if(!Number.isFinite(time))continue;map.set(time,{time,open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close),volume:Number(c.volume??0)})}return [...map.values()].sort((a,b)=>a.time-b.time)}
export async function getCachedChart(sym,int,p1,p2,limit,opts={}){
  if(typeof p1==='object'&&p1!==null){opts=p1;p1=opts.p1??null;p2=opts.p2??null;limit=opts.limit??null}
  const key=`${sym}_${int}`
  const entry=await _get(CHART_STORE,key)
  if(!entry||Date.now()-entry.cachedAt>EXPIRY)return null
  const candles=Array.isArray(entry.candles)?entry.candles:[]
  const bars=Number(opts.bars??0)||0
  const direction=opts.direction||''
  const anchor=Number(opts.anchor??0)||0
  if(bars>0&&direction){
    const filtered=direction==='before'?candles.filter(c=>c.time<anchor):candles.filter(c=>c.time>anchor)
    if(filtered.length<bars)return null
    const slice=direction==='before'?filtered.slice(-bars):filtered.slice(0,bars)
    return{candles:slice,symbol:sym,interval:int,p1:slice[0].time,p2:slice[slice.length-1].time,loadedBars:slice.length,requestedBars:bars,end_of_data:false,cached:true}
  }
  let out=candles
  if(p1!=null)out=out.filter(c=>c.time>=Number(p1))
  if(p2!=null)out=out.filter(c=>c.time<=Number(p2))
  if(!out.length)return null
  if(limit&&p1==null&&p2==null&&out.length>limit)out=out.slice(-limit)
  return{candles:out,symbol:sym,interval:int,p1:out[0].time,p2:out[out.length-1].time,loadedBars:out.length,requestedBars:limit??out.length,end_of_data:false,cached:true}
}
export function setCachedChart(sym,int,newCandles){
  if(!newCandles?.length)return
  const key=`${sym}_${int}`
  return _enqueue(key,async()=>{const entry=await _get(CHART_STORE,key);const existing=entry&&Date.now()-entry.cachedAt<=EXPIRY&&Array.isArray(entry.candles)?entry.candles:[];const map=new Map();for(const c of existing)map.set(Number(c.time),c);for(const c of _normalizeCandles(newCandles))map.set(Number(c.time),c);await _put(CHART_STORE,key,{candles:[...map.values()].sort((a,b)=>a.time-b.time),cachedAt:Date.now()})})
}
export async function getLastCachedTime(sym,int){
  const key=`${sym}_${int}`
  const entry=await _get(CHART_STORE,key)
  if(!entry||!Array.isArray(entry.candles)||!entry.candles.length)return null
  return entry.candles[entry.candles.length-1].time
}
export async function getCachedSearch(q){const entry=await _get(SEARCH_STORE,q);if(!entry||Date.now()-entry.cachedAt>EXPIRY)return null;return entry.results}
export function setCachedSearch(q,results){if(!results?.length)return;_enqueue(`search_${q}`,()=>_put(SEARCH_STORE,q,{results,cachedAt:Date.now()}))}