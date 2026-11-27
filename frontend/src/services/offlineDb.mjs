/**
 * KIZIY APPS - Offline-First IndexedDB Wrapper
 * Menyimpan katalog lokal, master data, dan antrian transaksi offline.
 */

const DB_NAME = 'kiziy_pos_db';
const DB_VERSION = 1;

const STORES = {
  MASTER: 'master_cache',
  OFFLINE_QUEUE: 'offline_tx_queue',
  SHIFT_STATE: 'shift_state'
};

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORES.MASTER)) {
        db.createObjectStore(STORES.MASTER, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORES.OFFLINE_QUEUE)) {
        const qStore = db.createObjectStore(STORES.OFFLINE_QUEUE, { keyPath: 'client_tx_uuid' });
        qStore.createIndex('created_at', 'created_at', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.SHIFT_STATE)) {
        db.createObjectStore(STORES.SHIFT_STATE, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function putItem(storeName, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(value);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function getItem(storeName, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function getAllItems(storeName) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function deleteItem(storeName, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(key);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

export const offlineDb = {
  saveBootstrapData: (data) => putItem(STORES.MASTER, { key: 'bootstrap', data, updated_at: new Date().toISOString() }),
  getBootstrapData: async () => {
    const record = await getItem(STORES.MASTER, 'bootstrap');
    return record ? record.data : null;
  },
  enqueueOfflineTx: (txPayload) => putItem(STORES.OFFLINE_QUEUE, txPayload),
  getOfflineQueue: () => getAllItems(STORES.OFFLINE_QUEUE),
  removeOfflineTx: (clientTxUuid) => deleteItem(STORES.OFFLINE_QUEUE, clientTxUuid),
  saveActiveShift: (shiftObj) => putItem(STORES.SHIFT_STATE, { key: 'active_shift', ...shiftObj }),
  getActiveShift: () => getItem(STORES.SHIFT_STATE, 'active_shift'),
  clearActiveShift: () => deleteItem(STORES.SHIFT_STATE, 'active_shift')
};
