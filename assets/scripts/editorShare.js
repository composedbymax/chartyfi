import {deny, toast} from './message.js';
import {storage} from './storage.js';
import {authModal} from './authPage.js';
import {captureScreenshot} from './screenshot.js'
const apiUrl=()=>window.EDS.api;
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
}
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
function isDarkMode(){
  const theme=storage.getTheme();
  if(theme==='dark') return true;
  if(theme==='light') return false;
  return document.documentElement.classList.contains('dark')||window.matchMedia('(prefers-color-scheme: dark)').matches;
}
export async function fetchPublicIndicators(offset=0,limit=4){
  return listPublicIndicators(offset,limit);
}
export async function listPublicIndicators(offset=0,limit=4){
  return getJson('list',{offset,limit});
}
export async function loadPublicIndicator(id){
  return getJson('item',{id});
}
export async function saveSharedIndicator({name,description,code,image,isDark}){
  return postForm('save',{name:name||'Untitled',description:description||'',code:code||'',isDark:isDark?'yes':'no',image}).catch(e=>{throw e;});
}
export function createShareModal({getSource}={}){
  const root=$('div','modal-overlay hidden');
  const panel=$('div','modal-panel modal-panel-wide');
  const head=$('div','flex items-center justify-between gap-8 p-10-12 border-b');
  const title=$('div','text-13 fw-700','Share indicator');
  const close=$('button','btn-sm','Close');
  const body=$('div','flex flex-col gap-10 p-12');
  const mkField=(labelText,el,id)=>{
    const wrap=$('div','flex flex-col gap-6');
    const label=id?$('label','text-11 text-muted fw-600',labelText):$('div','text-11 text-muted fw-600',labelText);
    if(id) label.htmlFor=id;
    wrap.append(label,el);
    return wrap;
  };
  const nameIn=$('input','field w-full p-6-12 text-12');
  nameIn.id='eds-share-name';
  nameIn.name='name';
  nameIn.placeholder='Untitled';
  nameIn.autocomplete='off';
  const descIn=$('textarea','field w-full p-6-12 text-12 resize-y');
  descIn.id='eds-share-description';
  descIn.name='description';
  descIn.rows=4;
  descIn.placeholder='Brief description';
  descIn.autocomplete='off';
  const shotPrev=$('img','w-full max-h-260 object-cover border rounded');
  shotPrev.alt='Screenshot preview';
  const status=$('div','text-12 text-secondary');
  const actions=$('div','flex justify-end gap-8');
  const cancel=$('button','btn-sm','Cancel');
  const submit=$('button','btn-primary','Publish');
  actions.append(cancel,submit);
  body.append(mkField('Name',nameIn,'eds-share-name'),mkField('Description',descIn,'eds-share-description'),mkField('Screenshot',shotPrev),status,actions);
  head.append(title,close);
  panel.append(head,body);
  root.append(panel);
  document.body.append(root);
  let currentCode='';
  let currentBlob=null;
  let shotUrl='';
  let shotIsDark=false;
  const setStatus=t=>{status.textContent=t||''};
  const setPreview=blob=>{
    if(shotUrl) URL.revokeObjectURL(shotUrl);
    currentBlob=blob||null;
    shotUrl=blob?URL.createObjectURL(blob):'';
    shotPrev.src=shotUrl||'';
  };
  const closeModal=()=>{
    root.classList.add('hidden');
    setStatus('');
    if(shotUrl) URL.revokeObjectURL(shotUrl);
    shotUrl='';
    currentBlob=null;
  };
  const open=async({name='Untitled',description='',code=''}={})=>{
    if(window.userLoggedIn===false){
      authModal.open();
      return;
    }
    currentCode=code;
    nameIn.value=name||'Untitled';
    descIn.value=description||'';
    root.classList.remove('hidden');
    try{
      const source=getSource&&getSource();
      const blob = await captureScreenshot(source || document.querySelector('.tv-lightweight-charts,#chart-wrap'),{ quality: 0.7, maxWidth: 1280, watermark: false });
      shotIsDark=isDarkMode();
      setPreview(blob);
    }catch(e){
      setPreview(null);
      setStatus(e.message);
    }
  };
  const publish=async()=>{
    if(!currentBlob) throw new Error('Screenshot not ready');
    const data=await saveSharedIndicator({name:nameIn.value.trim()||'Untitled',description:descIn.value.trim(),code:currentCode,image:currentBlob,isDark:shotIsDark});
    toast(`Published "${nameIn.value.trim() || 'Untitled'}"`,'info',5000);
    closeModal();
    return data;
  };
  close.onclick=closeModal;
  cancel.onclick=closeModal;
  submit.onclick=async()=>{
    try{
      await publish();
    }catch(e){
      setStatus(e.message);
      deny(e.message);
    }
  };
  root.onclick=e=>{
    if(e.target===root) closeModal();
  };
  return{root,open,close:closeModal};
}
function card(item,onLoad){
  const wrap=$('div','media-card bg-3 border rounded');
  const shot=$('img','media-card-image absolute inset-0 w-full h-full object-cover');
  shot.loading='lazy';
  shot.src=item.img||'';
  shot.alt=item.name||'Public indicator screenshot';
  if((item.isDark==='yes')!==isDarkMode()) shot.classList.add('invert-media');
  const name=$('div','media-card-label',item.name||'Untitled');
  const load=$('button','btn-sm media-card-action','Load');
  load.onclick=async()=>{
    load.disabled=true;
    load.textContent='Loading…';
    try{
      const data=await loadPublicIndicator(item.id);
      if(onLoad(data.item)===false){load.disabled=false;load.textContent='Load';}
    }catch(e){
      deny(e.message);
      load.textContent='Error';
      setTimeout(()=>{load.disabled=false;load.textContent='Load';},2000);
    }
  };
  wrap.append(shot,name,load);
  return wrap;
}
export function createExplorePanel({onLoad}={}){
  const root=$('div','absolute inset-0 z-2 flex flex-col bg overflow-hidden hidden');
  const head=$('div','flex items-center justify-between gap-8 p-10-12 border-b bg-2');
  const title=$('div','text-13 fw-700','Public indicators');
  const close=$('button','btn-sm','Close');
  const list=$('div','flex flex-col flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-10-12 gap-10');
  const foot=$('div','flex items-center justify-between gap-8 p-10-12 border-t bg-2');
  const back=$('button','btn-sm','← Back');
  const next=$('button','btn-primary','Next →');
  foot.append(back,next);
  head.append(title,close);
  root.append(head,list,foot);
  const PAGE=4;
  let page=0;
  let loading=false;
  let lastCount=0;
  const updateButtons=()=>{
    back.disabled=page===0;
    next.disabled=lastCount<PAGE;
  };
  const closePanel=()=>root.classList.add('hidden');
  const loadPage=async()=>{
    if(loading) return;
    loading=true;
    next.disabled=true;
    back.disabled=true;
    next.textContent='Loading…';
    list.innerHTML='';
    try{
      const data=await listPublicIndicators(page*PAGE,PAGE);
      const items=data.items||[];
      lastCount=items.length;
      items.forEach(it=>list.append(card(it,item=>{
        const r=onLoad&&onLoad(item);
        if(r!==false) closePanel();
        return r;
      })));
      next.textContent='Next →';
      updateButtons();
    }catch(e){
      deny(e.message);
      next.textContent='Retry';
      next.disabled=false;
      back.disabled=page===0;
    }finally{
      loading=false;
    }
  };
  const open=async()=>{
    root.classList.remove('hidden');
    page=0;
    await loadPage();
  };
  close.onclick=closePanel;
  back.onclick=()=>{if(page>0){page--;loadPage();}};
  next.onclick=()=>{page++;loadPage();};
  root.onclick=e=>{if(e.target===root) closePanel();};
  return{root,open,close:closePanel,refresh:async()=>{page=0;await loadPage();}};
}