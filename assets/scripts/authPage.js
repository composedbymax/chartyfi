import {setGuardBypass} from './appGuard.js';
const $=(tag,className='',text='')=>{
  const el=document.createElement(tag);
  if(className) el.className=className;
  if(text!==undefined) el.textContent=text;
  return el;
};
const ROWS=[
  'Find relevant news for any asset',
  'Auto-update intraday assets to preserve history',
  'Stream assets to the Cycles app',
  'Share assets to the Cycles app',
  'Share indicators publicly',
  'Generate & revise indicator code with AI'
];
function build(closeModal){
  const root=$('div','modal-overlay');
  root.dataset.sidebarPersist='';
  const panel=$('div','modal-panel');
  const head=$('div','flex items-center justify-between gap-8 p-10-12 border-b');
  const title=$('div','text-13 fw-700','User required');
  const close=$('button','page-btn','Close');
  const body=$('div','flex flex-col gap-12 p-12');
  const copy=$('div','text-13 text-secondary','Sign in to unlock upgraded features.');
  const chart=$('div','flex flex-col gap-8');
  ROWS.forEach(t=>{
    const row=$('div','flex items-center gap-8 p-10-12 border-soft rounded bg');
    row.append(
      $('div','text-secondary flex-shrink-0','✓'),
      $('div','text-12 text-secondary flex-1',t)
    );
    chart.append(row);
  });
  const link=$('a','btn-block-accent','Sign in');
  link.href='/auth/?redirect='+encodeURIComponent(location.pathname);
  body.append(copy,chart,link);
  head.append(title,close);
  panel.append(head,body);
  root.append(panel);
  close.onclick=closeModal;
  root.onclick=e=>{if(e.target===root) closeModal();};
  return root;
}

export function createAuthModal(){
  let root=null;
  const closeModal=()=>{
    if(root){root.remove();root=null;}
    setGuardBypass(false);
  };
  const open=()=>{
    if(root) return;
    root=build(closeModal);
    document.body.append(root);
    setGuardBypass(true);
  };
  return {open,close:closeModal};
}

export const authModal=createAuthModal();