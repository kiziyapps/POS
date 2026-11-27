const STORAGE_GAS_URL_KEY = 'kiziy_gas_webapp_url';
const STORAGE_DEVICE_ID_KEY = 'kiziy_device_id';

export function getGasUrl() {
  return localStorage.getItem(STORAGE_GAS_URL_KEY) || import.meta.env.VITE_GAS_WEBAPP_URL || '';
}

export function setGasUrl(url) {
  localStorage.setItem(STORAGE_GAS_URL_KEY, (url || '').trim());
}

export function getDeviceId() {
  let id = localStorage.getItem(STORAGE_DEVICE_ID_KEY);
  if (!id) {
    id = 'DEV-' + Math.random().toString(36).substring(2, 6).toUpperCase();
    localStorage.setItem(STORAGE_DEVICE_ID_KEY, id);
  }
  return id;
}

export const APP_CONSTANTS = {
  APP_NAME: 'KIZIY APPS',
  VERSION: '1.0.0',
  SILENT_REFRESH_INTERVAL_MS: 4 * 60 * 60 * 1000 // Refresh tiap 4 jam (sebelum batas 6 jam CacheService GAS)
};
