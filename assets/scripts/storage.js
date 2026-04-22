const DEFAULTS={toasts:true,tooltips:true,sidebar_sticky:false,tools_bar:true,theme:null,chart_mode:null,chart_field:null,chart_vol:null,autofetch:false};
function read(key){
  const v=localStorage.getItem(key);
  if(v===null||v==='null') return DEFAULTS[key]??null;
  if(v==='true') return true;
  if(v==='false') return false;
  return v;
}
function write(key,val){
  if(val===null||val===undefined) localStorage.removeItem(key);
  else localStorage.setItem(key,String(val));
}
export const storage={
  getToasts:()=>read('toasts'),
  setToasts:v=>write('toasts',v),
  getTooltips:()=>read('tooltips'),
  setTooltips:v=>write('tooltips',v),
  getSidebarSticky:()=>read('sidebar_sticky'),
  setSidebarSticky:v=>write('sidebar_sticky',v),
  getTools:()=>read('tools_bar'),
  setTools:v=>write('tools_bar',v),
  getAutofetch:()=>read('autofetch'),
  setAutofetch:v=>write('autofetch',v),
  getTheme:()=>read('theme'),
  setTheme:v=>write('theme',v),
  getChartMode:()=>read('chart_mode'),
  setChartMode:v=>write('chart_mode',v),
  getChartField:()=>read('chart_field'),
  setChartField:v=>write('chart_field',v),
  getChartVol:()=>read('chart_vol'),
  setChartVol:v=>write('chart_vol',v),
};