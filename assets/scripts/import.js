import {toast} from './message.js';
function _parseTimestamp(val) {
  const n = Number(val);
  if (!isNaN(n) && n > 1e8) return n > 1e11 ? Math.floor(n/1000) : Math.floor(n);
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : Math.floor(d.getTime()/1000);
}
function _parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return null;
  const delim = lines[0].includes('\t') ? '\t' : ',';
  const parse = l => {
    const f = []; let cur = '', q = false;
    for (const c of l) {
      if (c === '"') { q = !q; continue; }
      if (c === delim && !q) { f.push(cur.trim()); cur = ''; } else cur += c;
    }
    f.push(cur.trim()); return f;
  };
  const headers = parse(lines[0]);
  const rows = lines.slice(1).map(parse);
  return {headers, rows};
}
function _scoreCol(header, samples) {
  const h = header.toLowerCase().trim();
  const s = {time:0,open:0,high:0,low:0,close:0,volume:0,price:0};
  if (/^(time|date|snapped_at|observation_date|unixtime|timestamp|datetime)$/.test(h)) s.time += 10;
  else if (/time|date|stamp/.test(h)) s.time += 3;
  if (/^open$/.test(h)) s.open += 10;
  if (/^high$/.test(h)) s.high += 10;
  if (/^low$/.test(h)) s.low += 10;
  if (/^(close|last)$/.test(h)) s.close += 10;
  if (/^(volume|vol|total_volume|market_volume)$/.test(h)) s.volume += 10;
  else if (/vol/.test(h)) s.volume += 2;
  if (/^(price|value|insamplevalue)$/.test(h)) s.price += 8;
  else if (/price|value/.test(h)) s.price += 2;
  const filled = samples.filter(v => v !== '' && v != null);
  const nums = filled.map(Number).filter(n => !isNaN(n));
  if (nums.length > filled.length * 0.5) {
    if (nums.every(n => n > 1e8 && n < 2e10)) s.time += 6;
    else if (nums.every(n => n > 1e11 && n < 2e13)) s.time += 5;
    else {
      const pricelike = nums.filter(n => n > 0 && !(n > 1e8 && n < 2e10) && !(n > 1e11));
      if (pricelike.length > filled.length * 0.4) s.price += 3;
    }
  }
  const dateStr = filled.filter(v => isNaN(Number(v)) && !isNaN(new Date(v).getTime()));
  if (dateStr.length > filled.length * 0.5) s.time += 5;
  return s;
}
function _detectColumns(headers, rows) {
  const sample = rows.slice(0, Math.min(10, rows.length));
  const cols = headers.map((h, i) => ({h, i, s: _scoreCol(h, sample.map(r => r[i]))}));
  const pick = (role, skip=[]) =>
    cols.filter(c => !skip.includes(c.i)).sort((a,b) => b.s[role]-a.s[role]).find(c => c.s[role] > 0);
  const tCol = pick('time'); const used = tCol ? [tCol.i] : [];
  const oCol = pick('open', used); if(oCol) used.push(oCol.i);
  const hCol = pick('high', used); if(hCol) used.push(hCol.i);
  const lCol = pick('low', used); if(lCol) used.push(lCol.i);
  const cCol = pick('close', used); if(cCol) used.push(cCol.i);
  const vCol = pick('volume', used); if(vCol) used.push(vCol.i);
  const hasOHLC = oCol && hCol && lCol && cCol;
  const pCol = !hasOHLC ? pick('price', used) : null;
  let conf = 0;
  if (tCol) conf += tCol.s.time >= 8 ? 40 : 20;
  if (hasOHLC) conf += (oCol.s.open>=8 && hCol.s.high>=8 && lCol.s.low>=8 && cCol.s.close>=8) ? 60 : 35;
  else if (pCol) conf += pCol.s.price >= 6 ? 30 : 15;
  return {
    time: tCol?.i??null, open: oCol?.i??null, high: hCol?.i??null,
    low: lCol?.i??null, close: cCol?.i??null, volume: vCol?.i??null,
    price: pCol?.i??null, confidence: conf, headers
  };
}
function _buildCandles(rows, mapping) {
  const {time:tI,open:oI,high:hI,low:lI,close:cI,volume:vI,price:pI} = mapping;
  const candles = [];
  for (const row of rows) {
    const t = _parseTimestamp(row[tI]);
    if (!t || !Number.isFinite(t)) continue;
    let o, h, l, c;
    if (oI!=null && hI!=null && lI!=null && cI!=null) {
      const ro=row[oI],rh=row[hI],rl=row[lI],rc=row[cI];
      if (!ro?.trim()||!rh?.trim()||!rl?.trim()||!rc?.trim()) continue;
      o=Number(ro); h=Number(rh); l=Number(rl); c=Number(rc);
    } else {
      const rawP = row[pI??cI];
      if (!rawP?.trim()) continue;
      const p = Number(rawP);
      if (!Number.isFinite(p)) continue;
      o=h=l=c=p;
    }
    if (!Number.isFinite(o) || !Number.isFinite(c)) continue;
    const v = vI!=null ? Number(row[vI]) : 0;
    candles.push({time:t,open:o,high:h,low:l,close:c,volume:Number.isFinite(v)?v:0});
  }
  return candles.sort((a,b) => a.time-b.time);
}
function _detectInterval(candles) {
  if (candles.length < 2) return null;
  const diffs = [];
  for (let i = 1; i < Math.min(candles.length, 20); i++) diffs.push(candles[i].time - candles[i-1].time);
  diffs.sort((a,b) => a-b);
  const median = diffs[Math.floor(diffs.length/2)];
  const map = {'1m':60,'2m':120,'5m':300,'15m':900,'30m':1800,'1h':3600,'4h':14400,'1d':86400,'1wk':604800,'1mo':2592000,'3mo':7776000};
  let best = null, bestDiff = Infinity;
  for (const [label, secs] of Object.entries(map)) {
    const d = Math.abs(median - secs);
    if (d < bestDiff) { bestDiff = d; best = label; }
  }
  return best;
}
export class Importer {
  constructor(chart) { this._chart=chart; }
  buildEl() {
    const wrap = document.createElement('div');
    wrap.className='imp-wrap';
    const zone = document.createElement('label');
    zone.className='imp-dropzone';
    zone.htmlFor='imp-file-input';
    zone.innerHTML=`<span class="imp-icon">↑</span><span class="imp-text">Drop CSV or click to browse</span>`;
    const fileIn = Object.assign(document.createElement('input'),{type:'file',id:'imp-file-input',name:'imp-file-input',accept:'.csv,.tsv,.txt',className:'hidden'});
    zone.ondragover=e=>{e.preventDefault();zone.classList.add('drag-over');};
    zone.ondragleave=()=>zone.classList.remove('drag-over');
    zone.ondrop=e=>{e.preventDefault();zone.classList.remove('drag-over');if(e.dataTransfer.files[0])this._handleFile(e.dataTransfer.files[0]);};
    fileIn.onchange=()=>{if(fileIn.files[0])this._handleFile(fileIn.files[0]);};
    wrap.append(zone,fileIn);
    return wrap;
  }
  async _handleFile(file) {
    const text = await file.text();
    const parsed = _parseCSV(text);
    if (!parsed) { toast('Could not parse CSV','error'); return; }
    const mapping = _detectColumns(parsed.headers, parsed.rows);
    if (mapping.time==null) { toast('No time column detected','error'); return; }
    if (mapping.open==null && mapping.price==null && mapping.close==null) { toast('No price column detected','error'); return; }
    if (mapping.confidence >= 75) this._load(parsed, mapping);
    else this._showModal(parsed, mapping);
  }
  _load(parsed, mapping) {
    const candles = _buildCandles(parsed.rows, mapping);
    if (!candles.length) { toast('No valid candles found','error'); return; }
    const interval = _detectInterval(candles);
    this._chart._loadDataset(candles, interval);
    toast(`Imported ${candles.length} bars`,'success');
  }
  _showModal(parsed, mapping) {
    const overlay = document.createElement('div');
    overlay.className='imp-modal-overlay';
    overlay.onclick=e=>{if(e.target===overlay)close();};
    const m = {...mapping};
    if (m.open==null && m.price!=null) m.close=m.price;
    const roles = ['time','open','high','low','close','volume'];
    const labels = {time:'Time',open:'Open',high:'High',low:'Low',close:'Close',volume:'Volume'};
    const rows = roles.map(r=>`<div class="imp-map-row"><label class="imp-map-label" for="imp-map-${r}">${labels[r]}</label><select class="imp-map-sel" id="imp-map-${r}" name="imp-map-${r}" data-role="${r}">${['(none)',...parsed.headers].map((h,i)=>`<option value="${i-1}"${i-1===(m[r]??-1)?' selected':''}>${h}</option>`).join('')}</select></div>`).join('');
    overlay.innerHTML=`<div class="imp-modal"><div class="imp-modal-head"><span class="imp-modal-title">Confirm Column Mapping</span><button class="icon-btn imp-modal-close">✕</button></div><div class="imp-modal-body">${rows}</div><div class="imp-modal-foot"><button class="btn-sm imp-modal-cancel">Cancel</button><button class="btn-primary imp-modal-confirm">Import</button></div></div>`;
    document.body.appendChild(overlay);
    const close=()=>document.body.removeChild(overlay);
    overlay.querySelector('.imp-modal-close').onclick=close;
    overlay.querySelector('.imp-modal-cancel').onclick=close;
    overlay.querySelector('.imp-modal-confirm').onclick=()=>{
      const fm={...mapping};
      overlay.querySelectorAll('.imp-map-sel').forEach(s=>{fm[s.dataset.role]=Number(s.value)>=0?Number(s.value):null;});
      close();
      this._load(parsed,fm);
    };
  }
}