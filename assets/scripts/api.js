const API_JSON_PATH = 'api/_link.php';
export async function initApiLink() {
  const res = await fetch(API_JSON_PATH);
  if (!res.ok) throw new Error(`Failed to load API config: ${res.status} ${res.statusText}`);
  const config = await res.json();
  for (const [key, value] of Object.entries(config)) {
    window[key] = value;
  }
}