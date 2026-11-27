import React, { useState } from 'react';
import { PackagePlus, RefreshCw, Plus, Minus } from 'lucide-react';
import { useAuth } from '../store/AuthContext.jsx';
import { callGasApi } from '../services/gasClient.mjs';
import { offlineDb } from '../services/offlineDb.mjs';
import { formatRupiah, getDriveCdnUrl } from '../utils/pricing.mjs';

export function InventoryPage() {
  const { session, user, bootstrapData, isOnline } = useAuth();
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', sku: '', barcode: '', variant_name: 'Standard',
    cogs: '', sell_price: '', initial_stock: '10', drive_image_id: ''
  });

  const products = bootstrapData?.products || [];
  const variants = bootstrapData?.variants || [];
  const stockBalances = bootstrapData?.stock_balances || [];
  const outletId = user?.outlet_id === 'ALL' ? 'OUTLET_MAIN' : (user?.outlet_id || 'OUTLET_MAIN');

  const handleFieldChange = (field, val) => setForm((prev) => ({ ...prev, [field]: val }));

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !session?.token) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        setSaving(true);
        const res = await callGasApi('media.upload', {
          base64: reader.result,
          file_name: file.name,
          mime_type: file.type
        }, session.token);
        handleFieldChange('drive_image_id', res.file_id);
      } catch (err) {
        alert('Gagal upload foto: ' + err.message);
      } finally {
        setSaving(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!isOnline) {
      alert('Penambahan produk baru membutuhkan koneksi online.');
      return;
    }
    try {
      setSaving(true);
      await callGasApi('inventory.save_product', { ...form, outlet_id: outletId }, session.token);
      const fresh = await callGasApi('system.bootstrap', {}, session.token);
      await offlineDb.saveBootstrapData(fresh);
      window.location.reload();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAdjustStock = async (variantId, delta) => {
    if (!isOnline) {
      alert('Penyesuaian stok membutuhkan koneksi online.');
      return;
    }
    try {
      await callGasApi('inventory.adjust_stock', { variant_id: variantId, qty_delta: delta, outlet_id: outletId }, session.token);
      window.location.reload();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Master Produk & Stok Retail</h2>
          <p className="text-xs text-slate-500">Outlet aktif: {outletId}</p>
        </div>
        <button type="button" onClick={() => setShowAdd(!showAdd)} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5">
          <PackagePlus className="w-4 h-4" />
          <span>Tambah Produk</span>
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleSaveProduct} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
          <input type="text" placeholder="Nama Produk" value={form.name} onChange={(e) => handleFieldChange('name', e.target.value)} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" required />
          <input type="text" placeholder="SKU (misal: KML-01)" value={form.sku} onChange={(e) => handleFieldChange('sku', e.target.value)} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" required />
          <input type="text" placeholder="Barcode" value={form.barcode} onChange={(e) => handleFieldChange('barcode', e.target.value)} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
          <input type="text" placeholder="Varian (misal: Hitam / L)" value={form.variant_name} onChange={(e) => handleFieldChange('variant_name', e.target.value)} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
          <input type="number" placeholder="HPP / COGS (Rp)" value={form.cogs} onChange={(e) => handleFieldChange('cogs', e.target.value)} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" required />
          <input type="number" placeholder="Harga Jual (Rp)" value={form.sell_price} onChange={(e) => handleFieldChange('sell_price', e.target.value)} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" required />
          <input type="number" placeholder="Stok Awal" value={form.initial_stock} onChange={(e) => handleFieldChange('initial_stock', e.target.value)} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
          <div className="md:col-span-2 flex items-center gap-3">
            <input type="file" accept="image/*" onChange={handleImageUpload} className="text-xs" />
            {form.drive_image_id && <span className="text-xs text-emerald-600 font-semibold">Foto terupload ke Drive!</span>}
          </div>
          <div className="md:col-span-3 flex justify-end">
            <button type="submit" disabled={saving} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl">
              {saving ? 'Menyimpan...' : 'Simpan Produk'}
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
            <tr>
              <th className="p-3">Produk</th>
              <th className="p-3">SKU / Barcode</th>
              <th className="p-3">HPP</th>
              <th className="p-3">Harga Jual</th>
              <th className="p-3">Stok</th>
              <th className="p-3 text-right">Penyesuaian</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {variants.map((v) => {
              const prod = products.find((p) => p.product_id === v.product_id) || {};
              const bal = stockBalances.find((s) => s.balance_key === `${outletId}|${v.variant_id}`);
              const qty = bal ? Number(bal.qty_on_hand || 0) : 0;
              const imgUrl = getDriveCdnUrl(prod.drive_image_id, 100);
              return (
                <tr key={v.variant_id} className="hover:bg-slate-50">
                  <td className="p-3 flex items-center gap-2">
                    {imgUrl && <img src={imgUrl} alt={prod.name} className="w-8 h-8 rounded object-cover" />}
                    <div>
                      <p className="font-semibold text-slate-900">{prod.name || v.sku}</p>
                      <p className="text-[11px] text-slate-500">{v.variant_name}</p>
                    </div>
                  </td>
                  <td className="p-3 text-slate-600">{v.sku} / {v.barcode}</td>
                  <td className="p-3">{formatRupiah(v.cogs)}</td>
                  <td className="p-3 font-semibold text-slate-900">{formatRupiah(v.sell_price)}</td>
                  <td className="p-3 font-bold">
                    <span className={qty <= Number(v.min_stock || 5) ? 'text-rose-600' : 'text-emerald-700'}>{qty}</span>
                  </td>
                  <td className="p-3 text-right">
                    <div className="inline-flex gap-1">
                      <button type="button" onClick={() => handleAdjustStock(v.variant_id, -1)} className="p-1.5 rounded bg-slate-100 hover:bg-slate-200"><Minus className="w-3 h-3" /></button>
                      <button type="button" onClick={() => handleAdjustStock(v.variant_id, 1)} className="p-1.5 rounded bg-slate-100 hover:bg-slate-200"><Plus className="w-3 h-3" /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {variants.length === 0 && (
              <tr>
                <td colSpan="6" className="p-8 text-center text-slate-400">Belum ada data produk.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
