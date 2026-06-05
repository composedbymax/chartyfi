import { storage } from './storage.js';
import { attachSpinner } from './spinner.js';
import { settingsIcon } from './svg.js';
const CC_STEP_KEY = 'cc_bar_step';
const CC_AI_KEY = 'cc_ai_enabled';
const DEFAULT_STEP = 200;
let _aiModelCache = null;
function getStep() {
  const n = parseInt(localStorage.getItem(CC_STEP_KEY), 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_STEP;
}
function saveStep(n) {
  localStorage.setItem(CC_STEP_KEY, String(n));
}
function getAI() {
  return localStorage.getItem(CC_AI_KEY) === '1';
}
function saveAI(v) {
  localStorage.setItem(CC_AI_KEY, v ? '1' : '0');
}
function scoreClass(score) {
  if (score >= 25)  return 'cc-score-bull';
  if (score <= -25) return 'cc-score-bear';
  return 'cc-score-neutral';
}
function fmtScore(score) {
  return typeof score === 'number' ? score.toFixed(2) : '--';
}
async function getAIModel() {
  if (_aiModelCache) return _aiModelCache;
  const res = await fetch(window.ARI.api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'list' })
  });
  const data = await res.json();
  _aiModelCache = data.models?.[0] || null;
  return _aiModelCache;
}
export class CycleConsensus {
  static config = { title: 'Cycle Consensus', description: 'Cycle.Tools consensus scoring across multiple bar windows', width: '45vw', mobileWidth: '92vw' };
  constructor(chart, api) {
    this.chart = chart;
    this.api = api;
    this._onDataChanged = () => this._load();
    this.chart._chartOn('dataChanged', this._onDataChanged);
    this._destroyed = false;
    this._settingsOpen = false;
    this.el = document.createElement('div');
    this.el.className = 'cc-wrap';
    const header = document.createElement('div');
    header.className = 'cc-header';
    this._settingsBtn = document.createElement('button');
    this._settingsBtn.className = 'cc-settings-btn';
    this._settingsBtn.title = 'Settings';
    this._settingsBtn.appendChild(settingsIcon({ className: 'icon' }));
    this._settingsBtn.addEventListener('click', () => this._toggleSettings());
    header.appendChild(this._settingsBtn);
    this.el.appendChild(header);
    this._settingsPanel = document.createElement('div');
    this._settingsPanel.className = 'cc-settings';
    this._settingsPanel.hidden = true;
    const offsetRow = document.createElement('div');
    offsetRow.className = 'cc-settings-row';
    offsetRow.innerHTML = `
      <label class="cc-settings-label" for="cc-bar-offset">Bar Offset</label>
      <div class="cc-settings-control">
        <input class="cc-settings-input" id="cc-bar-offset" name="barOffset" type="number" min="10" step="10" value="${getStep()}">
        <button class="cc-settings-apply">Apply</button>
      </div>
    `;
    this._stepInput = offsetRow.querySelector('.cc-settings-input');
    offsetRow.querySelector('.cc-settings-apply').addEventListener('click', () => this._applySettings());
    this._stepInput.addEventListener('keydown', e => { if (e.key === 'Enter') this._applySettings(); });
    const aiRow = document.createElement('div');
    aiRow.className = 'cc-settings-row';
    aiRow.innerHTML = `
      <label class="cc-settings-label" for="cc-ai-toggle">AI Analysis</label>
      <label class="cc-toggle">
        <input type="checkbox" id="cc-ai-toggle"${getAI() ? ' checked' : ''}>
        <span class="cc-toggle-track"></span>
      </label>
    `;
    this._aiToggle = aiRow.querySelector('#cc-ai-toggle');
    this._aiToggle.addEventListener('change', () => {
      saveAI(this._aiToggle.checked);
      this._load();
    });
    this._settingsPanel.appendChild(offsetRow);
    this._settingsPanel.appendChild(aiRow);
    this.el.appendChild(this._settingsPanel);
    this.content = document.createElement('div');
    this.el.appendChild(this.content);
    const loaderLayer = document.createElement('div');
    loaderLayer.className = 'cc-loader-layer';
    this.el.appendChild(loaderLayer);
    this.spinner = attachSpinner(loaderLayer, { size: 40, color: 'var(--accent)' });
    this.spinner.hide();
    this._load();
  }
  _toggleSettings() {
    this._settingsOpen = !this._settingsOpen;
    this._settingsPanel.hidden = !this._settingsOpen;
    this._settingsBtn.classList.toggle('active', this._settingsOpen);
    if (this._settingsOpen) {
      this._stepInput.value = getStep();
      this._aiToggle.checked = getAI();
      this._stepInput.focus();
      this._stepInput.select();
    }
  }
  _applySettings() {
    const val = parseInt(this._stepInput.value, 10);
    if (Number.isFinite(val) && val > 0) {
      saveStep(val);
      this._toggleSettings();
      this._load();
    }
  }
  async _load() {
    const sym  = this.chart._currentSymbol;
    const data = this.chart._getCurrentData();
    if (!sym || !data?.length) {
      this.content.innerHTML = `<div class="cc-empty">No chart data loaded</div>`;
      return;
    }
    this.spinner.show();
    this.content.innerHTML = '';
    const apiKey = storage.getApiKey();
    if (!apiKey) {
      this.spinner.hide();
      this.content.innerHTML = `<div class="cc-empty">Set your Cycles API key in settings</div>`;
      return;
    }
    const step     = getStep();
    const baseBars = data.length;
    const counts   = [Math.max(50, baseBars - step), baseBars, baseBars + step];
    const symbol   = `${sym}:YFI`;
    try {
      const results = await Promise.all(counts.map(n => this._fetchConsensus(symbol, n)));
      if (this._destroyed) return;
      if (getAI()) {
        await this._loadAI(results, counts, sym);
      } else {
        this.spinner.hide();
        const valid = results.filter(r => typeof r?.combinedScore === 'number');
        const avg   = valid.length ? valid.reduce((s, r) => s + r.combinedScore, 0) / valid.length : 0;
        this.content.innerHTML = `
          <div class="cc-summary">
            <div class="cc-summary-label">Average Consensus</div>
            <div class="cc-summary-score ${scoreClass(avg)}">${fmtScore(avg)}</div>
          </div>
          <div class="cc-grid">
            ${results.map((r, i) => this._card(r, counts[i])).join('')}
          </div>
        `;
      }
    } catch (e) {
      this.spinner.hide();
      const msg = e.unauthorized ? 'Set your Cycles API key in settings' : 'Failed to load consensus data';
      this.content.innerHTML = `<div class="cc-empty">${msg}</div>`;
    }
  }
  async _loadAI(results, counts, sym) {
    this._aiAbort?.abort();
    this._aiAbort = new AbortController();
    const { signal } = this._aiAbort;
    if (!window.ARI?.api) {
      this.spinner.hide();
      this.content.innerHTML = `<div class="cc-empty">AI not configured</div>`;
      return;
    }
    try {
      const model = await getAIModel();
      if (signal.aborted || this._destroyed) return;
      if (!model) throw new Error('No AI model');
      const res = await fetch(window.ARI.api, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          instructionTypes: ['ratings'],
          messages: [{ role: 'user', content: `Symbol: ${sym}\n\n${this._buildScoresText(results, counts)}` }]
        }),
        signal
      });
      const text = await this._readSSE(res);
      if (signal.aborted || this._destroyed) return;
      const ai = JSON.parse(text.trim());
      this.spinner.hide();
      this.content.innerHTML = this._aiCard(ai);
      const fill = this.content.querySelector('.cc-ai-conf-fill');
      if (fill) fill.style.width = (typeof ai?.confidence === 'number' ? Math.min(100, Math.max(0, ai.confidence)) : 0) + '%';
    } catch (e) {
      if (e.name === 'AbortError' || this._destroyed) return;
      this.spinner.hide();
      this.content.innerHTML = `<div class="cc-empty">AI analysis failed</div>`;
    }
  }
  async _readSSE(res) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    let buf = '';
    try {
      outer: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const d = line.slice(6).trim();
          if (d === '[DONE]') break outer;
          try {
            const parsed = JSON.parse(d);
            const chunk = parsed.choices?.[0]?.delta?.content;
            if (chunk) text += chunk;
          } catch {}
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
    return text;
  }
  _buildScoresText(results, counts) {
    return results.map((r, i) => {
      if (r?.error) return `${counts[i]} Bars: error`;
      return [
        `${counts[i].toLocaleString()} Bars`,
        `Combined Score: ${fmtScore(r?.combinedScore)}`,
        `Bullish: ${fmtScore(r?.bullishConsensus)} | Bearish: ${fmtScore(r?.bearishConsensus)}`,
        `CRSI: ${r?.crsiScore ?? '--'} (${r?.crsiSignal ?? '--'}) p${r?.crsiLength ?? '--'} from ${r?.crsiSourceCycleLength ?? '--'}-bar`,
        `Signal: ${r?.signal || r?.crsiSignal || 'Unknown'}`,
        `Bull Cycles: ${r?.bullishCycles?.join(', ') || 'None'}`,
        `Bear Cycles: ${r?.bearishCycles?.join(', ') || 'None'}`,
      ].join('\n');
    }).join('\n\n');
  }
  _aiCard(ai) {
    const signal = (ai?.signal || 'WAIT').toUpperCase();
    const reason = ai?.reason || '';
    const confidence = typeof ai?.confidence === 'number' ? Math.min(100, Math.max(0, ai.confidence)) : null;
    const showConf = signal !== 'WAIT' && confidence !== null;
    return `
      <div class="cc-ai-card">
        <div class="cc-ai-signal cc-ai-${signal.toLowerCase()}">${signal}</div>
        <div class="cc-ai-reason">${reason}</div>
        ${showConf ? `<div class="cc-ai-confidence"><span class="cc-ai-conf-label">Confidence</span><span class="cc-ai-conf-val">${confidence}%</span><div class="cc-ai-conf-bar"><div class="cc-ai-conf-fill"></div></div></div>` : ''}
      </div>
    `;
  }
  async _fetchConsensus(symbol, barCount) {
    const apiKey   = storage.getApiKey();
    const endpoint = `/api/CycleConsensus/score/${symbol}?barCount=${barCount}&api_key=${encodeURIComponent(apiKey || '')}`;
    const url      = `${window.CYL.api}?endpoint=${encodeURIComponent(endpoint)}`;
    const res      = await fetch(url);
    if (res.status === 401) {const err=new Error('Unauthorized'); err.unauthorized=true; throw err;}
    return await res.json();
  }
  _card(data, barCount) {
    if (data?.error) {
      return `<div class="cc-card"><div class="cc-card-error">${data.error}</div></div>`;
    }
    const score = data?.combinedScore || 0;
    const crsiParts = [
      `${data?.crsiScore ?? '--'}`,
      data?.crsiSignal              ? `(${data.crsiSignal})`              : '',
      data?.crsiLength              ? `· p${data.crsiLength}`             : '',
      data?.crsiSourceCycleLength   ? `from ${data.crsiSourceCycleLength}-bar` : '',
    ].filter(Boolean).join(' ');
    return `
      <div class="cc-card">
        <div class="cc-card-top">
          <div class="cc-bars">${barCount.toLocaleString()} Bars</div>
          <div class="cc-score ${scoreClass(score)}">${fmtScore(score)}</div>
        </div>
        <div class="cc-signal-grid">
          <div class="cc-signal-row">
            <span class="cc-signal-label">Bias</span>
            <span class="cc-signal-value">Bullish ${fmtScore(data?.bullishConsensus || 0)} | Bearish ${fmtScore(data?.bearishConsensus || 0)}</span>
          </div>
          <div class="cc-signal-row">
            <span class="cc-signal-label">CRSI</span>
            <span class="cc-signal-value">${crsiParts}</span>
          </div>
          <div class="cc-signal-row">
            <span class="cc-signal-label">Signal</span>
            <span class="cc-signal-value">${data?.signal || data?.crsiSignal || 'Unknown'}</span>
          </div>
          <div class="cc-signal-row">
            <span class="cc-signal-label">Bull Cycles</span>
            <span class="cc-signal-value">${data?.bullishCycles?.length ? data.bullishCycles.join(', ') : 'None'}</span>
          </div>
          <div class="cc-signal-row">
            <span class="cc-signal-label">Bear Cycles</span>
            <span class="cc-signal-value">${data?.bearishCycles?.length ? data.bearishCycles.join(', ') : 'None'}</span>
          </div>
        </div>
      </div>
    `;
  }
  destroy() {
    this._destroyed = true;
    this._aiAbort?.abort();
    this.spinner.destroy();
  }
}