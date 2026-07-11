export const initAPI = 'api/_link.php';
export async function initApiLink() {
  try {
    const res = await fetch(initAPI);
    if (!res.ok) throw new Error(`Failed to load API config: ${res.status} ${res.statusText}`);
    const config = await res.json();
    for (const [key, value] of Object.entries(config)) {window[key] = value;}
    return true;
  } catch (e) {
    if (!navigator.onLine || e instanceof TypeError) return false;
    throw e;
  }
}