const apiUrl=()=>window.EDS.api;
const canPublicShare = () => window.userLoggedIn === true;
const $=(tag,className='',text='')=>{
  const el=document.createElement(tag);
  if(className) el.className=className;
  if(text!==undefined) el.textContent=text;
  return el;
};
const apiReq=async(url,init={})=>{
  const res=await fetch(url.toString(),{headers:{Accept:'application/json'},...init});
  const data=await res.json().catch(()=>null);
  if(!res.ok||!data||data.ok===false) throw new Error(data&&data.error?data.error:res.statusText||'Request failed');
  return data;
};
const getJson=async(action,params={})=>{
  const url=new URL(apiUrl(),location.href);
  url.searchParams.set('action',action);
  for(const [k,v] of Object.entries(params)) url.searchParams.set(k,String(v));
  return apiReq(url);
};
const postForm=async(action,body)=>{
  const url=new URL(apiUrl(),location.href);
  const fd=body instanceof FormData?body:new FormData();
  fd.set('action',action);
  if(!(body instanceof FormData)) for(const [k,v] of Object.entries(body||{})) fd.set(k,v);
  return apiReq(url,{method:'POST',body:fd});
};
async function request(action,{method='GET',body=null}={}){
  const url=new URL(apiUrl(),location.href);
  const init={method,headers:{Accept:'application/json'}};
  if(method==='GET') url.searchParams.set('action',action);
  else{
    const fd=body instanceof FormData?body:new FormData();
    fd.set('action',action);
    if(!(body instanceof FormData)) for(const [k,v] of Object.entries(body||{})) fd.set(k,v);
    init.body=fd;
  }
  return apiReq(url,init);
}
export async function fetchPublicIndicators(offset=0,limit=4){
  return listPublicIndicators(offset,limit);
}
export async function listPublicIndicators(offset=0,limit=4){
  return getJson('list',{offset,limit});
}
export async function loadPublicIndicator(id,{includeImg=true}={}){
  return getJson('item',{id,includeImg:includeImg?1:0});
}
export async function captureScreenshot(source,{maxWidth=1280,quality=0.82}={}){
  if(!source) throw new Error('Chart not found');
  const rect=source.getBoundingClientRect();
  if(!rect.width||!rect.height) throw new Error('Chart is empty');
  const dpr=window.devicePixelRatio||1;
  const scale=Math.min(1,maxWidth/rect.width);
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(rect.width*scale*dpr));
  canvas.height=Math.max(1,Math.round(rect.height*scale*dpr));
  const ctx=canvas.getContext('2d');
  ctx.setTransform(scale*dpr,0,0,scale*dpr,0,0);
  ctx.fillStyle=getComputedStyle(source).backgroundColor||'#0d0d0d';
  ctx.fillRect(0,0,rect.width,rect.height);
  const canvases=source.tagName==='CANVAS'?[source,...source.querySelectorAll('canvas')]:Array.from(source.querySelectorAll('canvas'));
  canvases.forEach(c=>{
    const r=c.getBoundingClientRect();
    const x=r.left-rect.left;
    const y=r.top-rect.top;
    if(r.width>0&&r.height>0) ctx.drawImage(c,0,0,c.width,c.height,x,y,r.width,r.height);
  });
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Screenshot failed')),'image/jpeg',quality));
}
export async function saveSharedIndicator({name,description,code,image}){
  return postForm('save',{name:name||'Untitled',description:description||'',code:code||'',image}).catch(e=>{throw e;});
}
export function createShareModal({getSource}={}) {
  const root = $('div','eds-share-modal hidden');
  const panel = $('div','eds-share-panel');
  const head = $('div','eds-share-head');
  const title = $('div','eds-share-title','Share indicator');
  const close = $('button','btn-sm','Close');
  const body = $('div','eds-share-body');
  const mkField = (labelText, el, id) => {
    const wrap = $('div','eds-field');
    const label = id ? $('label','',labelText) : $('div','eds-field-label',labelText);
    if (id) label.htmlFor = id;
    wrap.append(label, el);
    return wrap;
  };
  const nameIn = $('input','eds-share-input');
  nameIn.id = 'eds-share-name';
  nameIn.name = 'name';
  nameIn.placeholder = 'Untitled';
  nameIn.autocomplete = 'off';
  const descIn = $('textarea','eds-share-desc');
  descIn.id = 'eds-share-description';
  descIn.name = 'description';
  descIn.rows = 4;
  descIn.placeholder = 'Brief description';
  descIn.autocomplete = 'off';
  const shotPrev = $('img','eds-share-shot');
  shotPrev.alt = 'Screenshot preview';
  const status = $('div','eds-share-status');
  const actions = $('div','eds-share-actions');
  const cancel = $('button','btn-sm','Cancel');
  const submit = $('button','btn-primary','Publish');
  const lock = $('div','eds-share-lock var--shadow2', 'log in to post publicly');
  lock.hidden = true;
  actions.append(cancel, submit);
  body.style.position = 'relative';
  body.append(
    mkField('Name', nameIn, 'eds-share-name'),
    mkField('Description', descIn, 'eds-share-description'),
    mkField('Screenshot', shotPrev),
    status,
    actions,
    lock
  );
  head.append(title, close);
  panel.append(head, body);
  root.append(panel);
  document.body.append(root);
  let currentCode = '';
  let currentBlob = null;
  let shotUrl = '';
  const setStatus = t => { status.textContent = t || ''; };
  const setPreview = blob => {
    if (shotUrl) URL.revokeObjectURL(shotUrl);
    currentBlob = blob || null;
    shotUrl = blob ? URL.createObjectURL(blob) : '';
    shotPrev.src = shotUrl || '';
  };
  const updateAccess = () => {
    const locked = !canPublicShare();
    lock.hidden = !locked;
    submit.disabled = locked;
    nameIn.disabled = locked;
    descIn.disabled = locked;
    shotPrev.style.opacity = locked ? '0.55' : '';
    if (locked) setStatus('log in to post publicly');
    else setStatus('');
  };
  const closeModal = () => {
    root.classList.add('hidden');
    setStatus('');
    if (shotUrl) URL.revokeObjectURL(shotUrl);
    shotUrl = '';
    currentBlob = null;
  };
  const open = async ({name = 'Untitled', description = '', code = ''} = {}) => {
    currentCode = code;
    nameIn.value = name || 'Untitled';
    descIn.value = description || '';
    root.classList.remove('hidden');
    updateAccess();
    if (!canPublicShare()) return;
    setStatus('Capturing screenshot…');
    try {
      const source = getSource && getSource();
      const blob = await captureScreenshot(source || document.querySelector('.tv-lightweight-charts,#chart-wrap'));
      setPreview(blob);
      setStatus('');
    } catch (e) {
      setPreview(null);
      setStatus(e.message);
    }
  };
  const publish = async () => {
    if (!canPublicShare()) throw new Error('log in to post publicly');
    if (!currentBlob) throw new Error('Screenshot not ready');
    setStatus('Uploading…');
    const data = await saveSharedIndicator({
      name: nameIn.value.trim() || 'Untitled',
      description: descIn.value.trim(),
      code: currentCode,
      image: currentBlob
    });
    closeModal();
    return data;
  };
  close.onclick = closeModal;
  cancel.onclick = closeModal;
  submit.onclick = async () => {
    try {
      await publish();
    } catch (e) {
      setStatus(e.message);
      updateAccess();
    }
  };
  root.onclick = e => {
    if (e.target === root) closeModal();
  };
  return { root, open, close: closeModal };
}
function card(item, onLoad) {
  const wrap = $('div', 'eds-card');
  const shot = $('img', 'eds-card-shot');
  shot.loading = 'lazy';
  shot.src = item.img || '';
  shot.alt = item.name || 'Public indicator screenshot';
  const name = $('div', 'eds-card-name', item.name || 'Untitled');
  const load = $('button', 'btn-sm eds-card-load', 'Load');
  load.onclick = async () => {
    try {
      load.disabled = true;
      load.textContent = 'Loading…';
      await onLoad?.(item.id);
    } finally {
      load.disabled = false;
      load.textContent = 'Load';
    }
  };
  wrap.append(shot, name, load);
  return wrap;
}
export function createExplorePanel({ onLoad } = {}) {
  const root = $('div', 'ed-explore-panel hidden');
  const head = $('div', 'ed-explore-head');
  const title = $('div', 'ed-explore-title', 'Public indicators');
  const close = $('button', 'btn-sm', 'Close');
  const list = $('div', 'ed-explore-list');
  const foot = $('div', 'ed-explore-foot');
  const back = $('button', 'btn-sm', '← Back');
  const next = $('button', 'btn-primary', 'Next →');
  foot.append(back, next);
  head.append(title, close);
  root.append(head, list, foot);
  const PAGE = 4;
  let page = 0;
  let loading = false;
  let lastCount = 0;
  const updateButtons = () => {
    back.disabled = page === 0;
    next.disabled = lastCount < PAGE;
  };
  const closePanel = () => root.classList.add('hidden');
  const loadPage = async () => {
    if (loading) return;
    loading = true;
    next.disabled = true;
    back.disabled = true;
    next.textContent = 'Loading…';
    list.innerHTML = '';
    try {
      const data = await listPublicIndicators(page * PAGE, PAGE);
      const items = data.items || [];
      lastCount = items.length;
      for (const it of items) {
        const cardEl = card(it, async (id) => {
          const full = await loadPublicIndicator(id, { includeImg: false });
          onLoad && onLoad(full.item || full);
          closePanel();
        });
        list.append(cardEl);
      }
      next.textContent = 'Next →';
      updateButtons();
    } catch (e) {
      next.textContent = 'Retry';
      next.disabled = false;
      back.disabled = page === 0;
    } finally {
      loading = false;
    }
  };
  const open = async () => {
    root.classList.remove('hidden');
    page = 0;
    await loadPage();
  };
  close.onclick = closePanel;
  back.onclick = () => { if (page > 0) { page--; loadPage(); } };
  next.onclick = () => { page++; loadPage(); };
  root.onclick = e => { if (e.target === root) closePanel(); };
  return { root, open, close: closePanel, refresh: async () => { page = 0; await loadPage(); } };
}