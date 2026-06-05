import { attachSpinner } from "./spinner.js";
const CUSTOM_KEY = 'eai-custom-instructions';
let _activeOverlay  = null;
let _modelsPromise  = null;
let _chatMessages   = [];
export function initAiChatModels() {
    if (!_modelsPromise) {
        _modelsPromise = fetch(window.ARI.api, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'list' })
        }).then(r => r.json()).catch(() => ({ models: [] }));
    }
    return _modelsPromise;
}
export function openAiChat({ getCode, onInsert }) {
    if (_activeOverlay) { _activeOverlay.querySelector('.eai-input-ta')?.focus(); return; }
    let sending = false;
    const overlay = document.createElement('div');
    overlay.className = 'eai-overlay';
    overlay.dataset.sidebarPersist = '';
    overlay.innerHTML = `
        <div class="eai-panel">
            <div class="eai-header">
                <span class="eai-title">Indicator Assistant</span>
                <button class="icon-btn eai-close">&times;</button>
            </div>
            <div class="eai-controls">
                <select class="eai-model-select" id="eai-model-select" name="model">
                    <option disabled selected>Loading models…</option>
                </select>
                <button class="btn-sm eai-new-chat">New Chat</button>
                <button class="btn-sm eai-instr-toggle">Instructions</button>
            </div>
            <div class="eai-instr-area hidden">
                <textarea class="eai-instr-ta" id="eai-instr-ta" name="instructions"
                    placeholder='Custom instructions (e.g. "always use EMA not SMA")...'></textarea>
            </div>
            <div class="eai-messages"></div>
            <div class="eai-input-row">
                <textarea class="eai-input-ta" id="eai-input-ta" name="prompt"
                    placeholder="Ask for a new indicator..."></textarea>
                <button class="btn-primary eai-send-btn">Send</button>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
    _activeOverlay = overlay;
    const closeBtn    = overlay.querySelector('.eai-close');
    const modelSelect = overlay.querySelector('.eai-model-select');
    const newChatBtn  = overlay.querySelector('.eai-new-chat');
    const instrToggle = overlay.querySelector('.eai-instr-toggle');
    const instrArea   = overlay.querySelector('.eai-instr-area');
    const instrTa     = overlay.querySelector('.eai-instr-ta');
    const msgsEl      = overlay.querySelector('.eai-messages');
    const inputTa     = overlay.querySelector('.eai-input-ta');
    const sendBtn     = overlay.querySelector('.eai-send-btn');
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
        block.className = 'eai-code-block';
        const pre = document.createElement('pre');
        pre.className = 'eai-code-pre';
        pre.textContent = content;
        const actions = document.createElement('div');
        actions.className = 'eai-code-actions';
        const addBtn = document.createElement('button');
        addBtn.className = 'btn-primary eai-add-btn';
        addBtn.textContent = '+ Add to Editor';
        addBtn.onclick = () => {
            onInsert(content);
            addBtn.textContent = '✓ Added';
            addBtn.disabled = true;
            setTimeout(() => { addBtn.textContent = '+ Add to Editor'; addBtn.disabled = false; }, 2000);
        };
        const copyBtn = document.createElement('button');
        copyBtn.className = 'btn-sm eai-copy-btn';
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
                p.className = 'eai-msg-text';
                p.textContent = part.content;
                row.appendChild(p);
            } else if (part.type === 'indicator') {
                row.appendChild(buildIndicatorBlock(part.content));
            } else {
                const pre = document.createElement('pre');
                pre.className = 'eai-code-pre eai-code-pre--plain';
                pre.textContent = part.content;
                row.appendChild(pre);
            }
        });
    }
    function buildMessage(role, content) {
        const row = document.createElement('div');
        row.className = `eai-msg eai-msg--${role}`;
        if (role === 'user') {
            const p = document.createElement('div');
            p.className = 'eai-msg-text';
            p.textContent = content;
            row.appendChild(p);
        } else {
            appendAssistantContent(row, content);
        }
        return row;
    }
    function renderMessages() {
        msgsEl.innerHTML = '';
        _chatMessages.forEach(msg => msgsEl.appendChild(buildMessage(msg.role, msg.content)));
        const ll = document.createElement('div');
        ll.className = 'eai-loader-layer';
        msgsEl.appendChild(ll);
        return ll;
    }
    let loaderLayer = renderMessages();
    const spinner = attachSpinner(loaderLayer, { size: 40, color: "var(--accent)" });
    spinner.hide();
    instrTa.value = localStorage.getItem(CUSTOM_KEY) || '';
    initAiChatModels().then(data => {
        modelSelect.innerHTML = '';
        if (data.models?.length) {
            data.models.forEach(m => {
                const o = document.createElement('option');
                o.value = m;
                o.textContent = m;
                modelSelect.appendChild(o);
            });
        } else {
            modelSelect.innerHTML = `<option disabled selected>No free models available</option>`;
        }
    }).catch(() => {
        modelSelect.innerHTML = `<option disabled selected>Failed to load models</option>`;
    });
    instrToggle.onclick = () => instrArea.classList.toggle('hidden');
    instrTa.oninput = () => localStorage.setItem(CUSTOM_KEY, instrTa.value);
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
        const text = inputTa.value.trim();
        if (!text || sending || !modelSelect.value) return;
        sending = true;
        sendBtn.disabled = true;
        sendBtn.textContent = '…';
        inputTa.value = '';
        resizeInput();
        _chatMessages.push({ role: 'user', content: text });
        msgsEl.insertBefore(buildMessage('user', text), loaderLayer);
        spinner.show();
        msgsEl.scrollTop = msgsEl.scrollHeight;
        const assistantRow = document.createElement('div');
        assistantRow.className = 'eai-msg eai-msg--assistant';
        const reasoningBlock  = document.createElement('div');
        reasoningBlock.className = 'eai-reasoning eai-reasoning--streaming hidden';
        const reasoningToggle = document.createElement('button');
        reasoningToggle.className = 'eai-reasoning-toggle';
        reasoningToggle.type      = 'button';
        reasoningToggle.textContent = 'Thinking…';
        const reasoningBody = document.createElement('div');
        reasoningBody.className = 'eai-reasoning-body';
        reasoningBlock.append(reasoningToggle, reasoningBody);
        const streamText = document.createElement('div');
        streamText.className = 'eai-msg-text eai-stream-text';
        assistantRow.append(reasoningBlock, streamText);
        msgsEl.insertBefore(assistantRow, loaderLayer);
        let reasoningContent = '';
        let mainContent      = '';
        let success          = false;
        try {
            const res = await fetch(window.ARI.api, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'chat',
                    model: modelSelect.value,
                    messages: _chatMessages,
                    instructionTypes: ['indicators'],
                    customInstructions: instrTa.value.trim(),
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
                        if (reasoningBlock.classList.contains('hidden')) {
                            reasoningBlock.classList.remove('hidden');
                        }
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
            assistantRow.remove();
            _chatMessages.pop();
            const err = document.createElement('div');
            err.className = 'eai-error';
            err.textContent = 'Error: ' + e.message;
            msgsEl.insertBefore(err, loaderLayer);
        }
        if (success) {
            if (reasoningContent) {
                reasoningBlock.classList.remove('eai-reasoning--streaming');
                reasoningToggle.textContent = '▼ Reasoning';
                reasoningToggle.onclick = () => {
                    const collapsed = reasoningBody.classList.toggle('hidden');
                    reasoningToggle.textContent = collapsed ? '▶ Reasoning' : '▼ Reasoning';
                };
            }
            streamText.remove();
            const trimmed = mainContent.trim();
            if (trimmed) appendAssistantContent(assistantRow, trimmed);
            _chatMessages.push({ role: 'assistant', content: trimmed });
        }
        spinner.hide();
        sending = false;
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
        msgsEl.scrollTop = msgsEl.scrollHeight;
    }
    sendBtn.onclick = send;
    inputTa.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    function close() {
        overlay.remove();
        _activeOverlay = null;
        spinner.destroy?.();
    }
    closeBtn.onclick = close;
    overlay.onclick = e => { if (e.target === overlay) close(); };
    overlay.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    inputTa.focus();
    resizeInput();
}