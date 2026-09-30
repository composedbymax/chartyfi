import {aiIcon} from './svg.js';
import {openAiChat} from './editorAi.js';
import {authModal} from './authPage.js';
function highlight(raw) {
  const TOKEN = /(\/\/[^\n]*)|(\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|import|export|default|await|async|try|catch|finally|typeof|instanceof|in|of|this|null|undefined|true|false)\b|\b(\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b|([A-Za-z_$][\w$]*)(?=\s*\()/g;
  const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let out = '', last = 0, m;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(raw)) !== null) {
    out += esc(raw.slice(last, m.index));
    const cls = m[1]||m[2] ? 'text-muted font-italic' : m[3] ? 'text-color-1' : m[4] ? 'text-color-5' : m[5] ? 'text-color-4' : 'text-color-0';
    out += `<span class="${cls}">${esc(m[0])}</span>`;
    last = m.index + m[0].length;
  }
  out += esc(raw.slice(last));
  return out;
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
function getLineElements(el) {
  return Array.from(el.children).filter(c => c.classList && c.classList.contains('ce-line'));
}
function lineText(lineEl) {
  return lineEl.textContent.replace(/\u200b/g, '');
}
function getPlainText(el) {
  return getLineElements(el).map(lineText).join('\n');
}
function domPositionToLineOffset(el, node, domOffset) {
  const lineEls = getLineElements(el);
  let lineEl = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (lineEl && lineEl.parentElement !== el) lineEl = lineEl.parentElement;
  let lineIndex = lineEl ? lineEls.indexOf(lineEl) : -1;
  if (lineIndex === -1) {
    lineIndex = lineEls.length - 1;
    if (lineIndex < 0) return {lineIndex: 0, offsetInLine: 0};
    return {lineIndex, offsetInLine: lineText(lineEls[lineIndex]).length};
  }
  const walker = document.createTreeWalker(lineEls[lineIndex], NodeFilter.SHOW_TEXT, null);
  let count = 0, found = false, t;
  while ((t = walker.nextNode())) {
    if (t === node) {
      count += (t.textContent === '\u200b') ? 0 : domOffset;
      found = true;
      break;
    }
    count += (t.textContent === '\u200b') ? 0 : t.textContent.length;
  }
  if (!found) {
    count = domOffset >= lineEls[lineIndex].childNodes.length ? lineText(lineEls[lineIndex]).length : 0;
  }
  return {lineIndex, offsetInLine: count};
}
function lineOffsetToCharOffset(el, lineIndex, offsetInLine) {
  const lineEls = getLineElements(el);
  let total = 0;
  for (let i = 0; i < lineIndex; i++) total += lineText(lineEls[i]).length + 1;
  return total + offsetInLine;
}
function saveCaretOffsets(el) {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount || !el.contains(sel.anchorNode)) return null;
  const range = sel.getRangeAt(0);
  const startPos = domPositionToLineOffset(el, range.startContainer, range.startOffset);
  const endPos = domPositionToLineOffset(el, range.endContainer, range.endOffset);
  return {
    start: lineOffsetToCharOffset(el, startPos.lineIndex, startPos.offsetInLine),
    end: lineOffsetToCharOffset(el, endPos.lineIndex, endPos.offsetInLine)
  };
}
function charOffsetToLineOffset(text, chars) {
  const lines = text.split('\n');
  let remaining = chars;
  for (let i = 0; i < lines.length; i++) {
    const len = lines[i].length;
    if (remaining <= len || i === lines.length - 1) {
      return {lineIndex: i, offsetInLine: Math.max(0, Math.min(remaining, len))};
    }
    remaining -= len + 1;
  }
  return {lineIndex: 0, offsetInLine: 0};
}
function findTextPositionInLine(lineEl, offsetInLine) {
  const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT, null);
  let count = 0, t;
  while ((t = walker.nextNode())) {
    const len = (t.textContent === '\u200b') ? 0 : t.textContent.length;
    if (t.textContent === '\u200b') {
      return {node: t, offset: 0};
    }
    if (offsetInLine <= count + len) return {node: t, offset: offsetInLine - count};
    count += len;
  }
  return {node: lineEl, offset: 0};
}
function restoreCaretOffsets(el, offsets, text) {
  if (!offsets) return;
  const plainText = text != null ? text : getPlainText(el);
  const lineEls = getLineElements(el);
  const sel = window.getSelection();
  const startLO = charOffsetToLineOffset(plainText, offsets.start);
  const endLO = charOffsetToLineOffset(plainText, offsets.end);
  const startLineEl = lineEls[startLO.lineIndex];
  const endLineEl = lineEls[endLO.lineIndex];
  if (!startLineEl || !endLineEl) return;
  const startPos = findTextPositionInLine(startLineEl, startLO.offsetInLine);
  const endPos = findTextPositionInLine(endLineEl, endLO.offsetInLine);
  const range = document.createRange();
  range.setStart(startPos.node, startPos.offset);
  range.setEnd(endPos.node, endPos.offset);
  sel.removeAllRanges();
  sel.addRange(range);
}
export function openFullscreen({ code, name, onChange, onClose }) {
  const overlay = document.createElement('div');
  overlay.className = 'fixed-ins-0 z-13 flex-column bg';
  overlay.dataset.sidebarPersist = '';
  const header = document.createElement('div');
  header.className = 'flex-center p-safe-12-0 h-44-safe border-b flex-shrink-0 bg-2 gap-8';
  const title = document.createElement('span');
  title.className = 'text-13 fw-600 flex-1 text-primary text-ellipsis';
  title.textContent = name || 'Editor';
  const aiBtn = document.createElement('button');
  aiBtn.className = 'icon-btn svg-16 hov-text-accent';
  aiBtn.title = 'AI Indicator Assistant';
  aiBtn.appendChild(aiIcon());
  const closeBtn = document.createElement('button');
  closeBtn.className = 'icon-btn ml-auto flex-shrink-0 hov-red text-22';
  closeBtn.innerHTML = '&times;';
  closeBtn.title = 'Exit fullscreen (Esc)';
  header.append(title, aiBtn, closeBtn);
  const body = document.createElement('div');
  body.className = 'flex flex-1 overflow-hidden';
  const gutterOuter = document.createElement('div');
  gutterOuter.className = 'flex-shrink-0 bg-2 border-r mono text-12 text-muted text-right select-none w-42 overflow-hidden relative';
  const gutterInner = document.createElement('div');
  gutterInner.className = 'absolute top-0 w-full';
  gutterInner.style.right = '6px';
  gutterInner.style.paddingRight = '10px';
  gutterOuter.appendChild(gutterInner);
  const scrollWrap = document.createElement('div');
  scrollWrap.className = 'flex-1 relative overflow-y-auto overflow-x-hidden';
  const codeEl = document.createElement('div');
  codeEl.className = 'mono text-12 lh-16 prewrap-breakall tab-2 text-primary p-10-12 outline-0';
  codeEl.contentEditable = 'true';
  codeEl.spellcheck = false;
  codeEl.autocapitalize = 'off';
  codeEl.setAttribute('autocorrect', 'off');
  codeEl.style.minHeight = '100%';
  codeEl.style.caretColor = 'var(--accent)';
  codeEl.style.whiteSpace = 'pre-wrap';
  codeEl.style.wordBreak = 'break-word';
  scrollWrap.appendChild(codeEl);
  body.append(gutterOuter, scrollWrap);
  overlay.append(header, body);
  document.body.appendChild(overlay);
  const suggestOverlay = document.createElement('div');
  suggestOverlay.className = 'absolute z-10 flex items-baseline pointer-none mono text-12 lh-16 text-muted';
  suggestOverlay.style.display = 'none';
  suggestOverlay.innerHTML = '<span data-role="ghost"></span><span class="inline-block ml-4 p-0-4 text-10 bg-4 rounded text-primary" data-role="tab-hint">Tab</span><span class="ml-2 text-10 text-secondary" data-role="down-hint">▼</span>';
  scrollWrap.appendChild(suggestOverlay);
  const suggestList = document.createElement('div');
  suggestList.className = 'absolute z-11 bg-2 border-soft rounded max-h-260 overflow-y-auto text-12 lh-16 pointer-auto';
  suggestList.style.display = 'none';
  scrollWrap.appendChild(suggestList);
  let currentSuggestions = [];
  let currentWordRange = null;
  let activeSuggestionIndex = -1;
  let rafHandle = null;
  let lastText = code || '';
  function renderLines(text) {
    const lines = text.split('\n');
    const frag = document.createDocumentFragment();
    lines.forEach(line => {
      const d = document.createElement('div');
      d.className = 'ce-line';
      d.innerHTML = highlight(line) || '\u200b';
      frag.appendChild(d);
    });
    codeEl.innerHTML = '';
    codeEl.appendChild(frag);
  }
  function layoutGutter() {
    const lineEls = codeEl.querySelectorAll('.ce-line');
    const containerTop = codeEl.getBoundingClientRect().top;
    const frag = document.createDocumentFragment();
    lineEls.forEach((lineEl, i) => {
      const rect = lineEl.getBoundingClientRect();
      const top = rect.top - containerTop;
      const num = document.createElement('div');
      num.textContent = i + 1;
      num.style.position = 'absolute';
      num.style.top = top + 'px';
      num.style.right = '0';
      num.style.lineHeight = getComputedStyle(lineEl).lineHeight || '1.6';
      frag.appendChild(num);
    });
    gutterInner.innerHTML = '';
    gutterInner.appendChild(frag);
    gutterInner.style.height = codeEl.scrollHeight + 'px';
  }
  function scheduleGutterLayout() {
    if (rafHandle) cancelAnimationFrame(rafHandle);
    rafHandle = requestAnimationFrame(() => { rafHandle = null; layoutGutter(); });
  }
  function sync(preserveCaret = true) {
    const caret = preserveCaret ? saveCaretOffsets(codeEl) : null;
    const text = getPlainText(codeEl);
    lastText = text;
    renderLines(text);
    if (caret) restoreCaretOffsets(codeEl, caret, text);
    layoutGutter();
    if (onChange) onChange(text);
  }
  renderLines(lastText);
  layoutGutter();
  codeEl.focus();
  scrollWrap.addEventListener('scroll', () => {
    gutterInner.style.transform = `translateY(${-scrollWrap.scrollTop}px)`;
  });
  const ro = new ResizeObserver(scheduleGutterLayout);
  ro.observe(codeEl);
  ro.observe(scrollWrap);
  const PAIRS = { '(':')', '{':'}', '[':']', '"':'"', "'":"'", '`':'`' };
  const CLOSING = new Set([')', '}', ']', '"', "'", '`']);
  function charAfterCaret() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return '';
    const offs = saveCaretOffsets(codeEl);
    if (!offs || offs.start !== offs.end) return '';
    return lastText.slice(offs.start, offs.start + 1);
  }
  function currentLineIndent() {
    const offs = saveCaretOffsets(codeEl);
    if (!offs) return '';
    const before = lastText.slice(0, offs.start);
    const ls = before.lastIndexOf('\n') + 1;
    const line = lastText.slice(ls, offs.start);
    return (line.match(/^\s*/) || [''])[0];
  }
  function hideSuggestions() {
    suggestOverlay.style.display = 'none';
    suggestList.style.display = 'none';
    currentSuggestions = [];
    activeSuggestionIndex = -1;
    currentWordRange = null;
  }
  function getWordAtCaret() {
    const offs = saveCaretOffsets(codeEl);
    if (!offs || offs.start !== offs.end) return null;
    const pos = offs.start;
    const before = lastText.slice(0, pos);
    const after = lastText.slice(pos);
    const leftMatch = before.match(/[\w$]+$/);
    if (!leftMatch) return null;
    const rightMatch = after.match(/^[\w$]+/);
    const word = leftMatch[0] + (rightMatch ? rightMatch[0] : '');
    const start = pos - leftMatch[0].length;
    const end = pos + (rightMatch ? rightMatch[0].length : 0);
    return { text: word, start, end, caret: pos };
  }
  function caretClientRect() {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    const range = sel.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rects = range.getClientRects();
    if (rects.length) return rects[0];
    const node = range.startContainer;
    const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
    return el ? el.getBoundingClientRect() : null;
  }
  function showGhostSuggestion(completion, wordInfo) {
    const rect = caretClientRect();
    if (!rect) { hideSuggestions(); return; }
    const wrapRect = scrollWrap.getBoundingClientRect();
    suggestOverlay.style.left = (rect.right - wrapRect.left + scrollWrap.scrollLeft) + 'px';
    suggestOverlay.style.top = (rect.top - wrapRect.top + scrollWrap.scrollTop) + 'px';
    suggestOverlay.style.display = 'flex';
    const partialLen = wordInfo.caret - wordInfo.start;
    suggestOverlay.querySelector('[data-role="ghost"]').textContent = completion.slice(partialLen);
    suggestOverlay.querySelector('[data-role="down-hint"]').style.display =
      currentSuggestions.length > 1 ? '' : 'none';
  }
  function updateAutocomplete() {
    const word = getWordAtCaret();
    if (!word || word.text.length === 0) { hideSuggestions(); return; }
    const prefix = word.text;
    const allWords = lastText.match(/\b\w+\b/g) || [];
    const unique = [...new Set(allWords)];
    const matches = unique.filter(w => w.startsWith(prefix) && w !== prefix);
    if (matches.length === 0) { hideSuggestions(); return; }
    currentSuggestions = matches.sort();
    currentWordRange = { start: word.start, end: word.end };
    showGhostSuggestion(matches[0], word);
  }
  function highlightListItem() {
    const items = suggestList.querySelectorAll('[data-role="suggestion"]');
    items.forEach((item, i) => {
      if (i === activeSuggestionIndex) item.dataset.active = 'true';
      else delete item.dataset.active;
    });
  }
  function insertCompletion(fullWord) {
    if (!currentWordRange) return;
    const newText = lastText.slice(0, currentWordRange.start) + fullWord + lastText.slice(currentWordRange.end);
    const caretPos = currentWordRange.start + fullWord.length;
    lastText = newText;
    renderLines(newText);
    restoreCaretOffsets(codeEl, { start: caretPos, end: caretPos }, newText);
    layoutGutter();
    if (onChange) onChange(newText);
  }
  function showMoreSuggestions() {
    suggestList.innerHTML = '';
    currentSuggestions.forEach((w, i) => {
      const item = document.createElement('div');
      item.className = 'p-2-7 cursor-pointer text-primary';
      item.dataset.role = 'suggestion';
      item.textContent = w;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        insertCompletion(w);
        hideSuggestions();
      });
      suggestList.appendChild(item);
    });
    activeSuggestionIndex = 0;
    highlightListItem();
    const overlayRect = suggestOverlay.getBoundingClientRect();
    const wrapRect = scrollWrap.getBoundingClientRect();
    suggestList.style.left = (overlayRect.left - wrapRect.left) + 'px';
    suggestList.style.top = (overlayRect.bottom - wrapRect.top + scrollWrap.scrollTop) + 'px';
    suggestList.style.display = 'block';
  }
  let composing = false;
  codeEl.addEventListener('compositionstart', () => { composing = true; });
  codeEl.addEventListener('compositionend', () => { composing = false; sync(); updateAutocomplete(); });
  codeEl.addEventListener('input', () => {
    if (composing) return;
    sync();
    updateAutocomplete();
  });
  codeEl.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasted = (e.clipboardData || window.clipboardData).getData('text/plain');
    const offs = saveCaretOffsets(codeEl);
    if (!offs) return;
    const newText = lastText.slice(0, offs.start) + pasted + lastText.slice(offs.end);
    const caretPos = offs.start + pasted.length;
    lastText = newText;
    renderLines(newText);
    restoreCaretOffsets(codeEl, { start: caretPos, end: caretPos }, newText);
    layoutGutter();
    if (onChange) onChange(newText);
  });
  codeEl.addEventListener('keydown', e => {
    if (suggestOverlay.style.display !== 'none') {
      if (e.key === 'Tab') {
        e.preventDefault();
        const word = activeSuggestionIndex >= 0 ? currentSuggestions[activeSuggestionIndex] : currentSuggestions[0];
        insertCompletion(word);
        hideSuggestions();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (suggestList.style.display === 'none') { showMoreSuggestions(); }
        else { activeSuggestionIndex = Math.min(activeSuggestionIndex + 1, currentSuggestions.length - 1); highlightListItem(); }
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (suggestList.style.display !== 'none') { activeSuggestionIndex = Math.max(activeSuggestionIndex - 1, 0); highlightListItem(); }
        return;
      }
      if (e.key === 'Escape') { e.preventDefault(); hideSuggestions(); return; }
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'x') {
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      const offs = saveCaretOffsets(codeEl);
      if (!offs) return;
      if (e.shiftKey) {
        const startLine = lastText.lastIndexOf('\n', offs.start - 1) + 1;
        let endLine = lastText.indexOf('\n', offs.end);
        if (endLine === -1) endLine = lastText.length;
        const block = lastText.slice(startLine, endLine);
        const outdented = block.replace(/^ {1,2}/gm, '');
        const diff = block.length - outdented.length;
        const newText = lastText.slice(0, startLine) + outdented + lastText.slice(endLine);
        lastText = newText;
        renderLines(newText);
        restoreCaretOffsets(codeEl, { start: Math.max(startLine, offs.start - 2), end: offs.end - diff }, newText);
        layoutGutter();
        if (onChange) onChange(newText);
      } else if (offs.start === offs.end) {
        const newText = lastText.slice(0, offs.start) + '  ' + lastText.slice(offs.start);
        const caretPos = offs.start + 2;
        lastText = newText;
        renderLines(newText);
        restoreCaretOffsets(codeEl, { start: caretPos, end: caretPos }, newText);
        layoutGutter();
        if (onChange) onChange(newText);
      } else {
        const sel = lastText.slice(offs.start, offs.end);
        const indented = sel.replace(/^/gm, '  ');
        const newText = lastText.slice(0, offs.start) + indented + lastText.slice(offs.end);
        lastText = newText;
        renderLines(newText);
        restoreCaretOffsets(codeEl, { start: offs.start, end: offs.start + indented.length }, newText);
        layoutGutter();
        if (onChange) onChange(newText);
      }
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const offs = saveCaretOffsets(codeEl);
      if (!offs) return;
      const indent = currentLineIndent();
      const last = lastText[offs.start - 1];
      const extra = (last === '{' || last === '(' || last === '[') ? '  ' : '';
      const insertion = '\n' + indent + extra;
      const newText = lastText.slice(0, offs.start) + insertion + lastText.slice(offs.end);
      const caretPos = offs.start + insertion.length;
      lastText = newText;
      renderLines(newText);
      restoreCaretOffsets(codeEl, { start: caretPos, end: caretPos }, newText);
      layoutGutter();
      if (onChange) onChange(newText);
      return;
    }
    if (PAIRS[e.key]) {
      e.preventDefault();
      const offs = saveCaretOffsets(codeEl);
      if (!offs) return;
      const sel = lastText.slice(offs.start, offs.end);
      const newText = lastText.slice(0, offs.start) + e.key + sel + PAIRS[e.key] + lastText.slice(offs.end);
      lastText = newText;
      renderLines(newText);
      if (sel.length) {
        restoreCaretOffsets(codeEl, { start: offs.start + 1, end: offs.start + 1 + sel.length }, newText);
      } else {
        const caretPos = offs.start + 1;
        restoreCaretOffsets(codeEl, { start: caretPos, end: caretPos }, newText);
      }
      layoutGutter();
      if (onChange) onChange(newText);
      return;
    }
    if (CLOSING.has(e.key) && charAfterCaret() === e.key) {
      e.preventDefault();
      const offs = saveCaretOffsets(codeEl);
      if (offs) restoreCaretOffsets(codeEl, { start: offs.start + 1, end: offs.start + 1 }, lastText);
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      const offs = saveCaretOffsets(codeEl);
      if (!offs) return;
      let start = offs.start, end = offs.end;
      if (start === end) {
        if (start === 0) return;
        const prev = lastText[start - 1];
        const next = lastText[start];
        if (PAIRS[prev] && PAIRS[prev] === next) {
          start -= 1;
          end += 1;
        } else {
          start -= 1;
        }
      }
      const newText = lastText.slice(0, start) + lastText.slice(end);
      lastText = newText;
      renderLines(newText);
      restoreCaretOffsets(codeEl, { start, end: start }, newText);
      layoutGutter();
      if (onChange) onChange(newText);
      return;
    }
    if (e.key === 'Delete') {
      e.preventDefault();
      const offs = saveCaretOffsets(codeEl);
      if (!offs) return;
      let start = offs.start, end = offs.end;
      if (start === end) {
        if (start >= lastText.length) return;
        end = start + 1;
      }
      const newText = lastText.slice(0, start) + lastText.slice(end);
      lastText = newText;
      renderLines(newText);
      restoreCaretOffsets(codeEl, { start, end: start }, newText);
      layoutGutter();
      if (onChange) onChange(newText);
      return;
    }
  });
  codeEl.addEventListener('keyup', e => {
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)) hideSuggestions();
  });
  codeEl.addEventListener('blur', () => { setTimeout(hideSuggestions, 150); });
  aiBtn.onclick = () => {
    if (!window.userLoggedIn) { authModal.open(); return; }
    openAiChat({
      getCode: () => lastText,
      onInsert: inserted => {
        lastText = inserted;
        renderLines(inserted);
        layoutGutter();
        codeEl.focus();
        if (onChange) onChange(inserted);
      }
    });
  };
  let close;
  const onEsc = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onEsc);
  close = () => {
    ro.disconnect();
    if (rafHandle) cancelAnimationFrame(rafHandle);
    document.removeEventListener('keydown', onEsc);
    overlay.remove();
    if (onClose) onClose(lastText);
  };
  closeBtn.onclick = close;
}