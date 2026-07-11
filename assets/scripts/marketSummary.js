import {attachSpinner} from './spinner.js';
const CACHE_KEY = 'mks_cache';
const CATEGORY_ORDER = [
    {label:'US Indices',   types:['INDEX'],          markets:['us_market','usir_market']},
    {label:'Commodities',  types:['FUTURE'],          markets:null},
    {label:'Crypto',       types:['CRYPTOCURRENCY'],  markets:null},
    {label:'Forex',        types:['CURRENCY'],        markets:null},
    {label:'Global',       types:['INDEX'],           markets:['gb_market','jp_market','de_market','fr_market','hk_market','cn_market']},
];
const CURRENCY_SYMBOLS = {CRYPTOCURRENCY:'', CURRENCY:'', INDEX:'', FUTURE:''};
const PRICE_PREFIX = {us_market:'$', ccc_market:'$', us24_market:'$'};
function _categorize(items) {
    const used = new Set();
    return CATEGORY_ORDER.map(cat => {
        const matched = items.filter(d => {
            if (used.has(d.symbol)) return false;
            const typeMatch = cat.types.includes(d.quoteType);
            const marketMatch = !cat.markets || cat.markets.includes(d.market);
            return typeMatch && marketMatch;
        });
        matched.forEach(d => used.add(d.symbol));
        return {label: cat.label, items: matched};
    }).filter(g => g.items.length);
}
function _pct(item) {
    const v = item.regularMarketChangePercent?.raw ?? 0;
    const sign = v >= 0 ? '+' : '';
    return `${sign}${v.toFixed(2)}%`;
}
function _price(item) {
    const prefix = PRICE_PREFIX[item.market] ?? '';
    const fmt = item.regularMarketPrice?.fmt ?? '—';
    return prefix + fmt;
}
function _change(item) {
    const v = item.regularMarketChange?.raw ?? 0;
    const sign = v >= 0 ? '+' : '';
    const fmt = item.regularMarketChange?.fmt ?? '—';
    return (v >= 0 ? '+' : '') + fmt;
}
function _isPos(item) {
    return (item.regularMarketChangePercent?.raw ?? 0) >= 0;
}
function _state(item) {
    const s = item.marketState ?? '';
    if (s === 'REGULAR') return {label:'Open',  cls:'mks-state-open'};
    if (s === 'PRE')     return {label:'Pre',   cls:'mks-state-pre'};
    if (s === 'POST')    return {label:'Post',  cls:'mks-state-post'};
    return {label:'Closed', cls:'mks-state-closed'};
}
function _saveCache(payload) {
    try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch(_) {}
}
function _loadCache(expiresAt) {
    try {
        const raw = sessionStorage.getItem(CACHE_KEY);
        if (!raw) return null;
        const c = JSON.parse(raw);
        if (!c || c.expires_at !== expiresAt) return null;
        return c;
    } catch(_) { return null; }
}
export class MarketSummary {
    static config = {
        title:             'Market Summary',
        description:       'Live overview of global indices, commodities, forex, and crypto',
        width:             '100vw',
        mobileWidth:       '100vw',
        suspendIndicators: false,
        persistent:        false,
    };
    constructor(chart, api) {
        this.chart = chart;
        this.api   = api;
        this.el    = document.createElement('div');
        this.el.className = 'da-wrap mks-wrap';
        const loaderLayer = document.createElement('div');
        loaderLayer.className = 'nws-loader-layer';
        this.el.appendChild(loaderLayer);
        this.spinner = attachSpinner(loaderLayer, {size: 40, color: 'var(--accent)'});
        this._content = document.createElement('div');
        this._content.className = 'mks-content';
        this.el.appendChild(this._content);
        this._controller = null;
        this._render();
    }
    async _fetch() {
        if (this._controller) this._controller.abort();
        this._controller = new AbortController();
        try {
            const r = await fetch(window.MKS.api, {
                method:  'POST',
                headers: {'Content-Type': 'application/json'},
                body:    JSON.stringify({action: 'marketSummary'}),
                signal:  this._controller.signal,
            });
            return await r.json();
        } catch(e) {
            if (e.name === 'AbortError') return null;
            return null;
        }
    }
    _buildCard(item) {
        const pos   = _isPos(item);
        const state = _state(item);
        const card  = document.createElement('div');
        card.className = `mks-card${pos ? ' mks-pos' : ' mks-neg'}`;
        const top = document.createElement('div');
        top.className = 'mks-card-top';
        const name = document.createElement('span');
        name.className = 'mks-name';
        name.textContent = item.shortName ?? item.symbol;
        const badge = document.createElement('span');
        badge.className = `mks-badge ${state.cls}`;
        badge.textContent = state.label;
        top.appendChild(name);
        top.appendChild(badge);
        const price = document.createElement('div');
        price.className = 'mks-price';
        price.textContent = _price(item);
        const bot = document.createElement('div');
        bot.className = 'mks-card-bot';
        const chgWrap = document.createElement('div');
        chgWrap.className = 'mks-delta-row';
        const chgLabel = document.createElement('span');
        chgLabel.className = 'mks-delta-label';
        chgLabel.textContent = 'Chg';
        const chgVal = document.createElement('span');
        chgVal.className = 'mks-chg';
        chgVal.textContent = _change(item);
        const pctVal = document.createElement('span');
        pctVal.className = 'mks-pct';
        pctVal.textContent = _pct(item);
        chgWrap.appendChild(chgLabel);
        chgWrap.appendChild(chgVal);
        chgWrap.appendChild(pctVal);
        const loadBtn = document.createElement('button');
        loadBtn.className = 'mks-load-btn btn-sm';
        loadBtn.textContent = `Load ${item.symbol}`;
        loadBtn.onclick = () => {
            this.chart.load(item.symbol, this.chart._currentInterval || '1D');
        };
        bot.appendChild(chgWrap);
        bot.appendChild(loadBtn);
        card.appendChild(top);
        card.appendChild(price);
        card.appendChild(bot);
        return card;
    }
    async _render() {
        this.spinner.show();
        this._content.innerHTML = '';
        const resp = await this._fetch();
        this.spinner.hide();
        if (!resp || !resp.data) {
            this._content.innerHTML = '<div class="da-empty">Failed to load market data.</div>';
            return;
        }
        const cached = _loadCache(resp.expires_at);
        const data   = cached ? cached.data : resp.data;
        if (!cached) _saveCache({data, expires_at: resp.expires_at});
        const groups = _categorize(data);
        groups.forEach(group => {
            const section = document.createElement('div');
            section.className = 'mks-section';
            const lbl = document.createElement('div');
            lbl.className = 'mks-section-label';
            lbl.textContent = group.label;
            section.appendChild(lbl);
            const grid = document.createElement('div');
            grid.className = 'mks-grid';
            group.items.forEach(item => grid.appendChild(this._buildCard(item)));
            section.appendChild(grid);
            this._content.appendChild(section);
        });
    }
    destroy() {
        if (this._controller) this._controller.abort();
        this.spinner.destroy();
    }
}