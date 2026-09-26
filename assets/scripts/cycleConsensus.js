import { storage } from './storage.js';
import { attachSpinner } from './spinner.js';
import { settingsIcon } from './svg.js';
const MIN_REQUEST_INTERVAL_MS = 1200;
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function scoreClass(score) {
  if (score >= 25)  return 'text-pos';
  if (score <= -25) return 'text-neg';
  return 'text-warn';
}
function fmtScore(score) {
  return typeof score === 'number' ? score.toFixed(2) : '--';
}
function extractDatapoints(data) {
  const isOHLC = data[0] != null && typeof data[0] === 'object' && 'close' in data[0];
  return data.map(d => isOHLC ? d.close : d);
}
function phaseLengths(cycles) {
  if (!Array.isArray(cycles) || !cycles.length) return 'None';
  return cycles.map(c => c.cycleLength).join(', ');
}
export class CycleConsensus {
  static config = { title: 'Cycle Consensus', description: 'Cycle.Tools consensus scoring across multiple bar windows', width: '45vw', mobileWidth: '92vw' };
  constructor(chart, api) {
    this.chart = chart;
    this.api = api;
    this._onDataChanged = () => {
      if (this._destroyed) return;
      clearTimeout(this._loadDebounce);
      this._loadDebounce = setTimeout(() => this._load(), 150);
    };
    this.chart._chartOn('dataChanged', this._onDataChanged);
    this._destroyed = false;
    this._settingsOpen = false;
    this.el = document.createElement('div');
    this.el.className = 'flex flex-column gap-12 cc-wrap';
    const header = document.createElement('div');
    header.className = 'flex justify-end p-10-12 mt--8';
    this._settingsBtn = document.createElement('button');
    this._settingsBtn.className = 'flex-center-justify p-8 text-secondary rounded cc-settings-btn';
    this._settingsBtn.title = 'Settings';
    this._settingsBtn.appendChild(settingsIcon({ className: 'icon' }));
    this._settingsBtn.addEventListener('click', () => this._toggleSettings());
    header.appendChild(this._settingsBtn);
    this.el.appendChild(header);
    this._settingsPanel = document.createElement('div');
    this._settingsPanel.className = 'p-10-12 border-b';
    this._settingsPanel.hidden = true;
    const offsetRow = document.createElement('div');
    offsetRow.className = 'flex-center-space gap-12 cc-settings-row';
    offsetRow.innerHTML = `
      <label class="text-13 fw-600 text-secondary" for="cc-bar-offset">Bar Offset</label>
      <div class="flex-center gap-8">
        <input class="w-72 outline-0 text-right text-13 p-4-6 border-soft rounded bg text-primary" id="cc-bar-offset" name="barOffset" type="number" min="10" step="10" value="${storage.getBarsCount()}">
        <button class="p-6-12 rounded accent text-primary text-13 fw-600 cursor-pointer cc-settings-apply">Apply</button>
      </div>
    `;
    this._stepInput = offsetRow.querySelector('input');
    offsetRow.querySelector('.cc-settings-apply').addEventListener('click', () => this._applySettings());
    this._stepInput.addEventListener('keydown', e => { if (e.key === 'Enter') this._applySettings(); });
    const aiRow = document.createElement('div');
    aiRow.className = 'flex-center-space gap-12 cc-settings-row';
    aiRow.innerHTML = `
      <label class="text-13 fw-600 text-secondary" for="cc-ai-toggle">AI Analysis</label>
      <label class="cc-toggle">
        <input type="checkbox" id="cc-ai-toggle"${storage.getAiEnabled() ? ' checked' : ''}>
        <span class="cc-toggle-track"></span>
      </label>
    `;
    this._aiToggle = aiRow.querySelector('#cc-ai-toggle');
    this._aiToggle.addEventListener('change', () => { storage.setAiEnabled(this._aiToggle.checked); this._load(); });
    this._settingsPanel.appendChild(offsetRow);
    this._settingsPanel.appendChild(aiRow);
    this.el.appendChild(this._settingsPanel);
    this.content = document.createElement('div');
    this.el.appendChild(this.content);
    const loaderLayer = document.createElement('div');
    loaderLayer.className = 'absolute left-50 top-50 transxy-center z-2 cc-loader-layer';
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
      this._stepInput.value = storage.getBarsCount();
      this._aiToggle.checked = storage.getAiEnabled();
      this._stepInput.focus();
      this._stepInput.select();
    }
  }
  _applySettings() {
    const val = parseInt(this._stepInput.value, 10);
    if (Number.isFinite(val) && val > 0) {
      storage.setBarsCount(val);
      this._toggleSettings();
      this._load();
    }
  }
  async _load() {
    if (this._destroyed) return;
    const sym  = this.chart._currentSymbol;
    const data = this.chart._getCurrentData();
    if (!sym || !data?.length) {
      this.content.innerHTML = `<div class="p-18 text-center text-secondary">No chart data loaded</div>`;
      return;
    }
    this.spinner.show();
    this.content.innerHTML = '';
    const apiKey = storage.getApiKey();
    if (!apiKey) {
      this.spinner.hide();
      this.content.innerHTML = `<div class="p-18 text-center text-secondary">Set your Cycles API key in settings</div>`;
      return;
    }
    const allPoints = extractDatapoints(data);
    const step      = storage.getBarsCount();
    const baseBars  = allPoints.length;
    const counts    = [Math.max(100, baseBars - step), baseBars, baseBars + step];
    this._loadAbort?.abort();
    this._loadAbort = new AbortController();
    const loadSignal = this._loadAbort.signal;
    try {
      const results = [];
      let lastStart = 0;
      let lastCached = true;
      for (const n of counts) {
        if (!lastCached) {
          const wait = lastStart + MIN_REQUEST_INTERVAL_MS - Date.now();
          if (wait > 0) await sleep(wait);
        }
        if (this._destroyed || loadSignal.aborted) return;
        lastStart = Date.now();
        const { data: r, cached } = await this._fetchConsensus(apiKey, allPoints, n, loadSignal);
        lastCached = cached;
        results.push(r);
        if (this._destroyed || loadSignal.aborted) return;
      }
      if (storage.getAiEnabled()) {
        await this._loadAI(results, counts, sym);
      } else {
        this.spinner.hide();
        const valid = results.filter(r => typeof r?.combinedScore === 'number');
        const avg   = valid.length ? valid.reduce((s, r) => s + r.combinedScore, 0) / valid.length : 0;
        this.content.innerHTML = `
          <div class="flex-center-space p-14-16 bg-2">
            <div class="text-13 text-secondary">Average Consensus</div>
            <div class="text-22 fw-700 ${scoreClass(avg)}">${fmtScore(avg)}</div>
          </div>
          <div class="flex flex-column">
            ${results.map((r, i) => this._card(r, counts[i])).join('')}
          </div>
        `;
      }
    } catch (e) {
      if (e.name === 'AbortError' || this._destroyed) return;
      this.spinner.hide();
      let msg = 'Failed to load consensus data';
      if (e.unauthorized) msg = 'Set your Cycles API key in settings';
      else if (e.rateLimited) msg = 'Too many requests';
      this.content.innerHTML = `<div class="p-18 text-center text-secondary">${msg}</div>`;
    }
  }
  async _loadAI(results, counts, sym) {
    this._aiAbort?.abort();
    this._aiAbort = new AbortController();
    const { signal } = this._aiAbort;
    if (!window.ARI?.api) {
      this.spinner.hide();
      this.content.innerHTML = `<div class="p-18 text-center text-secondary">AI not configured</div>`;
      return;
    }
    try {
      const model = storage.getPreferredModel();
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
      this.content.innerHTML = `<div class="p-18 text-center text-secondary">AI analysis failed</div>`;
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
        `Rising: ${phaseLengths(r?.risingCycles)} | Bottoming: ${phaseLengths(r?.bottomingCycles)}`,
        `Falling: ${phaseLengths(r?.fallingCycles)} | Topping: ${phaseLengths(r?.toppingCycles)}`,
      ].join('\n');
    }).join('\n\n');
  }
  _aiCard(ai) {
    const signal = (ai?.signal || 'WAIT').toUpperCase();
    const reason = ai?.reason || '';
    const confidence = typeof ai?.confidence === 'number' ? Math.min(100, Math.max(0, ai.confidence)) : null;
    const showConf = signal !== 'WAIT' && confidence !== null;
    const signalClass = signal === 'BUY' ? 'text-pos' : signal === 'SELL' ? 'text-neg' : 'text-warn';
    return `
      <div class="flex flex-column items-center gap-12 p-28-16 text-center">
        <div class="text-38 fw-800 tracking-widest ${signalClass}">${signal}</div>
        <div class="text-14 text-secondary lh-16">${reason}</div>
        ${showConf ? `<div class="w-full flex flex-column items-center gap-5 pt-12 border-t"><span class="text-secondary fw-600 uppercase text-11 tracking-wide">Confidence</span><span class="text-22 fw-700 text-primary">${confidence}%</span><div class="w-full h-4 border-soft squared overflow-hidden"><div class="cc-ai-conf-fill h-full accent squared"></div></div></div>` : ''}
      </div>
    `;
  }
  async _fetchConsensus(apiKey, allPoints, barCount, signal) {
    let datapoints = allPoints.slice(-barCount);
    const deficit = barCount - allPoints.length;
    if (deficit > 0) {
      try {
        const extraRes = await this.chart.api._chartData(
          this.chart._currentSymbol,
          this.chart._currentInterval,
          { bars: deficit, direction: 'before', anchor: this.chart._getRawData()[0]?.time }
        );
        const extra = extraRes?.candles ?? [];
        if (extra.length) datapoints = [...extractDatapoints(extra), ...allPoints];
      } catch (_) {}
    }
    if (datapoints.length < 100) {
      return { data: { error: 'Insufficient data points (min 100)' }, cached: true };
    }
    const res = await fetch(window.CIC.api, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'consensus',
        api_key: apiKey,
        params: {},
        payload: datapoints,
      }),
      signal,
    });
    if (res.status === 401) { const err = new Error('Unauthorized'); err.unauthorized = true; throw err; }
    if (res.status === 429) { const err = new Error('Rate limited'); err.rateLimited = true; throw err; }
    return { data: await res.json(), cached: res.headers.get('X-Cache') === 'HIT' };
  }
  _card(data, barCount) {
    if (data?.error) {
      return `<div class="flex flex-column gap-10 p-12 border-soft"><div class="text-neg text-13">${data.error}</div></div>`;
    }
    const score = data?.combinedScore || 0;
    const crsiParts = [
      `${data?.crsiScore ?? '--'}`,
      data?.crsiSignal            ? `(${data.crsiSignal})`              : '',
      data?.crsiLength            ? `· p${data.crsiLength}`             : '',
      data?.crsiSourceCycleLength ? `from ${data.crsiSourceCycleLength}-bar` : '',
    ].filter(Boolean).join(' ');
    return `
      <div class="flex flex-column gap-10 p-12 border-soft">
        <div class="flex-center-space gap-12">
          <div class="text-13 fw-600 text-secondary">${barCount.toLocaleString()} Bars</div>
          <div class="text-22 fw-700 ${scoreClass(score)}">${fmtScore(score)}</div>
        </div>
        <div class="flex flex-column gap-8 p-8-0 border-t">
          <div class="flex justify-between items-baseline gap-12 text-13">
            <span class="flex-shrink-0 text-secondary fw-600 uppercase text-11 tracking-wide">Bias</span>
            <span class="text-primary fw-500 text-right break-word">Bullish ${fmtScore(data?.bullishConsensus || 0)} | Bearish ${fmtScore(data?.bearishConsensus || 0)}</span>
          </div>
          <div class="flex justify-between items-baseline gap-12 text-13">
            <span class="flex-shrink-0 text-secondary fw-600 uppercase text-11 tracking-wide">CRSI</span>
            <span class="text-primary fw-500 text-right break-word">${crsiParts}</span>
          </div>
          <div class="flex justify-between items-baseline gap-12 text-13">
            <span class="flex-shrink-0 text-secondary fw-600 uppercase text-11 tracking-wide">Rising</span>
            <span class="text-primary fw-500 text-right break-word">${phaseLengths(data?.risingCycles)}</span>
          </div>
          <div class="flex justify-between items-baseline gap-12 text-13">
            <span class="flex-shrink-0 text-secondary fw-600 uppercase text-11 tracking-wide">Bottoming</span>
            <span class="text-primary fw-500 text-right break-word">${phaseLengths(data?.bottomingCycles)}</span>
          </div>
          <div class="flex justify-between items-baseline gap-12 text-13">
            <span class="flex-shrink-0 text-secondary fw-600 uppercase text-11 tracking-wide">Falling</span>
            <span class="text-primary fw-500 text-right break-word">${phaseLengths(data?.fallingCycles)}</span>
          </div>
          <div class="flex justify-between items-baseline gap-12 text-13">
            <span class="flex-shrink-0 text-secondary fw-600 uppercase text-11 tracking-wide">Topping</span>
            <span class="text-primary fw-500 text-right break-word">${phaseLengths(data?.toppingCycles)}</span>
          </div>
        </div>
      </div>
    `;
  }
  destroy() {
    this._destroyed = true;
    clearTimeout(this._loadDebounce);
    this._loadAbort?.abort();
    this._aiAbort?.abort();
    this.spinner.destroy();
  }
}