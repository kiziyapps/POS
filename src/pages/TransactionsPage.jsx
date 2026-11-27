import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, Ban, MessageCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '../store/AuthContext.jsx';
import { callGasApi } from '../services/gasClient.mjs';
import { offlineDb } from '../services/offlineDb.mjs';
import { buildInvoiceWaUrl } from '../services/whatsapp.mjs';
import { formatRupiah } from '../utils/pricing.mjs';

export function TransactionsPage() {
  const { session, isOnline, hasPermission, refreshQueueCount } = useAuth();
  const [txs, setTxs] = useState([]);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    const q = await offlineDb.getOfflineQueue();
    setOfflineQueue(q);

    if (isOnline && session?.token) {
      setLoading(true);
      try {
        const list = await callGasApi('pos.list_recent', { limit: 50 }, session.token);
        setTxs(list || []);
      } catch (err) {
        console.warn('Gagal memuat transaksi:', err.message);
      } finally {
        setLoading(false);
      }
    }
  }, [isOnline, session?.token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSyncOfflineQueue = async () => {
    if (!isOnline || !session?.token) return;
    setLoading(true);
    try {
      for (const item of offlineQueue) {
        await callGasApi('pos.checkout', item, session.token);
        await offlineDb.removeOfflineTx(item.client_tx_uuid);
      }
      await refreshQueueCount();
      await loadData();
    } catch (err) {
      alert('Sinkronisasi sebagian gagal: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVoid = async (txId) => {
    const reason = window.prompt('Masukkan alasan Void transaksi ' + txId + ':');
    if (!reason) return;
    try {
      setLoading(true);
      await callGasApi('pos.void', { tx_id: txId, reason }, session.token);
      await loadData();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-slate-900">Riwayat Transaksi & Sinkronisasi</h2>
        <div className="flex gap-2">
          {offlineQueue.length > 0 && isOnline && (
            <button type="button" onClick={handleSyncOfflineQueue} disabled={loading} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4" />
              <span>Sync {offlineQueue.length} Antrian Offline</span>
            </button>
          )}
          <button type="button" onClick={loadData} disabled={loading} className="px-3 py-2 bg-white border border-slate-300 text-slate-700 text-xs font-semibold rounded-xl">
            Refresh
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
            <tr>
              <th className="p-3">No. Invoice</th>
              <th className="p-3">Waktu</th>
              <th className="p-3">Total</th>
              <th className="p-3">Status</th>
              <th className="p-3">Sync / Audit</th>
              <th className="p-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {txs.map((t) => (
              <tr key={t.tx_id} className="hover:bg-slate-50">
                <td className="p-3 font-semibold text-slate-900">
                  <div>{t.tx_id}</div>
                  {t.offline_receipt_no && <div className="text-[10px] text-slate-400">Offline: {t.offline_receipt_no}</div>}
                </td>
                <td className="p-3 text-slate-600">{String(t.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                <td className="p-3 font-bold text-slate-900">{formatRupiah(t.grand_total)}</td>
                <td className="p-3">
                  <span className={t.tx_status === 'VOID' ? 'px-2 py-0.5 rounded bg-rose-100 text-rose-700 font-semibold' : 'px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold'}>
                    {t.tx_status}
                  </span>
                </td>
                <td className="p-3">
                  {t.sync_status === 'NEEDS_STOCK_REVIEW' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">
                      <AlertTriangle className="w-3 h-3" />
                      <span>NEEDS_STOCK_REVIEW</span>
                    </span>
                  ) : (
                    <span className="text-slate-500">{t.sync_status}</span>
                  )}
                </td>
                <td className="p-3 text-right space-x-2">
                  <a href={buildInvoiceWaUrl('', t)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-semibold">
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>WA</span>
                  </a>
                  {t.tx_status !== 'VOID' && hasPermission('void.manage') && (
                    <button type="button" onClick={() => handleVoid(t.tx_id)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-50 text-rose-700 hover:bg-rose-100 font-semibold">
                      <Ban className="w-3.5 h-3.5" />
                      <span>Void</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {txs.length === 0 && (
              <tr>
                <td colSpan="6" className="p-8 text-center text-slate-400">Belum ada transaksi tercatat.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
