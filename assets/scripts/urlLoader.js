import {toast} from './message.js';
import {INTERVALS,INTERVALS_S} from './chart.js';
const ENDPOINTS = {
  coingecko: {
    label: 'CoinGecko',
    needsKey: false,
    search: async (q, _key, proxy) => {
      const list = await proxy('https://api.coingecko.com/api/v3/coins/list');
      const ql = q.toLowerCase();
      return list
        .filter(c => c.id.includes(ql) || c.symbol.includes(ql) || c.name.toLowerCase().includes(ql))
        .slice(0, 12)
        .map(c => ({id: c.id, label: `${c.name} (${c.symbol.toUpperCase()})`, symbol: c.id}));
    },
    load: async (id, interval, days, _key, proxy) => {
      const d = Math.ceil(days);
      const raw = await proxy(
        `https://api.coingecko.com/api/v3/coins/${encodeURIComponent(id)}/market_chart?vs_currency=usd&days=${d}`
      );
      if (raw.error || !raw.prices) throw new Error(raw.error || 'No price data');
      const intSec = INTERVALS_S[interval] || 86400;
      const buckets = new Map();
      for (const [ms, price] of raw.prices) {
        const t = Math.floor(ms / 1000);
        const bucket = Math.floor(t / intSec) * intSec;
        if (!buckets.has(bucket)) buckets.set(bucket, {open: price, high: price, low: price, close: price, volume: 0, t: bucket});
        const b = buckets.get(bucket);
        b.high = Math.max(b.high, price);
        b.low  = Math.min(b.low,  price);
        b.close = price;
      }
      for (const [ms, vol] of (raw.total_volumes || [])) {
        const bucket = Math.floor(Math.floor(ms/1000) / intSec) * intSec;
        if (buckets.has(bucket)) buckets.get(bucket).volume += vol;
      }
      return [...buckets.values()].sort((a,b)=>a.t-b.t).map(b=>({
        time: b.t, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume
      }));
    }
  },
  coinbase: {
    label: 'Coinbase Exchange',
    needsKey: false,
    search: async (q, _key, proxy) => {
      const list = await proxy('https://api.exchange.coinbase.com/products');
      const ql = q.toLowerCase();
      return list
        .filter(p => p.id.toLowerCase().includes(ql) || (p.display_name||'').toLowerCase().includes(ql))
        .slice(0, 12)
        .map(p => ({id: p.id, label: `${p.display_name||p.id}`, symbol: p.id}));
    },
    load: async (id, interval, days, _key, proxy) => {
      const granMap = {'1m':60,'2m':120,'5m':300,'15m':900,'30m':1800,'1h':3600,'4h':14400,'1d':86400,'1wk':604800};
      const gran = granMap[interval] || 86400;
      const end = Math.floor(Date.now()/1000);
      const start = end - days * 86400;
      const candles = [];
      let cursor = end;
      while (cursor > start) {
        const segStart = Math.max(start, cursor - gran * 300);
        const url = `https://api.exchange.coinbase.com/products/${encodeURIComponent(id)}/candles?granularity=${gran}&start=${segStart}&end=${cursor}`;
        const chunk = await proxy(url);
        if (!Array.isArray(chunk) || !chunk.length) break;
        candles.push(...chunk);
        cursor = segStart;
        if (candles.length > 5000) break;
      }
      return candles
        .map(c => ({time: c[0], open: c[3], high: c[2], low: c[1], close: c[4], volume: c[5]}))
        .sort((a,b) => a.time - b.time);
    }
  },
  kucoin: {
    label: 'KuCoin',
    needsKey: false,
    search: async (q, _key, proxy) => {
      const res = await proxy('https://api.kucoin.com/api/v1/symbols');
      const ql = q.toLowerCase();
      return (res.data || [])
        .filter(s => s.symbol.toLowerCase().includes(ql) || s.baseCurrency.toLowerCase().includes(ql))
        .slice(0, 12)
        .map(s => ({id: s.symbol, label: s.symbol, symbol: s.symbol}));
    },
    load: async (id, interval, days, _key, proxy) => {
      const typeMap = {'1m':'1min','2m':'2min','5m':'5min','15m':'15min','30m':'30min','1h':'1hour','4h':'4hour','1d':'1day','1wk':'1week'};
      const type = typeMap[interval] || '1day';
      const end = Math.floor(Date.now()/1000);
      const start = end - days * 86400;
      const url = `https://api.kucoin.com/api/v1/market/candles?type=${type}&symbol=${encodeURIComponent(id)}&startAt=${start}&endAt=${end}`;
      const res = await proxy(url);
      if (res.code !== '200000') throw new Error(res.msg || 'KuCoin error');
      return (res.data || [])
        .map(c => ({time: Number(c[0]), open: Number(c[1]), high: Number(c[3]), low: Number(c[4]), close: Number(c[2]), volume: Number(c[5])}))
        .sort((a,b) => a.time - b.time);
    }
  },
  fred: {
    label: 'FRED',
    needsKey: true,
    search: async (q, key, proxy) => {
      const url = `https://api.stlouisfed.org/fred/series/search?search_text=${encodeURIComponent(q)}&api_key=${encodeURIComponent(key)}&file_type=json`;
      const res = await proxy(url);
      if (res.error_message) throw new Error(res.error_message);
      return (res.seriess || []).slice(0, 12).map(s => ({id: s.id, label: `${s.id} – ${s.title}`, symbol: s.id}));
    },
    load: async (id, _interval, _days, key, proxy) => {
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(id)}&api_key=${encodeURIComponent(key)}&file_type=json`;
      const res = await proxy(url);
      if (res.error_message) throw new Error(res.error_message);
      return (res.observations || [])
        .filter(o => o.value !== '.')
        .map(o => {
          const t = Math.floor(new Date(o.date).getTime() / 1000);
          const v = Number(o.value);
          return {time: t, open: v, high: v, low: v, close: v, volume: 0};
        });
    }
  },
  twelvedata: {
    label: 'Twelve Data',
    needsKey: true,
    search: async (q, key, proxy) => {
      const url = `https://api.twelvedata.com/symbol_search?symbol=${encodeURIComponent(q)}&apikey=${encodeURIComponent(key)}`;
      const res = await proxy(url);
      if (res.status === 'error') throw new Error(res.message || 'Twelve Data error');
      return (res.data || []).slice(0, 12).map(s => ({
        id: s.symbol, label: `${s.symbol} – ${s.instrument_name||''} (${s.exchange||''})`, symbol: s.symbol
      }));
    },
    load: async (id, interval, days, key, proxy) => {
      const intMap = {'1m':'1min','2m':'2min','5m':'5min','15m':'15min','30m':'30min','1h':'1h','4h':'4h','1d':'1day','1wk':'1week','1mo':'1month'};
      const int12 = intMap[interval] || '1day';
      const end = new Date();
      const start = new Date(Date.now() - days * 86400 * 1000);
      const fmt = d => d.toISOString().slice(0,10);
      const url = `https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(id)}&interval=${int12}&start_date=${fmt(start)}&end_date=${fmt(end)}&apikey=${encodeURIComponent(key)}&format=JSON`;
      const res = await proxy(url);
      if (res.status === 'error') throw new Error(res.message || 'Twelve Data error');
      return (res.values || [])
        .map(v => ({
          time: Math.floor(new Date(v.datetime).getTime()/1000),
          open: Number(v.open), high: Number(v.high), low: Number(v.low), close: Number(v.close),
          volume: Number(v.volume||0)
        }))
        .sort((a,b) => a.time - b.time);
    }
  },
  custom: {
    label: 'Custom',
    needsKey: false,
    search: null,
    load: null
  }
};
function makeProxy() {
  const base = (window.PXY?.api) || 'api/proxy.php';
  return async (url) => {
    const r = await fetch(`${base}?url=${encodeURIComponent(url)}`);
    if (!r.ok) throw new Error(`Proxy ${r.status}`);
    return r.json();
  };
}
const DAYS_OPTS = [
  {label:'7 days',  val: 7},
  {label:'30 days', val: 30},
  {label:'90 days', val: 90},
  {label:'180 days',val:180},
  {label:'1 year',  val:365},
  {label:'2 years', val:730},
  {label:'5 years', val:1825},
];
export class URLLoader {
  static config = {
    title: 'URL Loader',
    description: 'Search & load data from external APIs onto the chart',
    width: '420px',
    mobileWidth: '90vw'
  };
  constructor(chart, api) {
    this.chart = chart;
    this.api = api;
    this.el = document.createElement('div');
    this.el.className = 'da-wrap ul-wrap';
    this._proxy = makeProxy();
    this._source = 'coingecko';
    this._results = [];
    this._selected = null;
    this._interval = chart._currentInterval || '1d';
    this._days = 365;
    this._apiKey = '';
    this._customSearchUrl = '';
    this._customHistUrl = '';
    this._destroyed = false;
    this._render();
  }
  _render() {
    const src = this._source;
    const ep = ENDPOINTS[src];
    const intervals = INTERVALS;
    this.el.innerHTML = `
      <div class="ul-section">
        <label class="ul-label">Source</label>
        <select class="ul-select" id="ul-source">
          ${Object.entries(ENDPOINTS).map(([k,v])=>
            `<option value="${k}"${k===src?' selected':''}>${v.label}</option>`
          ).join('')}
        </select>
      </div>
      ${ep?.needsKey ? `
      <div class="ul-section">
        <label class="ul-label">API Key</label>
        <input class="ul-input" id="ul-apikey" type="password" placeholder="Enter API key…" value="${this._apiKey}">
      </div>` : ''}
      ${src === 'custom' ? `
      <div class="ul-section">
        <label class="ul-label">Search URL <span class="ul-hint">(use {QUERY})</span></label>
        <input class="ul-input" id="ul-custom-search" placeholder="https://…?q={QUERY}" value="${this._customSearchUrl}">
        <label class="ul-label" style="margin-top:8px">History URL <span class="ul-hint">(use {SYMBOL},{START},{END})</span></label>
        <input class="ul-input" id="ul-custom-hist" placeholder="https://…?symbol={SYMBOL}&start={START}&end={END}" value="${this._customHistUrl}">
        <div class="ul-hint-block">Response must be JSON with a <code>candles</code> array of <code>{time,open,high,low,close,volume}</code>.</div>
      </div>` : ''}
      <div class="ul-section">
        <label class="ul-label">Search</label>
        <div class="ul-search-row">
          <input class="ul-input ul-search-in" id="ul-search-in" placeholder="${src==='custom'?'Symbol / ID':'Search symbol or name…'}" autocomplete="off">
          <button class="ul-btn ul-btn--primary" id="ul-search-btn">Go</button>
        </div>
        <div class="ul-results" id="ul-results"></div>
      </div>
      ${this._selected ? `
      <div class="ul-section ul-selected-section">
        <div class="ul-selected-badge">
          <span class="ul-selected-label">${this._selected.label}</span>
          <button class="ul-clear-btn" id="ul-clear">×</button>
        </div>
      </div>` : ''}
      <div class="ul-section ul-row">
        <div class="ul-col">
          <label class="ul-label">Interval</label>
          <select class="ul-select" id="ul-interval">
            ${intervals.map(i=>`<option value="${i}"${i===this._interval?' selected':''}>${i}</option>`).join('')}
          </select>
        </div>
        <div class="ul-col">
          <label class="ul-label">Range</label>
          <select class="ul-select" id="ul-days">
            ${DAYS_OPTS.map(d=>`<option value="${d.val}"${d.val===this._days?' selected':''}>${d.label}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="ul-section">
        <button class="ul-btn ul-btn--load${this._selected||src==='custom'?'':' ul-btn--disabled'}" id="ul-load-btn"
          ${this._selected||src==='custom'?'':'disabled'}>
          Load onto Chart
        </button>
      </div>
      <div class="ul-status" id="ul-status"></div>
    `;
    this._bind();
  }
  _bind() {
    const $ = id => this.el.querySelector(`#${id}`);
    $('ul-source').onchange = e => {
      this._source = e.target.value;
      this._selected = null;
      this._results = [];
      this._render();
    };
    const apiKeyEl = $('ul-apikey');
    if (apiKeyEl) apiKeyEl.oninput = e => { this._apiKey = e.target.value.trim(); };
    const csEl = $('ul-custom-search');
    if (csEl) csEl.oninput = e => { this._customSearchUrl = e.target.value.trim(); };
    const chEl = $('ul-custom-hist');
    if (chEl) chEl.oninput = e => { this._customHistUrl = e.target.value.trim(); };
    const searchIn = $('ul-search-in');
    const searchBtn = $('ul-search-btn');
    const doSearch = () => {
      const q = searchIn?.value.trim();
      if (this._source === 'custom') {
        if (q) { this._selected = {id: q, label: q, symbol: q}; this._render(); }
        return;
      }
      if (q) this._doSearch(q);
    };
    if (searchBtn) searchBtn.onclick = doSearch;
    if (searchIn) searchIn.onkeydown = e => { if (e.key === 'Enter') doSearch(); };
    $('ul-interval').onchange = e => { this._interval = e.target.value; };
    $('ul-days').onchange = e => { this._days = Number(e.target.value); };
    const clearBtn = $('ul-clear');
    if (clearBtn) clearBtn.onclick = () => { this._selected = null; this._render(); };
    const loadBtn = $('ul-load-btn');
    if (loadBtn && !loadBtn.disabled) loadBtn.onclick = () => this._load();
  }
  async _doSearch(q) {
    const ep = ENDPOINTS[this._source];
    if (!ep || !ep.search) return;
    const resultsEl = this.el.querySelector('#ul-results');
    resultsEl.innerHTML = `<div class="ul-res-item ul-res-searching">Searching…</div>`;
    resultsEl.classList.add('open');
    try {
      const items = await ep.search(q, this._apiKey, this._proxy);
      this._results = items;
      if (!items.length) {
        resultsEl.innerHTML = `<div class="ul-res-item ul-res-empty">No results found</div>`;
        return;
      }
      resultsEl.innerHTML = items.map((r,i) =>
        `<div class="ul-res-item" data-idx="${i}">${r.label}</div>`
      ).join('');
      resultsEl.querySelectorAll('.ul-res-item[data-idx]').forEach(el => {
        el.onclick = () => {
          const item = this._results[Number(el.dataset.idx)];
          this._selected = item;
          resultsEl.classList.remove('open');
          resultsEl.innerHTML = '';
          this._render();
        };
      });
    } catch(e) {
      resultsEl.innerHTML = `<div class="ul-res-item ul-res-error">Error: ${e.message}</div>`;
    }
  }
  async _load() {
    const statusEl = this.el.querySelector('#ul-status');
    const loadBtn  = this.el.querySelector('#ul-load-btn');
    const setStatus = (msg, type='info') => {
      if (statusEl) statusEl.innerHTML = `<span class="ul-status-${type}">${msg}</span>`;
    };
    if (loadBtn) { loadBtn.disabled = true; loadBtn.textContent = 'Loading…'; }
    setStatus('Fetching data…');
    try {
      let candles;
      const src = this._source;
      const ep = ENDPOINTS[src];
      const sym = this._selected?.symbol || this._selected?.id || '';
      if (src === 'custom') {
        candles = await this._loadCustom();
      } else if (ep && ep.load) {
        candles = await ep.load(sym, this._interval, this._days, this._apiKey, this._proxy);
      } else {
        throw new Error('No loader for this source');
      }
      if (!candles || !candles.length) throw new Error('No candles returned');
      this.chart._data = candles;
      this.chart.sym = sym;
      this.chart.int = this._interval;
      this.chart._buildSeries();
      this.chart._emit('load', {sym, int: this._interval, count: candles.length});
      this.chart._emit('barsChanged', {count: candles.length});
      document.dispatchEvent(new CustomEvent('symbol-changed', {detail: {sym, name: this._selected?.label || sym}}));
      toast(`${candles.length} bars loaded from ${ep?.label || 'custom'}`, 'success');
      setStatus(`✓ ${candles.length} bars loaded`, 'ok');
    } catch(e) {
      setStatus(`Error: ${e.message}`, 'error');
      toast(e.message, 'error');
    } finally {
      if (loadBtn) { loadBtn.disabled = false; loadBtn.textContent = 'Load onto Chart'; }
    }
  }
  async _loadCustom() {
    if (!this._customHistUrl) throw new Error('No history URL configured');
    const sym = this._selected?.symbol || '';
    const end = Math.floor(Date.now()/1000);
    const start = end - this._days * 86400;
    const url = this._customHistUrl
      .replace('{SYMBOL}', encodeURIComponent(sym))
      .replace('{START}', start)
      .replace('{END}', end);
    const res = await this._proxy(url);
    if (res.error) throw new Error(res.error);
    const raw = res.candles || res.data || res;
    if (!Array.isArray(raw)) throw new Error('Expected array of candles');
    return raw.map(c => ({
      time: Number(c.time||c.t||c.timestamp),
      open: Number(c.open||c.o),
      high: Number(c.high||c.h),
      low:  Number(c.low||c.l),
      close:Number(c.close||c.c),
      volume:Number(c.volume||c.v||0)
    })).filter(c => c.time && c.close);
  }
  destroy() { this._destroyed = true; }
}