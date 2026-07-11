import {attachSpinner} from './spinner.js';
const CACHE_PREFIX = 'ins_cache_';
const SUMMARY_THRESHOLD = 600;
export class Insights {
    static config = {
        title: 'Insights',
        description: 'Technical analysis, valuation, and analyst insights for the current symbol',
        width: '50vw',
        mobileWidth: '40vw',
        suspendIndicators: false,
        persistent: false
    };
    constructor(chart, api) {
        this.chart = chart;
        this.api = api;
        this._destroyed = false;
        this.el = document.createElement('div');
        this.el.className = 'da-wrap';
        this.content = document.createElement('div');
        this.el.appendChild(this.content);
        const loaderLayer = document.createElement('div');
        loaderLayer.className = 'ins-loader-layer';
        this.el.appendChild(loaderLayer);
        this.spinner = attachSpinner(loaderLayer, {size: 40, color: 'var(--accent)'});
        this.spinner.hide();
        this._controller = null;
        this._onLoad = () => { if (!this._destroyed) this._render(); };
        this.chart._chartOn('load', this._onLoad);
        this.chart._chartOn('dataset-loaded', this._onLoad);
        this._render();
    }
    _cacheKey(sym) { return CACHE_PREFIX + sym.toUpperCase(); }
    _readCache(sym) {
        try {
            const raw = sessionStorage.getItem(this._cacheKey(sym));
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    }
    _writeCache(sym, data) {
        try { sessionStorage.setItem(this._cacheKey(sym), JSON.stringify(data)); } catch {}
    }
    async _fetch(sym) {
        if (this._controller) this._controller.abort();
        this._controller = new AbortController();
        try {
            const r = await fetch(window.INS.api, {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({symbol: sym}),
                signal: this._controller.signal
            });
            return await r.json();
        } catch (e) {
            if (e.name === 'AbortError') return null;
            return null;
        }
    }
    async _getData(sym) {
        const cached = this._readCache(sym);
        if (cached) {
            const fresh = await this._fetch(sym);
            if (!fresh || fresh.error) return cached;
            if (fresh.cachedAt === cached.cachedAt) return cached;
            this._writeCache(sym, fresh);
            return fresh;
        }
        const data = await this._fetch(sym);
        if (data && !data.error) this._writeCache(sym, data);
        return data;
    }
    _hasRealData(obj, excludeKeys = ['provider']) {
        if (!obj) return false;
        return Object.keys(obj).some(k => !excludeKeys.includes(k) && obj[k] != null);
    }
    async _render() {
        const sym = this.chart._currentSymbol;
        if (!sym) {
            this.content.innerHTML = '<div class="da-empty">No symbol loaded.</div>';
            return;
        }
        this.spinner.show();
        this.content.innerHTML = '';
        const data = await this._getData(sym);
        this.spinner.hide();
        if (!data) {
            this.content.innerHTML = '<div class="da-empty">Failed to load insights.</div>';
            return;
        }
        if (data.error || data.unsupported) {
            this.content.innerHTML = '<div class="da-empty">Insights are not available for this symbol.</div>';
            return;
        }
        if (!data.result) {
            this.content.innerHTML = '<div class="da-empty">Failed to load insights.</div>';
            return;
        }
        const r = data.result;
        const info = r.instrumentInfo || {};
        const snap = r.companySnapshot || {};
        const hasTE = this._hasRealData(info.technicalEvents, ['provider']);
        const hasKT = this._hasRealData(info.keyTechnicals, ['provider']);
        const hasVal = this._hasRealData(info.valuation, ['provider', 'color']);
        const hasRec = info.recommendation && this._hasRealData(info.recommendation, ['provider']);
        const hasSnap = !!(snap.company && Object.keys(snap.company).length);
        const hasReports = !!(r.reports && r.reports.length);
        if (!hasTE && !hasKT && !hasVal && !hasRec && !hasSnap && !hasReports) {
            this.content.innerHTML = '<div class="da-empty">No insights available for this symbol.</div>';
            return;
        }
        this._buildUI(r, {hasTE, hasKT, hasVal, hasRec, hasSnap, hasReports});
    }

    _buildUI(r, flags) {
        const wrap = document.createElement('div');
        wrap.className = 'ins-wrap';
        const info = r.instrumentInfo || {};
        const snap = r.companySnapshot || {};
        if (flags.hasTE || flags.hasKT || flags.hasVal || flags.hasRec) {
            const grid = document.createElement('div');
            grid.className = 'ins-grid';
            if (flags.hasTE) grid.appendChild(this._technicalCard(info.technicalEvents));
            if (flags.hasKT) grid.appendChild(this._keyTechCard(info.keyTechnicals));
            if (flags.hasVal) grid.appendChild(this._valuationCard(info.valuation));
            if (flags.hasRec) grid.appendChild(this._recommendationCard(info.recommendation));
            wrap.appendChild(grid);
        }
        if (flags.hasSnap) wrap.appendChild(this._snapshotCard(snap));
        if (flags.hasReports) wrap.appendChild(this._reportsSection(r.reports));
        this.content.appendChild(wrap);
    }
    _card(title, provider) {
        const card = document.createElement('div');
        card.className = 'ins-card';
        const hdr = document.createElement('div');
        hdr.className = 'ins-card-hdr';
        const t = document.createElement('span');
        t.className = 'ins-card-title';
        t.textContent = title;
        hdr.appendChild(t);
        if (provider) {
            const p = document.createElement('span');
            p.className = 'ins-provider';
            p.textContent = provider;
            hdr.appendChild(p);
        }
        card.appendChild(hdr);
        return card;
    }
    _technicalCard(te) {
        const card = this._card('Technical Events', te.provider);
        card.className += ' ins-card--full';
        const rows = [['Short Term', te.shortTerm], ['Mid Term', te.midTerm], ['Long Term', te.longTerm]];
        const list = document.createElement('div');
        list.className = 'ins-kv-list';
        rows.forEach(([label, val]) => {
            const normalised = (val || '').toLowerCase();
            if (normalised === 'none' || normalised === '') return;
            const row = document.createElement('div');
            row.className = 'ins-kv-row';
            const l = document.createElement('span');
            l.className = 'ins-kv-label';
            l.textContent = label;
            const v = document.createElement('span');
            v.className = 'ins-trend ins-trend--' + normalised;
            v.textContent = val.charAt(0).toUpperCase() + val.slice(1);
            row.appendChild(l);
            row.appendChild(v);
            list.appendChild(row);
        });
        card.appendChild(list);
        return card;
    }
    _keyTechCard(kt) {
        const card = this._card('Key Technicals', kt.provider);
        card.className += ' ins-card--full';
        const fmt = n => n != null ? Number(n).toFixed(2) : null;
        const rows = [['Support', fmt(kt.support)], ['Resistance', fmt(kt.resistance)], ['Stop Loss', fmt(kt.stopLoss)]];
        const grid = document.createElement('div');
        grid.className = 'ins-kt-grid';
        rows.forEach(([label, val]) => {
            const cell = document.createElement('div');
            cell.className = 'ins-kt-cell';
            const l = document.createElement('span');
            l.className = 'ins-kt-label';
            l.textContent = label;
            const v = document.createElement('span');
            v.className = 'ins-kt-val';
            v.textContent = val ?? '—';
            cell.appendChild(l);
            cell.appendChild(v);
            grid.appendChild(cell);
        });
        card.appendChild(grid);
        return card;
    }
    _valuationCard(val) {
        const card = this._card('Valuation', val.provider);
        const list = document.createElement('div');
        list.className = 'ins-kv-list';
        [['Description', val.description], ['Relative Value', val.relativeValue], ['Discount', val.discount]].forEach(([label, value]) => {
            if (!value) return;
            const row = document.createElement('div');
            row.className = 'ins-kv-row';
            const l = document.createElement('span');
            l.className = 'ins-kv-label';
            l.textContent = label;
            const v = document.createElement('span');
            v.className = 'ins-kv-val';
            v.textContent = value;
            row.appendChild(l);
            row.appendChild(v);
            list.appendChild(row);
        });
        card.appendChild(list);
        return card;
    }
    _recommendationCard(rec) {
        const card = this._card('Analyst Rating', rec.provider);
        const wrap = document.createElement('div');
        wrap.className = 'ins-rec-wrap';
        const rating = document.createElement('span');
        const ratingClass = rec.rating === 'BUY' ? 'ins-rating--buy' : rec.rating === 'SELL' ? 'ins-rating--sell' : 'ins-rating--hold';
        rating.className = 'ins-rating ' + ratingClass;
        rating.textContent = rec.rating || '—';
        wrap.appendChild(rating);
        if (rec.targetPrice != null) {
            const tp = document.createElement('span');
            tp.className = 'ins-target';
            tp.textContent = 'Target: $' + Number(rec.targetPrice).toLocaleString();
            wrap.appendChild(tp);
        }
        card.appendChild(wrap);
        return card;
    }
    _snapshotCard(snap) {
        const sectorLabel = snap.sectorInfo ? snap.sectorInfo + ' Sector' : null;
        const card = this._card('Company Snapshot', sectorLabel);
        card.className += ' ins-card--full';
        const metrics = snap.company || {};
        const sector = snap.sector || {};
        const keys = ['innovativeness', 'hiring', 'sustainability', 'insiderSentiments', 'earningsReports', 'dividends'];
        const labels = {innovativeness: 'Innovativeness', hiring: 'Hiring', sustainability: 'Sustainability', insiderSentiments: 'Insider Sentiment', earningsReports: 'Earnings Reports', dividends: 'Dividends'};
        const bars = document.createElement('div');
        bars.className = 'ins-bars';
        keys.forEach(k => {
            const val = metrics[k] != null ? metrics[k] : null;
            const secVal = sector[k] != null ? sector[k] : 0.5;
            if (val == null) return;
            const row = document.createElement('div');
            row.className = 'ins-bar-row';
            const lbl = document.createElement('span');
            lbl.className = 'ins-bar-label';
            lbl.textContent = labels[k] || k;
            const track = document.createElement('div');
            track.className = 'ins-bar-track';
            const fill = document.createElement('div');
            fill.className = 'ins-bar-fill';
            fill.style.width = Math.round(val * 100) + '%';
            const marker = document.createElement('div');
            marker.className = 'ins-bar-marker';
            marker.style.left = Math.round(secVal * 100) + '%';
            const pct = document.createElement('span');
            pct.className = 'ins-bar-pct';
            pct.textContent = Math.round(val * 100) + '%';
            track.appendChild(fill);
            track.appendChild(marker);
            row.appendChild(lbl);
            row.appendChild(track);
            row.appendChild(pct);
            bars.appendChild(row);
        });
        card.appendChild(bars);
        return card;
    }
    _reportsSection(reports) {
        const section = document.createElement('div');
        section.className = 'ins-reports';
        const hdr = document.createElement('div');
        hdr.className = 'ins-section-hdr';
        hdr.textContent = 'Research Reports';
        section.appendChild(hdr);
        reports.forEach(rep => {
            const item = document.createElement('div');
            item.className = 'ins-report-item';
            const meta = document.createElement('div');
            meta.className = 'ins-report-meta';
            const prov = document.createElement('span');
            prov.className = 'ins-provider';
            prov.textContent = rep.provider || '';
            const date = document.createElement('span');
            date.className = 'ins-report-date';
            if (rep.publishedOn) {
                date.textContent = new Date(rep.publishedOn).toLocaleDateString(undefined, {year: 'numeric', month: 'short', day: 'numeric'});
            }
            meta.appendChild(prov);
            meta.appendChild(date);
            const title = document.createElement('div');
            title.className = 'ins-report-title';
            title.textContent = rep.title || '';
            item.appendChild(meta);
            item.appendChild(title);
            const text = rep.summary || '';
            if (text) {
                const needsToggle = text.length > SUMMARY_THRESHOLD;
                const summary = document.createElement('div');
                summary.className = 'ins-report-summary';
                summary.textContent = needsToggle ? text.slice(0, SUMMARY_THRESHOLD) + '…' : text;
                item.appendChild(summary);
                if (needsToggle) {
                    const btn = document.createElement('button');
                    btn.className = 'ins-expand-btn';
                    btn.textContent = 'Read more';
                    let expanded = false;
                    btn.onclick = () => {
                        expanded = !expanded;
                        summary.textContent = expanded ? text : text.slice(0, SUMMARY_THRESHOLD) + '…';
                        btn.textContent = expanded ? 'Show less' : 'Read more';
                    };
                    item.appendChild(btn);
                }
            }
            section.appendChild(item);
        });
        return section;
    }
    destroy() {
        this._destroyed = true;
        if (this._controller) this._controller.abort();
        this.spinner.destroy();
    }
}