import React, { useState, useMemo, lazy, Suspense } from 'react';
import { PackagePlus, Plus, Minus, Camera, Search, ClipboardList, ArrowRightLeft, Layers } from 'lucide-react';
import { useAuth } from '../store/AuthContext.jsx';
import { callGasApi } from '../services/gasClient.mjs';
import { offlineDb } from '../services/offlineDb.mjs';
import { formatRupiah, getDriveCdnUrl } from '../utils/pricing.mjs';

const BarcodeScannerModal = lazy(() => import('../components/BarcodeScannerModal.jsx').then((m) => ({ default: m.BarcodeScannerModal })));

export function InventoryPage() {
  const { session, user, bootstrapData, isOnline } = useAuth();
  const [subTab, setSubTab] = useState('CATALOG'); // CATALOG | OPNAME | LEDGER | TRANSFER
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [scanTarget, setScanTarget] = useState(null);
  const [form, setForm] = useState({
    name: '', sku: '', barcode: '', variant_name: 'Standard',
    cogs: '', sell_price: '', initial_stock: '10', drive_image_id: ''
  });
  const [opnameQtyMap, setOpnameQtyMap] = useState({});
  const [ledgerRows, setLedgerRows] = useState([]);
  const [transferForm, setTransferForm] = useState({ from_outlet_id: 'OUTLET_MAIN', to_outlet_id: '', variant_id: '', qty: '1' });
  const [variantModal, setVariantModal] = useState(null);
  const [varForm, setVarForm] = useState({ variant_name: '', sku: '', barcode: '', cogs: '', sell_price: '', initial_stock: '0' });

  const products = bootstrapData?.products || [];
  const variants = bootstrapData?.variants || [];
  const stockBalances = bootstrapData?.stock_balances || [];
  const outlets = bootstrapData?.outlets || [{ outlet_id: 'OUTLET_MAIN', name: 'KIZIY Store Pusat' }];
  const outletId = user?.outlet_id === 'ALL' ? 'OUTLET_MAIN' : (user?.outlet_id || 'OUTLET_MAIN');

  const handleFieldChange = (field, val) => setForm((prev) => ({ ...prev, [field]: val }));
  const handleSearchChange = (e) => setSearch(e.target.value);
  const handleOpenScanNew = () => setScanTarget('NEW_PRODUCT');
  const handleOpenScanSearch = () => setScanTarget('SEARCH_EDIT');
  const handleCloseScanner = () => setScanTarget(null);

  const handleBarcodeDetected = (code) => {
    if (scanTarget === 'NEW_PRODUCT') {
      handleFieldChange('barcode', code);
      if (!form.sku) handleFieldChange('sku', code);
    } else if (scanTarget === 'SEARCH_EDIT') {
      setSearch(code);
    }
  };

  const filteredVariants = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return variants;
    return variants.filter((v) => {
      const prod = products.find((p) => p.product_id === v.product_id) || {};
      return String(prod.name || '').toLowerCase().includes(q) ||
        String(v.sku || '').toLowerCase().includes(q) ||
        String(v.barcode || '').toLowerCase().includes(q);
    });
  }, [variants, products, search]);

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

  const handleAddVariantSubmit = async (e) => {
    e.preventDefault();
    if (!isOnline || !variantModal) return;
    try {
      setSaving(true);
      await callGasApi('inventory.add_variant', {
        product_id: variantModal.product_id,
        outlet_id: outletId,
        ...varForm
      }, session.token);
      setVariantModal(null);
      window.location.reload();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitOpname = async () => {
    if (!isOnline) return;
    const items = Object.keys(opnameQtyMap).map((vid) => {
      const v = variants.find((x) => x.variant_id === vid);
      return { variant_id: vid, physical_qty: Number(opnameQtyMap[vid]), cogs: Number(v?.cogs || 0) };
    });
    if (items.length === 0) return;
    try {
      setSaving(true);
      await callGasApi('opname.submit', { outlet_id: outletId, items }, session.token);
      alert('Stock Opname berhasil disimpan!');
      setOpnameQtyMap({});
      window.location.reload();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleLoadLedger = async () => {
    setSubTab('LEDGER');
    if (!isOnline || !session?.token) return;
    try {
      const rows = await callGasApi('inventory.ledger', { limit: 50 }, session.token);
      setLedgerRows(rows || []);
    } catch (err) {
      console.warn('Gagal memuat Kartu Stok:', err.message);
    }
  };

  const handleTransferSubmit = async (e) => {
    e.preventDefault();
    if (!isOnline) return;
    try {
      setSaving(true);
      await callGasApi('inventory.transfer_stock', transferForm, session.token);
      alert('Transfer stok antar cabang berhasil!');
      window.location.reload();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900">Inventori, Opname & Transfer Stok</h2>
          <p className="text-xs text-slate-500">Outlet aktif: {outletId}</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button type="button" onClick={() => setSubTab('CATALOG')} className={subTab === 'CATALOG' ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white' : 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border text-slate-700'}>
            Katalog & Stok
          </button>
          <button type="button" onClick={() => setSubTab('OPNAME')} className={subTab === 'OPNAME' ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white flex items-center gap-1' : 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border text-slate-700 flex items-center gap-1'}>
            <ClipboardList className="w-3.5 h-3.5" />
            <span>Stock Opname</span>
          </button>
          <button type="button" onClick={handleLoadLedger} className={subTab === 'LEDGER' ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white' : 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border text-slate-700'}>
            Kartu Stok
          </button>
          <button type="button" onClick={() => setSubTab('TRANSFER')} className={subTab === 'TRANSFER' ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white flex items-center gap-1' : 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border text-slate-700 flex items-center gap-1'}>
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Transfer</span>
          </button>
        </div>
      </div>

      {subTab === 'CATALOG' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input type="text" value={search} onChange={handleSearchChange} placeholder="Cari / scan barcode stok..." className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl" />
              </div>
              <button type="button" onClick={handleOpenScanSearch} className="px-3 py-2 bg-slate-900 text-white text-xs font-semibold rounded-xl flex items-center gap-1">
                <Camera className="w-4 h-4" />
                <span>Scan Cari</span>
              </button>
            </div>
            <button type="button" onClick={() => setShowAdd(!showAdd)} className="px-4 py-2 bg-brand-600 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5">
              <PackagePlus className="w-4 h-4" />
              <span>Tambah Produk</span>
            </button>
          </div>

          {showAdd && (
            <form onSubmit={handleSaveProduct} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
              <input type="text" placeholder="Nama Produk" value={form.name} onChange={(e) => handleFieldChange('name', e.target.value)} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" required />
              <input type="text" placeholder="SKU (misal: KML-01)" value={form.sku} onChange={(e) => handleFieldChange('sku', e.target.value)} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" required />
              <div className="flex gap-1.5">
                <input type="text" placeholder="Barcode" value={form.barcode} onChange={(e) => handleFieldChange('barcode', e.target.value)} className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                <button type="button" onClick={handleOpenScanNew} className="px-2.5 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center gap-1">
                  <Camera className="w-3.5 h-3.5" />
                  <span>Scan</span>
                </button>
              </div>
              <input type="text" placeholder="Varian (misal: Hitam / L)" value={form.variant_name} onChange={(e) => handleFieldChange('variant_name', e.target.value)} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
              <input type="number" placeholder="HPP / COGS (Rp)" value={form.cogs} onChange={(e) => handleFieldChange('cogs', e.target.value)} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" required />
              <input type="number" placeholder="Harga Jual (Rp)" value={form.sell_price} onChange={(e) => handleFieldChange('sell_price', e.target.value)} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" required />
              <input type="number" placeholder="Stok Awal" value={form.initial_stock} onChange={(e) => handleFieldChange('initial_stock', e.target.value)} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
              <div className="md:col-span-2 flex items-center gap-3">
                <input type="file" accept="image/*" onChange={handleImageUpload} className="text-xs" />
                {form.drive_image_id && <span className="text-xs text-emerald-600 font-semibold">Foto terupload ke Drive!</span>}
              </div>
              <div className="md:col-span-3 flex justify-end">
                <button type="submit" disabled={saving} className="px-5 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl">
                  {saving ? 'Menyimpan...' : 'Simpan Produk'}
                </button>
              </div>
            </form>
          )}

          <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="p-3">Produk</th>
                  <th className="p-3">SKU / Barcode</th>
                  <th className="p-3">HPP</th>
                  <th className="p-3">Harga Jual</th>
                  <th className="p-3">Stok</th>
                  <th className="p-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredVariants.map((v) => {
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
                      <td className="p-3 text-right space-x-1">
                        <button type="button" onClick={() => setVariantModal(prod)} className="px-2 py-1 rounded bg-indigo-50 text-indigo-700 text-[11px] font-semibold" title="Tambah Varian Produk">
                          <Layers className="w-3 h-3 inline mr-0.5" />+Var
                        </button>
                        <button type="button" onClick={() => handleAdjustStock(v.variant_id, -1)} className="p-1.5 rounded bg-slate-100 hover:bg-slate-200"><Minus className="w-3 h-3" /></button>
                        <button type="button" onClick={() => handleAdjustStock(v.variant_id, 1)} className="p-1.5 rounded bg-slate-100 hover:bg-slate-200"><Plus className="w-3 h-3" /></button>
                      </td>
                    </tr>
                  );
                })}
                {filteredVariants.length === 0 && (
                  <tr><td colSpan="6" className="p-8 text-center text-slate-400">Belum ada data produk.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {subTab === 'OPNAME' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-4 shadow-sm">
          <div className="flex justify-between items-center">
            <p className="text-xs font-bold text-slate-700">Input Stok Fisik Gudang/Toko</p>
            <button type="button" onClick={handleSubmitOpname} disabled={saving} className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-xl">
              {saving ? 'Menyimpan...' : 'Simpan Stock Opname'}
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b text-slate-600">
                <tr><th className="p-2.5">SKU</th><th className="p-2.5">Stok Sistem</th><th className="p-2.5">Stok Fisik</th></tr>
              </thead>
              <tbody className="divide-y">
                {variants.map((v) => {
                  const bal = stockBalances.find((s) => s.balance_key === `${outletId}|${v.variant_id}`);
                  const sysQty = bal ? Number(bal.qty_on_hand || 0) : 0;
                  return (
                    <tr key={v.variant_id}>
                      <td className="p-2.5 font-semibold">{v.sku} ({v.variant_name})</td>
                      <td className="p-2.5">{sysQty}</td>
                      <td className="p-2.5">
                        <input type="number" placeholder={String(sysQty)} value={opnameQtyMap[v.variant_id] ?? ''} onChange={(e) => setOpnameQtyMap({ ...opnameQtyMap, [v.variant_id]: e.target.value })} className="w-24 px-2 py-1 border rounded-lg text-xs" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subTab === 'LEDGER' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b text-slate-600">
              <tr><th className="p-3">Waktu</th><th className="p-3">Tipe</th><th className="p-3">Varian</th><th className="p-3">Delta</th><th className="p-3">Stok Akhir</th><th className="p-3">Catatan</th></tr>
            </thead>
            <tbody className="divide-y">
              {ledgerRows.map((l) => (
                <tr key={l.ledger_id}>
                  <td className="p-3 text-slate-500">{String(l.created_at || '').slice(0, 16).replace('T', ' ')}</td>
                  <td className="p-3 font-semibold">{l.movement_type}</td>
                  <td className="p-3">{l.variant_id}</td>
                  <td className={Number(l.qty_delta) >= 0 ? 'p-3 font-bold text-emerald-600' : 'p-3 font-bold text-rose-600'}>{l.qty_delta}</td>
                  <td className="p-3 font-bold">{l.stock_after}</td>
                  <td className="p-3 text-slate-600">{l.notes}</td>
                </tr>
              ))}
              {ledgerRows.length === 0 && (
                <tr><td colSpan="6" className="p-6 text-center text-slate-400">Belum ada catatan mutasi stok.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {subTab === 'TRANSFER' && (
        <form onSubmit={handleTransferSubmit} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3 max-w-lg">
          <p className="text-sm font-bold text-slate-900">Transfer Stok Antar Cabang</p>
          <div className="grid grid-cols-2 gap-3">
            <select value={transferForm.from_outlet_id} onChange={(e) => setTransferForm({ ...transferForm, from_outlet_id: e.target.value })} className="px-3 py-2 text-xs border rounded-lg bg-white">
              {outlets.map((o) => <option key={o.outlet_id} value={o.outlet_id}>Dari: {o.name}</option>)}
            </select>
            <input type="text" placeholder="ID Outlet Tujuan (misal: OUTLET_B)" value={transferForm.to_outlet_id} onChange={(e) => setTransferForm({ ...transferForm, to_outlet_id: e.target.value })} className="px-3 py-2 text-xs border rounded-lg" required />
          </div>
          <select value={transferForm.variant_id} onChange={(e) => setTransferForm({ ...transferForm, variant_id: e.target.value })} className="w-full px-3 py-2 text-xs border rounded-lg bg-white" required>
            <option value="">-- Pilih Varian Produk --</option>
            {variants.map((v) => <option key={v.variant_id} value={v.variant_id}>{v.sku} - {v.variant_name}</option>)}
          </select>
          <input type="number" min="1" value={transferForm.qty} onChange={(e) => setTransferForm({ ...transferForm, qty: e.target.value })} placeholder="Qty Transfer" className="w-full px-3 py-2 text-xs border rounded-lg" required />
          <button type="submit" disabled={saving} className="px-4 py-2 bg-brand-600 text-white text-xs font-semibold rounded-xl">
            {saving ? 'Memproses...' : 'Kirim Transfer Stok'}
          </button>
        </form>
      )}

      {variantModal && (
        <div className="fixed inset-0 bg-slate-950/60 flex items-center justify-center p-4 z-50">
          <form onSubmit={handleAddVariantSubmit} className="bg-white rounded-2xl p-5 w-full max-w-md space-y-3 shadow-xl">
            <h3 className="font-bold text-sm">Tambah Varian: {variantModal.name}</h3>
            <input type="text" placeholder="Nama Varian (misal: Biru / XL)" value={varForm.variant_name} onChange={(e) => setVarForm({ ...varForm, variant_name: e.target.value })} className="w-full px-3 py-2 text-xs border rounded-lg" required />
            <input type="text" placeholder="SKU Varian" value={varForm.sku} onChange={(e) => setVarForm({ ...varForm, sku: e.target.value })} className="w-full px-3 py-2 text-xs border rounded-lg" required />
            <input type="text" placeholder="Barcode" value={varForm.barcode} onChange={(e) => setVarForm({ ...varForm, barcode: e.target.value })} className="w-full px-3 py-2 text-xs border rounded-lg" />
            <div className="grid grid-cols-2 gap-2">
              <input type="number" placeholder="HPP" value={varForm.cogs} onChange={(e) => setVarForm({ ...varForm, cogs: e.target.value })} className="px-3 py-2 text-xs border rounded-lg" required />
              <input type="number" placeholder="Harga Jual" value={varForm.sell_price} onChange={(e) => setVarForm({ ...varForm, sell_price: e.target.value })} className="px-3 py-2 text-xs border rounded-lg" required />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setVariantModal(null)} className="px-3 py-2 bg-slate-100 rounded-xl text-xs">Batal</button>
              <button type="submit" disabled={saving} className="px-4 py-2 bg-brand-600 text-white rounded-xl text-xs font-semibold">Simpan Varian</button>
            </div>
          </form>
        </div>
      )}

      {scanTarget && (
        <Suspense fallback={null}>
          <BarcodeScannerModal title={scanTarget === 'NEW_PRODUCT' ? 'Scan Barcode Produk Baru' : 'Scan Barcode untuk Cari / Edit Stok'} onDetected={handleBarcodeDetected} onClose={handleCloseScanner} />
        </Suspense>
      )}
    </div>
  );
}
