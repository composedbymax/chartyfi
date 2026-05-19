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