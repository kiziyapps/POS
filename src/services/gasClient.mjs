import { getGasUrl } from '../config/env';

/**
 * KIZIY APPS - GAS API Client
 * Menggunakan Content-Type: text/plain untuk menghindari CORS preflight OPTIONS di GAS Web App.
 */

export async function callGasApi(action, payload = {}, token = '') {
  const gasUrl = getGasUrl();
  if (!gasUrl || gasUrl.includes('YOUR_DEPLOYMENT_ID')) {
    throw new Error('URL Web App GAS belum dikonfigurasi. Silakan atur pada halaman Login.');
  }

  const response = await fetch(gasUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify({ action, payload, token })
  });

  if (!response.ok) {
    throw new Error(`HTTP Error ${response.status}: Gagal terhubung ke server GAS.`);
  }

  const json = await response.json();
  if (!json.ok) {
    throw new Error(json.error || 'Terjadi kesalahan pada server GAS.');
  }

  return json.data;
}

export function generateOfflineReceiptNo(deviceId) {
  const shortUuid = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `OFF-${deviceId}-${shortUuid}`;
}
