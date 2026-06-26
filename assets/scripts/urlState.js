export function initUrlState(chart) {
  const syncUrl = ({ sym, int }) => {
    const u = new URL(location.href);
    u.search = `?${encodeURIComponent(sym)}&${encodeURIComponent(int)}`;
    history.replaceState(null, '', u);
  };
  chart._chartOn('load', syncUrl);
  const q = location.search.slice(1);
  if (!q || q === 'dataset') return false;
  const [symRaw = '', intRaw = ''] = q.split('&');
  const sym = decodeURIComponent(symRaw);
  if (!sym) return false;
  const int = decodeURIComponent(intRaw) || chart._currentInterval;
  chart.load(sym, int);
  return true;
}