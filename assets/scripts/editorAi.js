import { attachSpinner } from "./spinner.js";
const CUSTOM_KEY = 'eai-custom-instructions';
let _activeOverlay = null;
let _modelsPromise = null;
let _chatMessages = [];
export function initAiChatModels() {
    if (!_modelsPromise) {_modelsPromise = fetch(window.ARI.api + '?action=init').then(r => r.json()).catch(() => ({ models: [] }));}
    return _modelsPromise;
}
export function openAiChat({ getCode, onInsert }) {
    if (_activeOverlay) {_activeOverlay.querySelector('.eai-input-ta')?.focus(); return;}
    let sending = false;
    const overlay = document.createElement('div');
    overlay.className = 'eai-overlay';
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
    const closeBtn = overlay.querySelector('.eai-close');
    const modelSelect = overlay.querySelector('.eai-model-select');
    const newChatBtn = overlay.querySelector('.eai-new-chat');
    const instrToggle = overlay.querySelector('.eai-instr-toggle');
    const instrArea = overlay.querySelector('.eai-instr-area');
    const instrTa = overlay.querySelector('.eai-instr-ta');
    const msgsEl = overlay.querySelector('.eai-messages');
    const inputTa = overlay.querySelector('.eai-input-ta');
    const sendBtn = overlay.querySelector('.eai-send-btn');
    const INPUT_MIN_HEIGHT = 30;
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
    function buildMessage(role, content) {
        const row = document.createElement('div');
        row.className = `eai-msg eai-msg--${role}`;
        if (role === 'user') {
            const p = document.createElement('div');
            p.className = 'eai-msg-text';
            p.textContent = content;
            row.appendChild(p);
        } else {
            const parts = parseContent(content);
            parts.forEach(part => {
                if (part.type === 'text') {
                    const p = document.createElement('div');
                    p.className = 'eai-msg-text';
                    p.textContent = part.content;
                    row.appendChild(p);
                } else if (part.type === 'indicator') {
                    const block = document.createElement('div');
                    block.className = 'eai-code-block';
                    const pre = document.createElement('pre');
                    pre.className = 'eai-code-pre';
                    pre.textContent = part.content;
                    const actions = document.createElement('div');
                    actions.className = 'eai-code-actions';
                    const addBtn = document.createElement('button');
                    addBtn.className = 'btn-primary eai-add-btn';
                    addBtn.textContent = '+ Add to Editor';
                    addBtn.onclick = () => {
                        onInsert(part.content);
                        addBtn.textContent = '✓ Added';
                        addBtn.disabled = true;
                        setTimeout(() => {
                            addBtn.textContent = '+ Add to Editor';
                            addBtn.disabled = false;
                        }, 2000);
                    };
                    const copyBtn = document.createElement('button');
                    copyBtn.className = 'btn-sm eai-copy-btn';
                    copyBtn.textContent = 'Copy';
                    copyBtn.onclick = () => {
                        navigator.clipboard.writeText(part.content)
                            .then(() => {
                                copyBtn.textContent = '✓';
                                setTimeout(() => copyBtn.textContent = 'Copy', 1500);
                            });
                    };
                    actions.append(addBtn, copyBtn);
                    block.append(pre, actions);
                    row.appendChild(block);
                } else {
                    const pre = document.createElement('pre');
                    pre.className = 'eai-code-pre eai-code-pre--plain';
                    pre.textContent = part.content;
                    row.appendChild(pre);
                }
            });
        }
        return row;
    }
    function renderMessages() {
        msgsEl.innerHTML = '';
        _chatMessages.forEach(msg => msgsEl.appendChild(buildMessage(msg.role, msg.content)));
        const loaderLayer = document.createElement('div');
        loaderLayer.className = 'eai-loader-layer';
        msgsEl.appendChild(loaderLayer);
        return loaderLayer;
    }
    let loaderLayer = renderMessages();
    const spinner = attachSpinner(loaderLayer, {
        size: 40,
        color: "var(--accent)"
    });
    spinner.hide();
    instrTa.value = localStorage.getItem(CUSTOM_KEY) || '';
    initAiChatModels().then(data => {
        modelSelect.innerHTML = '';
        if (data.models?.length) {
            data.models.forEach(m => {
                const o = document.createElement('option');
                o.value = m.provider_id;
                o.textContent = m.llm_name;
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
        const freshSpinner = attachSpinner(loaderLayer, {
            size: 40,
            color: "var(--accent)"
        });
        freshSpinner.hide();
        spinner.hide = freshSpinner.hide.bind(freshSpinner);
        spinner.show = freshSpinner.show.bind(freshSpinner);
        spinner.destroy = freshSpinner.destroy?.bind(freshSpinner);
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
        try {
            const res = await fetch(window.ARI.api, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'chat',
                    model: modelSelect.value,
                    messages: _chatMessages,
                    customInstructions: instrTa.value.trim(),
                    currentCode: getCode()
                })
            });
            const data = await res.json();
            if (data.error) {
                const err = document.createElement('div');
                err.className = 'eai-error';
                err.textContent = data.error;
                msgsEl.insertBefore(err, loaderLayer);
                _chatMessages.pop();
            } else {
                _chatMessages.push({ role: 'assistant', content: data.reply });
                msgsEl.insertBefore(buildMessage('assistant', data.reply), loaderLayer);
            }
        } catch (e) {
            const err = document.createElement('div');
            err.className = 'eai-error';
            err.textContent = 'Network error: ' + e.message;
            msgsEl.insertBefore(err, loaderLayer);
            _chatMessages.pop();
        }
        spinner.hide();
        sending = false;
        sendBtn.disabled = false;
        sendBtn.textContent = 'Send';
        msgsEl.scrollTop = msgsEl.scrollHeight;
    }
    sendBtn.onclick = send;
    inputTa.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    });
    function close() {
        overlay.remove();
        _activeOverlay = null;
        spinner.destroy?.();
    }
    closeBtn.onclick = close;
    overlay.onclick = e => { if (e.target === overlay) close(); };
    inputTa.focus();
    resizeInput();
}