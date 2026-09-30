import { attachSpinner } from "./spinner.js";
import { storage } from "./storage.js";
let _activeOverlay = null;
let _chatMessages  = [];
export function openAiChat({ getCode, onInsert }) {
    if (_activeOverlay) { _activeOverlay.querySelector('[data-role="input"]')?.focus(); return; }
    let sending = false;
    let abortController = null;
    const overlay = document.createElement('div');
    overlay.className = 'fixed-ins-0 flex-center-justify z-15 shadow-2';
    overlay.dataset.sidebarPersist = '';
    overlay.innerHTML = `
        <div class="flex-column bg-2 border-soft rounded w-modal-md h-modal-md" data-role="panel">
            <div class="flex items-center p-10-12 border-b gap-8 flex-shrink-0">
                <span class="flex-1 text-13 fw-600 text-primary">Indicator Assistant</span>
                <button class="icon-btn flex-shrink-0" data-role="close">&times;</button>
            </div>
            <div class="flex items-center gap-8 p-8-12 border-b flex-shrink-0">
                <button class="btn-sm" data-role="new-chat">New Chat</button>
            </div>
            <div class="relative flex-1 flex-column overflow-y-auto p-12 gap-12" data-role="messages"></div>
            <div class="flex gap-8 p-10-12 border-t flex-shrink-0">
                <textarea class="flex-1 min-w-0 rounded border-soft bg-3 text-primary p-8-12 mono h-34" id="eai-input-ta" name="prompt" data-role="input"
                    placeholder="Ask for a new indicator..."></textarea>
                <button class="btn-primary h-full stretch-self" data-role="send">Send</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    _activeOverlay = overlay;
    const closeBtn   = overlay.querySelector('[data-role="close"]');
    const newChatBtn = overlay.querySelector('[data-role="new-chat"]');
    const msgsEl     = overlay.querySelector('[data-role="messages"]');
    const inputTa    = overlay.querySelector('[data-role="input"]');
    const sendBtn    = overlay.querySelector('[data-role="send"]');
    const INPUT_MAX_HEIGHT = 100;
    function resizeInput() {
        inputTa.style.height = 'auto';
        inputTa.style.height = Math.min(inputTa.scrollHeight + 2, INPUT_MAX_HEIGHT) + 'px';
    }
    inputTa.addEventListener('input', resizeInput);
    function parseContent(text) {
        const parts = [];
        const re = /```(indicator|[\w]*)\n([\s\S]*?)```/g;
        let last = 0, m;
        while ((m = re.exec(text))) {
            const pre = text.slice(last, m.index).trim();
            if (pre) parts.push({ type: 'text', content: pre });
            parts.push({
                type: m[1] === 'indicator' ? 'indicator' : 'code',
                content: m[2].trim()
            });
            last = m.index + m[0].length;
        }
        const tail = text.slice(last).trim();
        if (tail) parts.push({ type: 'text', content: tail });
        return parts;
    }
    function buildIndicatorBlock(content) {
        const block = document.createElement('div');
        block.className = 'border-soft rounded overflow-hidden w-full bg';
        const pre = document.createElement('pre');
        pre.className = 'p-10-12 text-12 mono text-primary overflow-x-auto lh-16';
        pre.textContent = content;
        const actions = document.createElement('div');
        actions.className = 'flex items-center gap-6 p-6-12 border-t bg-2';
        const addBtn = document.createElement('button');
        addBtn.className = 'btn-primary text-12 p-6-12';
        addBtn.textContent = '+ Add to Editor';
        addBtn.onclick = () => {
            onInsert(content);
            addBtn.textContent = '✓ Added';
            addBtn.disabled = true;
            setTimeout(() => { addBtn.textContent = '+ Add to Editor'; addBtn.disabled = false; }, 2000);
        };
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn-sm text-11 ml-auto';
        copyBtn.textContent = 'Copy';
        copyBtn.onclick = () => navigator.clipboard.writeText(content).then(() => {
            copyBtn.textContent = '✓';
            setTimeout(() => copyBtn.textContent = 'Copy', 1500);
        });
        actions.append(addBtn, copyBtn);
        block.append(pre, actions);
        return block;
    }
    function appendAssistantContent(row, content) {
        parseContent(content).forEach(part => {
            if (part.type === 'text') {
                const p = document.createElement('div');
                p.className = 'text-13 text-primary lh-16 prewrap-breakall bg-3 border-soft rounded p-8-12';
                p.textContent = part.content;
                row.appendChild(p);
            } else if (part.type === 'indicator') {
                row.appendChild(buildIndicatorBlock(part.content));
            } else {
                const pre = document.createElement('pre');
                pre.className = 'p-10-12 text-12 mono text-primary overflow-x-auto lh-16 bg-3 border-soft rounded w-full';
                pre.textContent = part.content;
                row.appendChild(pre);
            }
        });
    }
    function buildMessage(role, content, reasoning) {
        const row = document.createElement('div');
        row.className = `flex-column gap-6 w-full ${role === 'user' ? 'items-end' : 'items-start'}`;
        row.dataset.role = role;
        if (role === 'user') {
            const p = document.createElement('div');
            p.className = 'text-13 text-primary lh-14 prewrap-breakall accent-hl border rounded-tail-r p-8-12 wm-88pc';
            p.textContent = content;
            row.appendChild(p);
        } else {
            if (reasoning) {
                const rb = document.createElement('div');
                rb.className = 'w-full border-soft rounded overflow-hidden bg';
                const rt = document.createElement('button');
                rt.className = 'flex items-center w-full p-5-10 bg-3 border-b text-secondary text-11 fw-600 tracking-wider uppercase text-left';
                rt.type = 'button';
                rt.textContent = '▼ Reasoning';
                const rbody = document.createElement('div');
                rbody.className = 'p-8-12 text-11 font-italic text-secondary lh-17 prewrap-breakall max-h-180 overflow-y-auto';
                rbody.textContent = reasoning;
                rt.onclick = () => {
                    const collapsed = rbody.classList.toggle('hidden');
                    rt.textContent = collapsed ? '▶ Reasoning' : '▼ Reasoning';
                };
                rb.append(rt, rbody);
                row.appendChild(rb);
            }
            appendAssistantContent(row, content);
        }
        return row;
    }
    function renderMessages() {
        msgsEl.innerHTML = '';
        _chatMessages.forEach(msg => msgsEl.appendChild(buildMessage(msg.role, msg.content, msg.reasoning)));
        const ll = document.createElement('div');
        ll.className = 'flex justify-center p-8-0 mt-auto';
        msgsEl.appendChild(ll);
        return ll;
    }
    let loaderLayer = renderMessages();
    const spinner = attachSpinner(loaderLayer, { size: 40, color: "var(--accent)" });
    spinner.hide();
    newChatBtn.onclick = () => {
        if (sending) return;
        _chatMessages = [];
        loaderLayer.remove();
        loaderLayer = renderMessages();
        spinner.destroy?.();
        const s = attachSpinner(loaderLayer, { size: 40, color: "var(--accent)" });
        s.hide();
        spinner.hide    = s.hide.bind(s);
        spinner.show    = s.show.bind(s);
        spinner.destroy = s.destroy?.bind(s);
        inputTa.focus();
    };
    async function send() {
        const text  = inputTa.value.trim();
        const model = storage.getPreferredModel();
        if (!text || sending || !model) return;
        sending = true;
        abortController = new AbortController();
        sendBtn.textContent = 'Stop';
        inputTa.value = '';
        resizeInput();
        _chatMessages.push({ role: 'user', content: text });
        msgsEl.insertBefore(buildMessage('user', text), loaderLayer);
        spinner.show();
        msgsEl.scrollTop = msgsEl.scrollHeight;
        const assistantRow    = document.createElement('div');
        assistantRow.className = 'flex-column gap-6 w-full items-start';
        assistantRow.dataset.role = 'assistant';
        const reasoningBlock  = document.createElement('div');
        reasoningBlock.className = 'w-full border-soft rounded overflow-hidden bg hidden';
        reasoningBlock.dataset.streaming = 'true';
        const reasoningToggle = document.createElement('button');
        reasoningToggle.className   = 'flex items-center w-full p-5-10 bg-3 border-b text-secondary text-11 fw-600 tracking-wider uppercase text-left';
        reasoningToggle.type        = 'button';
        reasoningToggle.textContent = 'Thinking…';
        const reasoningBody = document.createElement('div');
        reasoningBody.className = 'p-8-12 text-11 font-italic text-secondary lh-17 prewrap-breakall max-h-180 overflow-y-auto';
        reasoningBlock.append(reasoningToggle, reasoningBody);
        const streamText = document.createElement('div');
        streamText.className = 'text-13 text-primary lh-16 prewrap-breakall bg-3 border-soft rounded p-8-12';
        streamText.dataset.streaming = 'true';
        assistantRow.append(reasoningBlock, streamText);
        msgsEl.insertBefore(assistantRow, loaderLayer);
        let reasoningContent = '';
        let mainContent      = '';
        let success          = false;
        try {
            const res = await fetch(window.ARI.api, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: abortController.signal,
                body: JSON.stringify({
                    action: 'chat',
                    model,
                    messages: _chatMessages,
                    instructionTypes: ['indicators'],
                    currentCode: getCode()
                })
            });
            const ct = res.headers.get('content-type') || '';
            if (!ct.includes('text/event-stream')) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data?.error?.message || data?.error || `HTTP ${res.status}`);
            }
            spinner.hide();
            if (!res.body) throw new Error('No response body');
            const reader  = res.body.getReader();
            const decoder = new TextDecoder();
            let buf  = '';
            let done = false;
            while (!done) {
                const { done: d, value } = await reader.read();
                if (d) break;
                buf += decoder.decode(value, { stream: true });
                const lines = buf.split('\n');
                buf = lines.pop();
                for (const line of lines) {
                    if (!line.startsWith('data: ')) continue;
                    const raw = line.slice(6).trim();
                    if (raw === '[DONE]') { done = true; break; }
                    let chunk;
                    try { chunk = JSON.parse(raw); } catch { continue; }
                    const delta = chunk.choices?.[0]?.delta;
                    if (!delta) continue;
                    if (typeof delta.reasoning_content === 'string') {
                        reasoningContent += delta.reasoning_content;
                        if (reasoningBlock.classList.contains('hidden')) reasoningBlock.classList.remove('hidden');
                        reasoningBody.textContent = reasoningContent;
                    }
                    if (typeof delta.content === 'string') {
                        mainContent += delta.content;
                        streamText.textContent = mainContent;
                    }
                    msgsEl.scrollTop = msgsEl.scrollHeight;
                }
            }
            success = true;
        } catch (e) {
            spinner.hide();
            if (e.name === 'AbortError') {
                success = mainContent.trim().length > 0;
                if (!success) {
                    assistantRow.remove();
                    _chatMessages.pop();
                }
            } else {
                assistantRow.remove();
                _chatMessages.pop();
                const err = document.createElement('div');
                err.className = 'text-12 text-neg rounded p-8-12 border';
                err.textContent = 'Error: ' + e.message;
                msgsEl.insertBefore(err, loaderLayer);
            }
        }
        if (success) {
            if (reasoningContent) {
                delete reasoningBlock.dataset.streaming;
                reasoningToggle.textContent = '▼ Reasoning';
                reasoningToggle.onclick = () => {
                    const collapsed = reasoningBody.classList.toggle('hidden');
                    reasoningToggle.textContent = collapsed ? '▶ Reasoning' : '▼ Reasoning';
                };
            }
            streamText.remove();
            const trimmed = mainContent.trim();
            if (trimmed) {
                appendAssistantContent(assistantRow, trimmed);
                _chatMessages.push({ role: 'assistant', content: trimmed, reasoning: reasoningContent || undefined });
            } else {
                assistantRow.remove();
                _chatMessages.pop();
            }
        }
        spinner.hide();
        sending = false;
        abortController = null;
        sendBtn.textContent = 'Send';
        msgsEl.scrollTop = msgsEl.scrollHeight;
    }
    sendBtn.onclick = () => { if (sending) abortController?.abort(); else send(); };
    inputTa.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    function close() {
        overlay.remove();
        _activeOverlay = null;
        spinner.destroy?.();
    }
    closeBtn.onclick = close;
    overlay.onclick  = e => { if (e.target === overlay) close(); };
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    inputTa.focus();
    resizeInput();
}