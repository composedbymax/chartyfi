import { storage } from './storage.js';
export async function initModels() {
  storage.clearModelList();
  try {
    const res = await fetch(window.ARI.api, {method: 'POST',headers: { 'Content-Type': 'application/json' },body: JSON.stringify({ action: 'list' })});
    const data = await res.json();
    if (!Array.isArray(data.models)) return;
    storage.setModelList(data.models);
    const savedPreferred = storage.getPreferredModel();
    const stillValid = savedPreferred && data.models.includes(savedPreferred);
    if (!stillValid && data.models.length) {storage.setPreferredModel(data.models[0]);}
  } catch {}
}