/**
 * KIZIY APPS - Offline-First IndexedDB Wrapper
 * Menyimpan katalog lokal, antrian transaksi offline, cache riwayat & summary (SWR).
 */

const DB_NAME = 'kiziy_pos_db';
const DB_VERSION = 2;

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
  saveRecentTxs: (txs) => putItem(STORES.MASTER, { key: 'recent_txs', data: txs, updated_at: new Date().toISOString() }),
  getRecentTxs: async () => {
    const record = await getItem(STORES.MASTER, 'recent_txs');
    return record ? record.data : [];
  },
  saveSummaryRows: (rows) => putItem(STORES.MASTER, { key: 'summary_rows', data: rows, updated_at: new Date().toISOString() }),
  getSummaryRows: async () => {
    const record = await getItem(STORES.MASTER, 'summary_rows');
    return record ? record.data : [];
  },
  enqueueOfflineTx: (txPayload) => putItem(STORES.OFFLINE_QUEUE, txPayload),
  getOfflineQueue: () => getAllItems(STORES.OFFLINE_QUEUE),
  removeOfflineTx: (clientTxUuid) => deleteItem(STORES.OFFLINE_QUEUE, clientTxUuid),
  saveActiveShift: (shiftObj) => putItem(STORES.SHIFT_STATE, { key: 'active_shift', ...shiftObj }),
  getActiveShift: () => getItem(STORES.SHIFT_STATE, 'active_shift'),
  clearActiveShift: () => deleteItem(STORES.SHIFT_STATE, 'active_shift'),

  /**
   * Optimistic update stok lokal & Daily_Summary lokal agar UI terasa 0ms
   */
  applyOptimisticSale: async (txPayload) => {
    const bootRecord = await getItem(STORES.MASTER, 'bootstrap');
    let updatedBoot = null;
    if (bootRecord && bootRecord.data) {
      const boot = { ...bootRecord.data };
      const outletId = txPayload.outlet_id || 'OUTLET_MAIN';
      const balances = [...(boot.stock_balances || [])];

      (txPayload.items || []).forEach((it) => {
        const key = `${outletId}|${it.variant_id}`;
        const idx = balances.findIndex((b) => b.balance_key === key);
        const qtyDelta = Number(it.base_qty_deducted || it.qty || 1);
        if (idx >= 0) {
          balances[idx] = { ...balances[idx], qty_on_hand: Number(balances[idx].qty_on_hand || 0) - qtyDelta };
        } else {
          balances.push({ balance_key: key, outlet_id: outletId, variant_id: it.variant_id, qty_on_hand: -qtyDelta });
        }
      });

      boot.stock_balances = balances;
      updatedBoot = boot;
      await putItem(STORES.MASTER, { key: 'bootstrap', data: boot, updated_at: new Date().toISOString() });
    }

    // Optimistic update Daily_Summary lokal
    const sumRecord = await getItem(STORES.MASTER, 'summary_rows');
    const rows = sumRecord && Array.isArray(sumRecord.data) ? [...sumRecord.data] : [];
    const dateStr = String(txPayload.created_at || new Date().toISOString()).slice(0, 10);
    const outletId = txPayload.outlet_id || 'OUTLET_MAIN';
    const summaryKey = `${dateStr}|${outletId}`;
    const netSale = Number(txPayload.grand_total || 0) - Number(txPayload.tax_total || 0);
    const cogs = (txPayload.items || []).reduce((s, it) => s + Number(it.cogs_snapshot || 0) * Number(it.base_qty_deducted || it.qty || 1), 0);

    const existingIdx = rows.findIndex((r) => r.summary_key === summaryKey);
    if (existingIdx >= 0) {
      const ex = rows[existingIdx];
      const nextNet = Number(ex.net_sales || 0) + netSale;
      const nextCogs = Number(ex.total_cogs || 0) + cogs;
      rows[existingIdx] = {
        ...ex,
        tx_count: Number(ex.tx_count || 0) + 1,
        net_sales: nextNet,
        total_cogs: nextCogs,
        gross_profit: nextNet - nextCogs
      };
    } else {
      rows.unshift({
        summary_key: summaryKey,
        date: dateStr,
        outlet_id: outletId,
        tx_count: 1,
        net_sales: netSale,
        total_cogs: cogs,
        gross_profit: netSale - cogs,
        expense_total: 0,
        void_count: 0
      });
    }
    await putItem(STORES.MASTER, { key: 'summary_rows', data: rows, updated_at: new Date().toISOString() });

    return updatedBoot;
  }
};
