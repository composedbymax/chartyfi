const DB_NAME='chartcache',DB_VER=1,CHART_STORE='charts',SEARCH_STORE='search',EXPIRY=60*24*60*60*1000;
let _db=null;
const _dbReady=new Promise((res,rej)=>{
  const req=indexedDB.open(DB_NAME,DB_VER);
  req.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains(CHART_STORE))db.createObjectStore(CHART_STORE);if(!db.objectStoreNames.contains(SEARCH_STORE))db.createObjectStore(SEARCH_STORE);};
  req.onsuccess=e=>{_db=e.target.result;res(_db)};
  req.onerror=e=>rej(e.target.error);
});
function _tx(store,mode,fn){return _dbReady.then(db=>new Promise((res,rej)=>{const tx=db.transaction(store,mode),st=tx.objectStore(store),req=fn(st);req.onsuccess=()=>res(req.result);req.onerror=e=>rej(e.target.error)}))}
function _get(store,key){return _tx(store,'readonly',st=>st.get(key))}
function _put(store,key,val){return _tx(store,'readwrite',st=>st.put(val,key))}
const _timers={};
function _debounce(key,fn,ms=300){clearTimeout(_timers[key]);_timers[key]=setTimeout(()=>{delete _timers[key];fn()},ms)}
export async function getCachedChart(sym,int,p1,p2,limit){
  const entry=await _get(CHART_STORE,`${sym}_${int}`);
  if(!entry||Date.now()-entry.cachedAt>EXPIRY)return null;
  let candles=entry.candles;
  if(p1!=null)candles=candles.filter(c=>c.time>p1);
  if(p2!=null)candles=candles.filter(c=>c.time<p2);
  if(limit&&p1==null&&p2==null)candles=candles.slice(-limit);
  if(!candles.length)return null;
  return{candles,symbol:sym,interval:int,p1:candles[0].time,p2:candles[candles.length-1].time};
}
export function setCachedChart(sym,int,newCandles){
  if(!newCandles?.length)return;
  const key=`${sym}_${int}`;
  _debounce(key,async()=>{
    const entry=await _get(CHART_STORE,key);
    const existing=(entry&&Date.now()-entry.cachedAt<=EXPIRY)?entry.candles:[];
    const map=new Map(existing.map(c=>[c.time,c]));
    newCandles.forEach(c=>map.set(c.time,c));
    const candles=[...map.values()].sort((a,b)=>a.time-b.time);
    await _put(CHART_STORE,key,{candles,cachedAt:Date.now()});
  },300);
}
export async function getCachedSearch(q){
  const entry=await _get(SEARCH_STORE,q);
  if(!entry||Date.now()-entry.cachedAt>EXPIRY)return null;
  return entry.results;
}
export function setCachedSearch(q,results){
  if(!results?.length)return;
  _debounce(`search_${q}`,()=>_put(SEARCH_STORE,q,{results,cachedAt:Date.now()}),300);
}