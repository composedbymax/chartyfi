class CloudSeriesRenderer {
  constructor() {
    this._data = null;
    this._options = null;
  }
  update(data, options) {
    this._data = data;
    this._options = options;
  }
  draw(target, priceToCoordinate) {
    target.useBitmapCoordinateSpace(scope => this._drawImpl(scope, priceToCoordinate));
  }
  _hasData(bar) {
    return bar.originalData &&
      bar.originalData.upper !== undefined &&
      bar.originalData.lower !== undefined;
  }
  _drawImpl(scope, priceToCoordinate) {
    if (!this._data || !this._data.bars || this._data.bars.length === 0) return;
    const visibleRange = this._data.visibleRange;
    if (!visibleRange) return;
    const bars = this._data.bars;
    const from = Math.max(0, visibleRange.from - 1);
    const to = Math.min(bars.length, visibleRange.to + 1);
    if (to <= from) return;
    const ctx = scope.context;
    const hRatio = scope.horizontalPixelRatio;
    const vRatio = scope.verticalPixelRatio;
    ctx.save();
    let i = from;
    while (i < to) {
      if (!this._hasData(bars[i])) { i++; continue; }
      const color = bars[i].barColor || this._options.upColor;
      let j = i;
      while (j < to && this._hasData(bars[j]) && (bars[j].barColor || this._options.upColor) === color) j++;
      this._fillRun(ctx, bars, i, j - 1, hRatio, vRatio, priceToCoordinate, color);
      i = j;
    }
    ctx.restore();
  }
  _fillRun(ctx, bars, from, to, hRatio, vRatio, priceToCoordinate, color) {
    if (to < from) return;
    ctx.beginPath();
    for (let k = from; k <= to; k++) {
      const b = bars[k];
      const x = b.x * hRatio;
      const y = priceToCoordinate(b.originalData.upper) * vRatio;
      if (k === from) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    for (let k = to; k >= from; k--) {
      const b = bars[k];
      const x = b.x * hRatio;
      const y = priceToCoordinate(b.originalData.lower) * vRatio;
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
}
export class CloudSeries {
  constructor() {
    this._renderer = new CloudSeriesRenderer();
  }
  priceValueBuilder(plotRow) {
    return [plotRow.upper, plotRow.lower];
  }
  isWhitespace(data) {
    return data.upper === undefined || data.lower === undefined;
  }
  renderer() {
    return this._renderer;
  }
  update(data, options) {
    this._renderer.update(data, options);
  }
  defaultOptions() {
    return {
      upColor: 'rgba(34,197,94,0.35)',
      downColor: 'rgba(239,68,68,0.35)',
    };
  }
}