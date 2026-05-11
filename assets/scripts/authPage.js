const $=(tag,className='',text='')=>{
  const el=document.createElement(tag);
  if(className) el.className=className;
  if(text!==undefined) el.textContent=text;
  return el;
};
function mount(root){if(!root.isConnected) document.body.append(root);}
export function createAuthModal(){
  const root=$('div','auth-modal hidden');
  const panel=$('div','auth-panel');
  const head=$('div','auth-head');
  const title=$('div','auth-title','User required');
  const close=$('button','btn-sm','Close');
  const body=$('div','auth-body');
  const copy=$('div','auth-copy','Sign in to unlock sharing features.');
  const chart=$('div','auth-chart');
  const rows=[
    'Auto-updating assets',
    'Stream assets to the Cycles app',
    'Share indicators publicly',
    'Generate & revise indicator code with AI'
  ];
  rows.forEach(t=>{
    const row=$('div','auth-row');
    const mark=$('div','auth-mark','✓');
    const label=$('div','auth-row-label',t);
    row.append(mark,label);
    chart.append(row);
  });
  const link=$('a','btn-primary auth-link','Sign in');
  const setLink=()=>{link.href='/auth/?redirect='+encodeURIComponent(location.pathname);};
  setLink();
  body.append(copy,chart,link);
  head.append(title,close);
  panel.append(head,body);
  root.append(panel);
  const open=()=>{
    setLink();
    mount(root);
    root.classList.remove('hidden');
  };
  const closeModal=()=>{root.classList.add('hidden');};
  close.onclick=closeModal;
  root.onclick=e=>{if(e.target===root) closeModal();};
  mount(root);
  return {root,open,close:closeModal};
}
export const authModal=createAuthModal();