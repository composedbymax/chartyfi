export class Exporter {
  constructor(chart) {
    this._chart = chart;
    this.timeFmt = 'unix';
    this.timezone = 'UTC';
  }
  _getData() {
    return this._chart._getCurrentData();
  }
  _indicatorSeries() {
    return typeof this._chart._getIndicators === 'function' ? this._chart._getIndicators() : [];
  }
  _baseCols() {
    const includeVol = this._chart.volMode === 'overlay' || this._chart.volMode === 'pane';
    if (this._chart.mode === 'line') {
      return includeVol ? ['time', this._chart.field, 'volume'] : ['time', this._chart.field];
    }
    return includeVol ? ['time', 'open', 'high', 'low', 'close', 'volume'] : ['time', 'open', 'high', 'low', 'close'];
  }
  _uniqueColumn(name, used) {
    let col = name;
    let i = 2;
    while (used.has(col)) col = `${name}:${i++}`;
    used.add(col);
    return col;
  }
  _layout() {
    const cols = this._baseCols();
    const used = new Set(cols);
    const series = this._indicatorSeries().map(s => {
      if (s.type === 'band') {
        const upperCol = this._uniqueColumn(`indicator:${s.label}:upper`, used);
        const lowerCol = this._uniqueColumn(`indicator:${s.label}:lower`, used);
        return {...s, upperCol, lowerCol};
      }
      if (s.type === 'candle') {
        const openCol = this._uniqueColumn(`indicator:${s.label}:open`, used);
        const highCol = this._uniqueColumn(`indicator:${s.label}:high`, used);
        const lowCol = this._uniqueColumn(`indicator:${s.label}:low`, used);
        const closeCol = this._uniqueColumn(`indicator:${s.label}:close`, used);
        return {...s, openCol, highCol, lowCol, closeCol};
      }
      const col = this._uniqueColumn(`indicator:${s.label}`, used);
      return {...s, col};
    });
    return {
      cols: cols.concat(series.flatMap(s=>{
        if (s.type === 'band') return [s.upperCol, s.lowerCol];
        if (s.type === 'candle') return [s.openCol, s.highCol, s.lowCol, s.closeCol];
        return [s.col];
      })),
      series
    };
  }
  _formatTime(unix) {
    if (this.timeFmt === 'iso') {
      return new Date(unix * 1000).toLocaleString('sv-SE', {timeZone: this.timezone}).replace(' ', 'T');
    }
    if (this.timeFmt === 'datetime') {
      return new Date(unix * 1000).toLocaleString('en-US', {
        timeZone: this.timezone,
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', second: '2-digit'
      });
    }
    return unix;
  }
  _row(r, cols) {
    return cols.map(c => c === 'time' ? this._formatTime(r.time) : (r[c] ?? ''));
  }
  _filename(ext) {
    const sym = this._chart._currentSymbol || 'data';
    const int = this._chart._currentInterval || '';
    return `${sym}_${int}.${ext}`;
  }
  _download(content, filename, mime) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: mime }));
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  _mergeRows(series) {
    const rows = this._getData().map(r => ({ ...r }));
    if (!rows.length || !series.length) return rows;
    const byTime = new Map(rows.map(r => [r.time, r]));
    series.forEach(s => {
      if (s.type === 'band') {
        (s.upper || []).forEach(p => {
          const r = byTime.get(p.time);
          if (r) r[s.upperCol] = p.value ?? null;
        });
        (s.lower || []).forEach(p => {
          const r = byTime.get(p.time);
          if (r) r[s.lowerCol] = p.value ?? null;
        });
      } else if (s.type === 'candle') {
        (s.data || []).forEach(p => {
          const r = byTime.get(p.time);
          if (r) {
            r[s.openCol] = p.open ?? null;
            r[s.highCol] = p.high ?? null;
            r[s.lowCol] = p.low ?? null;
            r[s.closeCol] = p.close ?? null;
          }
        });
      } else {
        (s.data || []).forEach(p => {
          const r = byTime.get(p.time);
          if (r) r[s.col] = p.value ?? null;
        });
      }
    });
    rows.forEach(r => {
      series.forEach(s => {
        if (s.type === 'band') {
          if (!(s.upperCol in r)) r[s.upperCol] = null;
          if (!(s.lowerCol in r)) r[s.lowerCol] = null;
        } else if (s.type === 'candle') {
          if (!(s.openCol in r)) r[s.openCol] = null;
          if (!(s.highCol in r)) r[s.highCol] = null;
          if (!(s.lowCol in r)) r[s.lowCol] = null;
          if (!(s.closeCol in r)) r[s.closeCol] = null;
        } else if (!(s.col in r)) {
          r[s.col] = null;
        }
      });
    });
    return rows;
  }
  _exportCSV() {
    const layout = this._layout();
    const rows = this._mergeRows(layout.series);
    if (!rows.length) return;
    const body = rows.map(r => this._row(r, layout.cols).join(',')).join('\n');
    this._download(layout.cols.join(',') + '\n' + body, this._filename('csv'), 'text/csv');
  }
  _exportJSON() {
    const layout = this._layout();
    const rows = this._mergeRows(layout.series);
    const data = rows.map(r => Object.fromEntries(layout.cols.map(c => [c, c === 'time' ? this._formatTime(r.time) : (r[c] ?? null)])));
    this._download(JSON.stringify(data, null, 2), this._filename('json'), 'application/json');
  }
  _exportTXT() {
    const layout = this._layout();
    const rows = this._mergeRows(layout.series);
    if (!rows.length) return;
    const lines = rows.map(r => this._row(r, layout.cols).join('\t'));
    this._download(layout.cols.join('\t') + '\n' + lines.join('\n'), this._filename('txt'), 'text/plain');
  }
  _showTable() {
    const layout = this._layout();
    const rows = this._mergeRows(layout.series);
    const overlay = document.createElement('div');
    overlay.id = 'export-table-overlay';
    const thead = layout.cols.map(c => `<th>${c}</th>`).join('');
    const tbody = rows.map(r => `<tr>${this._row(r, layout.cols).map(v => `<td>${v}</td>`).join('')}</tr>`).join('');
    overlay.innerHTML = `
      <div id="export-table-wrap">
        <div id="export-table-toolbar">
          <span id="export-table-title">${this._chart._currentSymbol ?? 'No data'} ${this._chart._currentInterval} — ${rows.length} bars</span>
          <div id="export-table-actions">
            <button id="export-copy-btn">Copy</button>
            <button id="export-close-btn">✕</button>
          </div>
        </div>
        <div id="export-table-scroll">
          <table id="export-table">
            <thead><tr>${thead}</tr></thead>
            <tbody>${tbody}</tbody>
          </table>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#export-close-btn').onclick = () => overlay.remove();
    overlay.querySelector('#export-copy-btn').onclick = () => {
      const tsv = [layout.cols.join('\t'), ...rows.map(r => this._row(r, layout.cols).join('\t'))].join('\n');
      navigator.clipboard.writeText(tsv).then(() => {
        const btn = overlay.querySelector('#export-copy-btn');
        btn.textContent = 'Copied!';
        setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
      });
    };
  }
}