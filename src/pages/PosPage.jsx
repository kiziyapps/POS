import React, { useState, useMemo } from 'react';
import { Search, ShoppingBag, Trash2, Plus, Minus, PauseCircle, PlayCircle, Printer, MessageCircle, CheckCircle2, AlertTriangle, Camera } from 'lucide-react';
import { useAuth } from '../store/AuthContext.jsx';
import { callGasApi, generateOfflineReceiptNo } from '../services/gasClient.mjs';
import { offlineDb } from '../services/offlineDb.mjs';
import { buildInvoiceWaUrl } from '../services/whatsapp.mjs';
import { getDeviceId } from '../config/env.mjs';
import { formatRupiah, getDriveCdnUrl, resolveVariantPrice } from '../utils/pricing.mjs';
import { BarcodeScannerModal } from '../components/BarcodeScannerModal.jsx';

const HELD_CARTS_KEY = 'kiziy_held_carts';

export function PosPage() {
  const { session, user, bootstrapData, activeShift, isOnline, refreshQueueCount } = useAuth();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('ALL');
  const [cart, setCart] = useState([]);
  const [cartDiscount, setCartDiscount] = useState(0);
  const [applyTax, setApplyTax] = useState(false);
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [payments, setPayments] = useState([{ method_id: 'PM_CASH', amount: '' }]);
  const [processing, setProcessing] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [receiptModal, setReceiptModal] = useState(null);
  const [heldCarts, setHeldCarts] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(HELD_CARTS_KEY) || '[]');
    } catch {
      return [];
    }
  });

  const products = bootstrapData?.products || [];
  const variants = bootstrapData?.variants || [];
  const categories = bootstrapData?.categories || [];
  const tierPrices = bootstrapData?.tier_prices || [];
  const stockBalances = bootstrapData?.stock_balances || [];
  const paymentMethods = bootstrapData?.payment_methods || [{ method_id: 'PM_CASH', name: 'Tunai' }];
  const outletId = user?.outlet_id === 'ALL' ? 'OUTLET_MAIN' : (user?.outlet_id || 'OUTLET_MAIN');

  const catalogItems = useMemo(() => {
    return variants
      .filter((v) => v.is_active !== false)
      .map((v) => {
        const prod = products.find((p) => p.product_id === v.product_id) || {};
        const bal = stockBalances.find((s) => s.balance_key === `${outletId}|${v.variant_id}`);
        return {
          ...v,
          product_name: prod.name || v.sku,
          category_id: prod.category_id || 'CAT_GENERAL',
          drive_image_id: prod.drive_image_id || '',
          stock_qty: bal ? Number(bal.qty_on_hand || 0) : 0
        };
      });
  }, [variants, products, stockBalances, outletId]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalogItems.filter((item) => {
      const matchCat = selectedCategory === 'ALL' || item.category_id === selectedCategory;
      const matchSearch = !q ||
        String(item.product_name).toLowerCase().includes(q) ||
        String(item.sku).toLowerCase().includes(q) ||
        String(item.barcode).toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [catalogItems, selectedCategory, search]);

  const addToCart = (item) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.variant_id === item.variant_id);
      const nextQty = existing ? existing.qty + 1 : 1;
      const resolvedPrice = resolveVariantPrice(item, nextQty, tierPrices);
      if (existing) {
        return prev.map((c) => c.variant_id === item.variant_id
          ? { ...c, qty: nextQty, unit_price: resolvedPrice, line_total: nextQty * resolvedPrice }
          : c
        );
      }
      return [...prev, {
        variant_id: item.variant_id,
        sku: item.sku,
        product_name_snapshot: item.product_name,
        variant_name: item.variant_name,
        qty: 1,
        unit_name: 'pcs',
        base_qty_deducted: 1,
        unit_price: resolvedPrice,
        cogs_snapshot: Number(item.cogs || 0),
        discount_amount: 0,
        line_total: resolvedPrice
      }];
    });
  };

  const updateCartQty = (variantId, delta) => {
    const catalogItem = catalogItems.find((i) => i.variant_id === variantId);
    setCart((prev) => prev
      .map((c) => {
        if (c.variant_id !== variantId) return c;
        const nextQty = c.qty + delta;
        if (nextQty <= 0) return null;
        const resolvedPrice = catalogItem ? resolveVariantPrice(catalogItem, nextQty, tierPrices) : c.unit_price;
        return {
          ...c,
          qty: nextQty,
          base_qty_deducted: nextQty,
          unit_price: resolvedPrice,
          line_total: nextQty * resolvedPrice
        };
      })
      .filter(Boolean)
    );
  };

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter' && search.trim()) {
      const exact = catalogItems.find((i) => i.barcode === search.trim() || i.sku === search.trim());
      if (exact) {
        addToCart(exact);
        setSearch('');
      }
    }
  };

  const subtotal = cart.reduce((sum, c) => sum + Number(c.line_total || 0), 0);
  const discountVal = Math.min(subtotal, Number(cartDiscount || 0));
  const afterDiscount = Math.max(0, subtotal - discountVal);
  const taxTotal = applyTax ? Math.round(afterDiscount * 0.11) : 0;
  const grandTotal = afterDiscount + taxTotal;

  const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const changeAmount = Math.max(0, totalPaid - grandTotal);

  const handleHoldCart = () => {
    if (cart.length === 0) return;
    const next = [...heldCarts, { id: Date.now(), label: `Hold ${heldCarts.length + 1}`, cart, created_at: new Date().toISOString() }];
    setHeldCarts(next);
    localStorage.setItem(HELD_CARTS_KEY, JSON.stringify(next));
    setCart([]);
  };

  const handleResumeHeld = (heldId) => {
    const target = heldCarts.find((h) => h.id === heldId);
    if (!target) return;
    setCart(target.cart);
    const next = heldCarts.filter((h) => h.id !== heldId);
    setHeldCarts(next);
    localStorage.setItem(HELD_CARTS_KEY, JSON.stringify(next));
  };

  const handleAddPaymentSplit = () => {
    const defaultMethod = paymentMethods[0]?.method_id || 'PM_CASH';
    setPayments((prev) => [...prev, { method_id: defaultMethod, amount: '' }]);
  };

  const handlePaymentChange = (idx, field, val) => {
    setPayments((prev) => prev.map((p, i) => i === idx ? { ...p, [field]: val } : p));
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setProcessing(true);

    const normalizedPayments = payments.map((p) => ({
      method_id: p.method_id,
      amount: Number(p.amount || grandTotal)
    }));

    const txPayload = {
      client_tx_uuid: crypto.randomUUID ? crypto.randomUUID() : ('uuid-' + Date.now()),
      offline_receipt_no: generateOfflineReceiptNo(getDeviceId()),
      outlet_id: outletId,
      shift_id: activeShift?.shift_id || '',
      subtotal,
      discount_total: discountVal,
      tax_total: taxTotal,
      rounding: 0,
      grand_total: grandTotal,
      customer_email: customerEmail.trim(),
      customer_phone: customerPhone.trim(),
      items: cart,
      payments: normalizedPayments,
      created_at: new Date().toISOString()
    };

    try {
      if (isOnline && session?.token) {
        const res = await callGasApi('pos.checkout', txPayload, session.token);
        setReceiptModal({
          tx: res.tx,
          items: res.items || cart,
          change: changeAmount,
          email_result: res.email_result,
          customer_phone: customerPhone.trim(),
          offline_saved: false
        });
      } else {
        await offlineDb.enqueueOfflineTx(txPayload);
        await refreshQueueCount();
        setReceiptModal({
          tx: { ...txPayload, tx_id: txPayload.offline_receipt_no, sync_status: 'PENDING_OFFLINE' },
          items: cart,
          change: changeAmount,
          email_result: { sent: false, fallback_wa: true, reason: 'OFFLINE_MODE' },
          customer_phone: customerPhone.trim(),
          offline_saved: true
        });
      }
      setCart([]);
      setCartDiscount(0);
      setCustomerEmail('');
      setCustomerPhone('');
      setPayments([{ method_id: paymentMethods[0]?.method_id || 'PM_CASH', amount: '' }]);
    } catch (err) {
      await offlineDb.enqueueOfflineTx(txPayload);
      await refreshQueueCount();
      setReceiptModal({
        tx: { ...txPayload, tx_id: txPayload.offline_receipt_no, sync_status: 'PENDING_OFFLINE' },
        items: cart,
        change: changeAmount,
        email_result: { sent: false, fallback_wa: true, reason: err.message },
        customer_phone: customerPhone.trim(),
        offline_saved: true
      });
      setCart([]);
    } finally {
      setProcessing(false);
    }
  };

  const handleSearchInput = (e) => setSearch(e.target.value);
  const handleSelectAllCat = () => setSelectedCategory('ALL');
  const handleDiscountInput = (e) => setCartDiscount(e.target.value);
  const handleToggleTax = (e) => setApplyTax(e.target.checked);
  const handleEmailInput = (e) => setCustomerEmail(e.target.value);
  const handlePhoneInput = (e) => setCustomerPhone(e.target.value);
  const handleCloseReceipt = () => setReceiptModal(null);
  const handlePrintReceipt = () => window.print();
  const handleOpenScanner = () => setScannerOpen(true);
  const handleCloseScanner = () => setScannerOpen(false);

  const handleBarcodeDetected = (code) => {
    const exact = catalogItems.find((i) => String(i.barcode) === code || String(i.sku) === code);
    if (exact) {
      addToCart(exact);
      setSearch('');
    } else {
      setSearch(code);
    }
  };

  const categoryButtons = categories.map((cat) => {
    const isSelected = selectedCategory === cat.category_id;
    const btnCls = isSelected
      ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white'
      : 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700';
    return (
      <button key={cat.category_id} type="button" onClick={() => setSelectedCategory(cat.category_id)} className={btnCls}>
        {cat.name}
      </button>
    );
  });

  const productCards = filteredItems.map((item) => {
    const imgUrl = getDriveCdnUrl(item.drive_image_id, 300);
    return (
      <button key={item.variant_id} type="button" onClick={() => addToCart(item)} className="bg-white border border-slate-200 hover:border-brand-500 rounded-xl p-3 text-left transition shadow-sm flex flex-col justify-between">
        <div>
          {imgUrl ? (
            <img src={imgUrl} alt={item.product_name} className="w-full h-24 object-cover rounded-lg mb-2 bg-slate-100" />
          ) : (
            <div className="w-full h-24 rounded-lg mb-2 bg-slate-100 flex items-center justify-center text-slate-400">
              <ShoppingBag className="w-7 h-7" />
            </div>
          )}
          <p className="font-semibold text-xs text-slate-900 line-clamp-2">{item.product_name}</p>
          <p className="text-[11px] text-slate-500">{item.variant_name} • {item.sku}</p>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="font-bold text-xs text-brand-600">{formatRupiah(item.sell_price)}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Stok: {item.stock_qty}</span>
        </div>
      </button>
    );
  });

  const cartRows = cart.map((c) => (
    <div key={c.variant_id} className="flex items-center justify-between gap-2 py-2 border-b border-slate-100">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-slate-900 truncate">{c.product_name_snapshot}</p>
        <p className="text-[11px] text-slate-500">{formatRupiah(c.unit_price)} x {c.qty}</p>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => updateCartQty(c.variant_id, -1)} className="p-1 rounded bg-slate-100 hover:bg-slate-200">
          <Minus className="w-3 h-3" />
        </button>
        <span className="w-6 text-center text-xs font-bold">{c.qty}</span>
        <button type="button" onClick={() => updateCartQty(c.variant_id, 1)} className="p-1 rounded bg-slate-100 hover:bg-slate-200">
          <Plus className="w-3 h-3" />
        </button>
      </div>
      <p className="text-xs font-bold text-slate-900 w-20 text-right">{formatRupiah(c.line_total)}</p>
    </div>
  ));

  return (
    <div className="max-w-7xl mx-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
      {/* Kiri: Katalog & Pencarian Barcode */}
      <div className="lg:col-span-7 space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input type="text" value={search} onChange={handleSearchInput} onKeyDown={handleSearchKeyDown} placeholder="Cari nama produk, SKU, atau scan barcode lalu tekan Enter..." className="w-full pl-9 pr-3 py-2 text-sm bg-white border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500" />
          </div>
          <button type="button" onClick={handleOpenScanner} className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5">
            <Camera className="w-4 h-4" />
            <span>Scan</span>
          </button>
          {heldCarts.length > 0 && (
            <button type="button" onClick={() => handleResumeHeld(heldCarts[0].id)} className="px-3 py-2 bg-amber-100 text-amber-800 rounded-xl text-xs font-semibold flex items-center gap-1">
              <PlayCircle className="w-4 h-4" />
              <span>Resume ({heldCarts.length})</span>
            </button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <button type="button" onClick={handleSelectAllCat} className={selectedCategory === 'ALL' ? 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-600 text-white' : 'px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-slate-200 text-slate-700'}>
            Semua
          </button>
          {categoryButtons}
        </div>

        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500">
            Belum ada produk ditemukan. Tambahkan produk di menu Produk & Stok.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {productCards}
          </div>
        )}
      </div>

      {/* Kanan: Keranjang & Multi-Payment */}
      <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-sm p-4 flex flex-col justify-between space-y-4">
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <h2 className="font-bold text-sm text-slate-900">Keranjang Belanja</h2>
            <div className="flex gap-2">
              <button type="button" onClick={handleHoldCart} disabled={cart.length === 0} className="px-2.5 py-1 text-xs rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 disabled:opacity-40">
                <PauseCircle className="w-3.5 h-3.5" />
                <span>Hold</span>
              </button>
              <button type="button" onClick={() => setCart([])} disabled={cart.length === 0} className="px-2.5 py-1 text-xs rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 flex items-center gap-1 disabled:opacity-40">
                <Trash2 className="w-3.5 h-3.5" />
                <span>Kosongkan</span>
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
            {cart.length === 0 ? (
              <p className="py-10 text-center text-xs text-slate-400">Pilih produk di sebelah kiri untuk mulai transaksi.</p>
            ) : cartRows}
          </div>
        </div>

        <div className="space-y-3 border-t border-slate-200 pt-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">Diskon (Rp)</label>
              <input type="number" min="0" value={cartDiscount} onChange={handleDiscountInput} className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg" />
            </div>
            <div className="flex items-end pb-1.5">
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input type="checkbox" checked={applyTax} onChange={handleToggleTax} className="rounded text-brand-600" />
                <span>Tambah PPN 11%</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input type="email" value={customerEmail} onChange={handleEmailInput} placeholder="Email Customer (Opsional)" className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg" />
            <input type="tel" value={customerPhone} onChange={handlePhoneInput} placeholder="No. WA Customer (08...)" className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg" />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-slate-600">Pembayaran (Multi-Payment)</span>
              <button type="button" onClick={handleAddPaymentSplit} className="text-[11px] font-semibold text-brand-600 hover:underline">
                + Split Bayar
              </button>
            </div>
            {payments.map((p, idx) => (
              <div key={idx} className="flex gap-2">
                <select value={p.method_id} onChange={(e) => handlePaymentChange(idx, 'method_id', e.target.value)} className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white">
                  {paymentMethods.map((pm) => (
                    <option key={pm.method_id} value={pm.method_id}>{pm.name}</option>
                  ))}
                </select>
                <input type="number" min="0" value={p.amount} onChange={(e) => handlePaymentChange(idx, 'amount', e.target.value)} placeholder={String(grandTotal)} className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg" />
              </div>
            ))}
          </div>

          <div className="bg-slate-50 p-3 rounded-xl space-y-1 text-xs">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span>{formatRupiah(subtotal)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>PPN (11%)</span>
              <span>{formatRupiah(taxTotal)}</span>
            </div>
            <div className="flex justify-between font-extrabold text-base text-slate-900 pt-1 border-t border-slate-200">
              <span>Total</span>
              <span>{formatRupiah(grandTotal)}</span>
            </div>
            {totalPaid > 0 && (
              <div className="flex justify-between text-emerald-700 font-semibold">
                <span>Kembalian</span>
                <span>{formatRupiah(changeAmount)}</span>
              </div>
            )}
          </div>

          <button type="button" onClick={handleCheckout} disabled={cart.length === 0 || processing} className="w-full py-3 bg-brand-600 hover:bg-brand-700 disabled:opacity-40 text-white font-bold rounded-xl text-sm transition">
            {processing ? 'Memproses Transaksi...' : 'Bayar & Cetak Struk'}
          </button>
        </div>
      </div>

      {/* Modal Struk & Fallback WhatsApp */}
      {receiptModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-5 space-y-4">
            <div className="text-center space-y-1">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
              <h3 className="font-bold text-lg text-slate-900">Transaksi Berhasil!</h3>
              <p className="text-xs text-slate-500">No: {receiptModal.tx.tx_id}</p>
              {receiptModal.offline_saved && (
                <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded-lg font-medium">
                  Disimpan di Antrian Offline. Akan otomatis sinkron saat internet aktif.
                </p>
              )}
              {receiptModal.tx.sync_status === 'NEEDS_STOCK_REVIEW' && (
                <p className="text-xs text-rose-700 bg-rose-50 p-2 rounded-lg font-medium flex items-center justify-center gap-1">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Stok minus terdeteksi (NEEDS_STOCK_REVIEW)</span>
                </p>
              )}
            </div>

            <div className="border-y border-dashed border-slate-300 py-3 space-y-1 text-xs">
              {receiptModal.items.map((it, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>{it.product_name_snapshot} x{it.qty}</span>
                  <span>{formatRupiah(it.line_total)}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold text-sm pt-2 border-t border-slate-200">
                <span>Grand Total</span>
                <span>{formatRupiah(receiptModal.tx.grand_total)}</span>
              </div>
              <div className="flex justify-between text-emerald-700">
                <span>Kembalian</span>
                <span>{formatRupiah(receiptModal.change)}</span>
              </div>
            </div>

            {receiptModal.email_result?.fallback_wa && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800">
                Invoice email belum terkirim ({receiptModal.email_result.reason}). Gunakan tombol WhatsApp di bawah untuk kirim struk langsung.
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={handlePrintReceipt} className="py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5">
                <Printer className="w-4 h-4" />
                <span>Cetak Struk</span>
              </button>
              <a href={buildInvoiceWaUrl(receiptModal.customer_phone, receiptModal.tx)} target="_blank" rel="noreferrer" className="py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5">
                <MessageCircle className="w-4 h-4" />
                <span>Kirim WhatsApp</span>
              </a>
            </div>

            <button type="button" onClick={handleCloseReceipt} className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold">
              Tutup & Transaksi Baru
            </button>
          </div>
        </div>
      )}

      {scannerOpen && (
        <BarcodeScannerModal title="Scan Barcode Penjualan" onDetected={handleBarcodeDetected} onClose={handleCloseScanner} />
      )}
    </div>
  );
}
