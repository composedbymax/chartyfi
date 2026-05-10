import {aiIcon} from './svg.js';
import {openAiChat} from './editorAi.js';
function highlight(raw) {
  const TOKEN = /(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|import|export|default|await|async|try|catch|finally|typeof|instanceof|in|of|this|null|undefined|true|false)\b|\b(\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b|([A-Za-z_$][\w$]*)(?=\s*\()/g;
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let out = '', last = 0, m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(raw)) !== null) {
    out += esc(raw.slice(last, m.index));
    const cls = m[1]||m[2] ? 'ef-cm' : m[3] ? 'ef-st' : m[4] ? 'ef-kw' : m[5] ? 'ef-nm' : 'ef-fn';
    out += `<span class="${cls}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  out += esc(raw.slice(last));
  return out;
}
function syncLines(linesEl, code) {
  const n = (code.match(/\n/g)||[]).length + 1;
  const cur = linesEl.children.length;
  if (cur < n) {
    const frag = document.createDocumentFragment();
    for (let i = cur + 1; i <= n; i++) {
      const d = document.createElement('div');
      d.textContent = i;
      frag.appendChild(d);
    }
    linesEl.appendChild(frag);
  } else {
    while (linesEl.children.length > n) linesEl.lastChild.remove();
  }
}
function writeClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text).catch(() => {});
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try { document.execCommand('copy'); } catch {}
  ta.remove();
  return Promise.resolve();
}
export function openFullscreen({ code, name, onChange, onClose }) {
  const overlay = document.createElement('div');
  overlay.className = 'ef-overlay';
  const header = document.createElement('div');
  header.className = 'ef-header';
  const title = document.createElement('span');
  title.className = 'ef-title';
  title.textContent = name || 'Editor';
  const aiBtn = document.createElement('button');
  aiBtn.className = 'icon-btn ef-ai-btn';
  aiBtn.title = 'AI Indicator Assistant';
  aiBtn.appendChild(aiIcon());
  const closeBtn = document.createElement('button');
  closeBtn.className = 'icon-btn ef-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.title = 'Exit fullscreen (Esc)';
  header.append(title, aiBtn, closeBtn);
  const body = document.createElement('div');
  body.className = 'ef-body';
  const linesEl = document.createElement('div');
  linesEl.className = 'ef-lines';
  const edWrap = document.createElement('div');
  edWrap.className = 'ef-editor-wrap';
  const hlDiv = document.createElement('div');
  hlDiv.className = 'ef-highlight';
  hlDiv.setAttribute('aria-hidden', 'true');
  const ta = document.createElement('textarea');
  ta.className = 'ef-ta';
  ta.spellcheck = false;
  ta.autocomplete = 'off';
  ta.autocorrect = 'off';
  ta.autocapitalize = 'off';
  ta.name = 'ef-code';
  ta.value = code || '';
  edWrap.append(hlDiv, ta);
  body.append(linesEl, edWrap);
  overlay.append(header, body);
  document.body.appendChild(overlay);
  const syncLineHeights = () => {
    const lineEls = linesEl.children;
    const hlLines = hlDiv.children;
    for (let i = 0; i < hlLines.length; i++) {
      if (lineEls[i]) lineEls[i].style.height = hlLines[i].offsetHeight + 'px';
    }
  };
  const sync = () => {
    const lines = ta.value.split('\n');
    syncLines(linesEl, ta.value);
    hlDiv.innerHTML = '';
    const frag = document.createDocumentFragment();
    lines.forEach(line => {
      const d = document.createElement('div');
      d.className = 'ef-line';
      d.innerHTML = highlight(line) || '\u200b';
      frag.appendChild(d);
    });
    hlDiv.appendChild(frag);
    syncLineHeights();
    hlDiv.scrollTop = ta.scrollTop;
    hlDiv.scrollLeft = ta.scrollLeft;
    linesEl.scrollTop = ta.scrollTop;
    if (onChange) onChange(ta.value);
  };
  sync();
  ta.focus();
  const ro = new ResizeObserver(syncLineHeights);
  ro.observe(edWrap);
  const PAIRS = { '(':')', '{':'}', '[':']', '"':'"', "'":"'", '`':'`' };
  const CLOSING = new Set([')', '}', ']', '"', "'", '`']);
  ta.addEventListener('input', sync);
  ta.addEventListener('scroll', () => {
    hlDiv.scrollTop = ta.scrollTop;
    hlDiv.scrollLeft = ta.scrollLeft;
    linesEl.scrollTop = ta.scrollTop;
  });
  ta.addEventListener('keydown', e => {
    const s = ta.selectionStart, end = ta.selectionEnd;
    if ((e.metaKey || e.altKey) && e.key.toLowerCase() === 'x') {
      e.preventDefault();
      let cutText = '';
      if (s !== end) {
        cutText = ta.value.slice(s, end);
        ta.value = ta.value.slice(0, s) + ta.value.slice(end);
        ta.selectionStart = ta.selectionEnd = s;
      } else {
        let ls = ta.value.lastIndexOf('\n', s - 1) + 1;
        let le = ta.value.indexOf('\n', s);
        if (le === -1) le = ta.value.length;
        else le += 1;
        cutText = ta.value.slice(ls, le);
        ta.value = ta.value.slice(0, ls) + ta.value.slice(le);
        ta.selectionStart = ta.selectionEnd = ls;
      }
      writeClipboard(cutText);
      sync();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (e.shiftKey) {
        const startLine = ta.value.lastIndexOf('\n', s - 1) + 1;
        let endLine = ta.value.indexOf('\n', end);
        if (endLine === -1) endLine = ta.value.length;
        const block = ta.value.slice(startLine, endLine);
        const outdented = block.replace(/^ {1,2}/gm, '');
        ta.value = ta.value.slice(0, startLine) + outdented + ta.value.slice(endLine);
        const diff = block.length - outdented.length;
        ta.selectionStart = Math.max(startLine, s - 2);
        ta.selectionEnd = end - diff;
        sync();
      } else if (s === end) {
        ta.value = ta.value.slice(0, s) + '  ' + ta.value.slice(end);
        ta.selectionStart = ta.selectionEnd = s + 2;
        sync();
      } else {
        const sel = ta.value.slice(s, end);
        const indented = sel.replace(/^/gm, '  ');
        ta.value = ta.value.slice(0, s) + indented + ta.value.slice(end);
        ta.selectionStart = s;
        ta.selectionEnd = s + indented.length;
        sync();
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const ls = ta.value.lastIndexOf('\n', s - 1) + 1;
      const line = ta.value.slice(ls, s);
      const indent = line.match(/^(\s*)/)[1];
      const lastCh = ta.value[s - 1];
      const extra = (lastCh === '{' || lastCh === '(' || lastCh === '[') ? '  ' : '';
      const ins = '\n' + indent + extra;
      ta.value = ta.value.slice(0, s) + ins + ta.value.slice(end);
      ta.selectionStart = ta.selectionEnd = s + ins.length;
      sync();
    } else if (PAIRS[e.key]) {
      e.preventDefault();
      const sel = ta.value.slice(s, end);
      ta.value = ta.value.slice(0, s) + e.key + sel + PAIRS[e.key] + ta.value.slice(end);
      ta.selectionStart = s + 1;
      ta.selectionEnd = end + 1;
      sync();
    } else if (CLOSING.has(e.key) && ta.value[s] === e.key && s === end) {
      e.preventDefault();
      ta.selectionStart = ta.selectionEnd = s + 1;
    } else if (e.key === 'Backspace' && s === end && s > 0) {
      const prev = ta.value[s - 1];
      if (PAIRS[prev] && PAIRS[prev] === ta.value[s]) {
        e.preventDefault();
        ta.value = ta.value.slice(0, s - 1) + ta.value.slice(s + 1);
        ta.selectionStart = ta.selectionEnd = s - 1;
        sync();
      }
    }
  });
  aiBtn.onclick = () => openAiChat({
    getCode: () => ta.value,
    onInsert: inserted => {ta.value = inserted;sync();ta.focus();}
  });
  let close;
  const onEsc = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onEsc);
  close = () => {
    ro.disconnect();
    document.removeEventListener('keydown', onEsc);
    overlay.remove();
    if (onClose) onClose(ta.value);
  };
  closeBtn.onclick = close;
}