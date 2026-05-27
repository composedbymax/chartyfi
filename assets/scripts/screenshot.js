export async function captureScreenshot(source, {maxWidth=3840, quality=1, watermark=true} = {}) {
  if(!source) throw new Error('Chart not found');
  const rect=source.getBoundingClientRect();
  if(!rect.width||!rect.height) throw new Error('Chart is empty');
  const dpr=window.devicePixelRatio||1;
  const scale=Math.min(1,maxWidth/(rect.width*dpr));
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
  if (watermark) {
    const name=document.getElementById('asset-label')?.dataset.name||'';
    const sym=document.getElementById('asset-name')?.textContent||'';
    const int=document.getElementById('asset-sym')?.textContent||'';
    const p1=Number(source.dataset.p1)||0;
    const p2=Number(source.dataset.p2)||0;
    const theme=document.documentElement.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme:light)').matches?'light':'dark');
    const isDark=theme!=='light';
    const fmtDate=ts=>new Date(ts*1000).toISOString().slice(0,10).replace(/-/g,'/');
    const lines=[name,sym&&int?`(${sym}) ${int}`:''].filter(Boolean);
    if(p1&&p2) lines.push(`${fmtDate(p1)} – ${fmtDate(p2)}`);
    if(lines.length){
      const pad=12,lineH=20,fs=13,ox=16,oy=16;
      ctx.font=`${fs}px system-ui,sans-serif`;
      const boxW=Math.max(...lines.map(l=>ctx.measureText(l).width))+pad*2;
      const boxH=lines.length*lineH+pad*1.5;
      ctx.fillStyle=isDark?'#0d0d0d':'#ffffff';
      ctx.beginPath();
      ctx.roundRect(ox,oy,boxW,boxH,6);
      ctx.fill();
      ctx.fillStyle=isDark?'#e2e2e2':'#111827';
      ctx.textBaseline='top';
      lines.forEach((l,i)=>ctx.fillText(l,ox+pad,oy+pad*0.75+i*lineH));
    }
  }
  return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Screenshot failed')),'image/jpeg',quality));
}