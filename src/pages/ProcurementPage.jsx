import React, { useState, useEffect, useCallback } from 'react';
import { Truck, ClipboardCheck, Wallet, Camera } from 'lucide-react';
import { useAuth } from '../store/AuthContext.jsx';
import { callGasApi } from '../services/gasClient.mjs';
import { formatRupiah } from '../utils/pricing.mjs';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal.jsx';

export function ProcurementPage() {
  const { session, isOnline, bootstrapData, activeShift } = useAuth();
  const [pos, setPos] = useState([]);
  const [poVariant, setPoVariant] = useState('');
  const [poQty, setPoQty] = useState('10');
  const [poCost, setPoCost] = useState('50000');
  const [expCategory, setExpCategory] = useState('Operasional');
  const [expAmount, setExpAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  const variants = bootstrapData?.variants || [];

  const loadPos = useCallback(async () => {
    if (!isOnline || !session?.token) return;
    try {
      const list = await callGasApi('po.list', {}, session.token);
      setPos(list || []);
    } catch (err) {
      console.warn('Gagal muat PO:', err.message);
    }
  }, [isOnline, session?.token]);

  useEffect(() => {
    loadPos();
  }, [loadPos]);

  const handleCreatePo = async (e) => {
    e.preventDefault();
    if (!poVariant || !isOnline) return;
    setLoading(true);
    try {
      await callGasApi('po.create', {
        items: [{ variant_id: poVariant, qty_ordered: Number(poQty), unit_cost: Number(poCost) }]
      }, session.token);
      await loadPos();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReceivePo = async (poId) => {
    if (!isOnline) return;
    setLoading(true);
    try {
      await callGasApi('po.receive', { po_id: poId }, session.token);
      await loadPos();
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRecordExpense = async (e) => {
    e.preventDefault();
    if (!isOnline || !expAmount) return;
    setLoading(true);
    try {
      await callGasApi('expense.record', {
        shift_id: activeShift?.shift_id || '',
        category: expCategory,
        amount: Number(expAmount)
      }, session.token);
      setExpAmount('');
      alert('Pengeluaran tercatat & Daily_Summary diperbarui!');
    } catch (err) {
      alert(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenScanner = () => setScannerOpen(true);
  const handleCloseScanner = () => setScannerOpen(false);
  const handleBarcodeDetected = (code) => {
    const match = variants.find((v) => String(v.barcode) === code || String(v.sku) === code);
    if (match) {
      setPoVariant(match.variant_id);
    } else {
      alert('Produk dengan barcode ' + code + ' tidak ditemukan di katalog.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={handleCreatePo} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Truck className="w-4 h-4 text-brand-600" />
            <span>Buat Purchase Order (PO)</span>
          </h3>
          <div className="flex gap-2">
            <select value={poVariant} onChange={(e) => setPoVariant(e.target.value)} className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white" required>
              <option value="">-- Pilih Produk / Varian --</option>
              {variants.map((v) => (
                <option key={v.variant_id} value={v.variant_id}>{v.sku} - {v.variant_name}</option>
              ))}
            </select>
            <button type="button" onClick={handleOpenScanner} className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1" title="Scan Barcode Produk">
              <Camera className="w-3.5 h-3.5" />
              <span>Scan</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" min="1" value={poQty} onChange={(e) => setPoQty(e.target.value)} placeholder="Qty Order" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" required />
            <input type="number" min="0" value={poCost} onChange={(e) => setPoCost(e.target.value)} placeholder="Harga Beli/Unit" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" required />
          </div>
          <button type="submit" disabled={loading} className="px-4 py-2 bg-brand-600 text-white text-xs font-semibold rounded-xl">
            Terbitkan PO
          </button>
        </form>

        <form onSubmit={handleRecordExpense} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-rose-600" />
            <span>Catat Biaya Operasional (Expenses)</span>
          </h3>
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={expCategory} onChange={(e) => setExpCategory(e.target.value)} placeholder="Kategori (Listrik/Plastik/dll)" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" required />
            <input type="number" min="0" value={expAmount} onChange={(e) => setExpAmount(e.target.value)} placeholder="Nominal (Rp)" className="px-3 py-2 text-xs border border-slate-300 rounded-lg" required />
          </div>
          <button type="submit" disabled={loading} className="px-4 py-2 bg-rose-600 text-white text-xs font-semibold rounded-xl">
            Simpan Pengeluaran
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
        <div className="px-4 py-3 border-b border-slate-200 font-bold text-xs text-slate-700 flex items-center gap-2">
          <ClipboardCheck className="w-4 h-4 text-emerald-600" />
          <span>Daftar Purchase Order Terbaru</span>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
            <tr>
              <th className="p-3">No. PO</th>
              <th className="p-3">Total Biaya</th>
              <th className="p-3">Status</th>
              <th className="p-3 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {pos.map((p) => (
              <tr key={p.po_id}>
                <td className="p-3 font-semibold text-slate-900">{p.po_id}</td>
                <td className="p-3 font-bold">{formatRupiah(p.total_cost)}</td>
                <td className="p-3">
                  <span className={p.status === 'RECEIVED' ? 'px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold' : 'px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold'}>
                    {p.status}
                  </span>
                </td>
                <td className="p-3 text-right">
                  {p.status !== 'RECEIVED' && (
                    <button type="button" onClick={() => handleReceivePo(p.po_id)} className="px-3 py-1 bg-emerald-600 text-white rounded-lg font-semibold">
                      Terima Barang
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {pos.length === 0 && (
              <tr><td colSpan="4" className="p-6 text-center text-slate-400">Belum ada Purchase Order.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {scannerOpen && (
        <BarcodeScannerModal title="Scan Barcode untuk Purchase Order" onDetected={handleBarcodeDetected} onClose={handleCloseScanner} />
      )}
    </div>
  );
}
