import React, { useState, useEffect, useCallback } from 'react';
import { Users, UserPlus, Tag } from 'lucide-react';
import { useAuth } from '../store/AuthContext.jsx';
import { callGasApi } from '../services/gasClient.mjs';

export function CrmPromoPage() {
  const { session, isOnline, bootstrapData } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [custForm, setCustForm] = useState({ name: '', phone: '', email: '', member_tier: 'SILVER' });
  const [promoForm, setPromoForm] = useState({ name: '', type: 'CART_DISCOUNT', discount_percent: '10' });
  const [saving, setSaving] = useState(false);

  const loadCustomers = useCallback(async () => {
    if (!isOnline || !session?.token) return;
    try {
      const list = await callGasApi('crm.list_customers', {}, session.token);
      setCustomers(list || []);
    } catch (err) {
      console.warn('Gagal muat pelanggan:', err.message);
    }
  }, [isOnline, session?.token]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handleSaveCustomer = async (e) => {
    e.preventDefault();
    if (!isOnline) return;
    setSaving(true);
    try {
      await callGasApi('crm.save_customer', custForm, session.token);
      setCustForm({ name: '', phone: '', email: '', member_tier: 'SILVER' });
      await loadCustomers();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSavePromo = async (e) => {
    e.preventDefault();
    if (!isOnline) return;
    setSaving(true);
    try {
      await callGasApi('crm.save_promo', {
        name: promoForm.name,
        type: promoForm.type,
        rules: { discount_percent: Number(promoForm.discount_percent || 0) }
      }, session.token);
      setPromoForm({ name: '', type: 'CART_DISCOUNT', discount_percent: '10' });
      alert('Promo berhasil disimpan!');
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Users className="w-5 h-5 text-brand-600" />
          <span>Pelanggan & Loyalty</span>
        </h2>

        <form onSubmit={handleSaveCustomer} className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 shadow-sm">
          <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <UserPlus className="w-4 h-4" /> Tambah Member Baru
          </p>
          <div className="grid grid-cols-2 gap-2">
            <input type="text" placeholder="Nama Pelanggan" value={custForm.name} onChange={(e) => setCustForm({ ...custForm, name: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" required />
            <input type="tel" placeholder="No. WA (08...)" value={custForm.phone} onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
            <input type="email" placeholder="Email" value={custForm.email} onChange={(e) => setCustForm({ ...custForm, email: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
            <select value={custForm.member_tier} onChange={(e) => setCustForm({ ...custForm, member_tier: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white">
              <option value="SILVER">SILVER</option>
              <option value="GOLD">GOLD</option>
              <option value="PLATINUM">PLATINUM</option>
            </select>
          </div>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-brand-600 text-white text-xs font-semibold rounded-xl">
            Simpan Member
          </button>
        </form>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="p-3">Nama</th>
                <th className="p-3">Tier</th>
                <th className="p-3">Poin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.map((c) => (
                <tr key={c.customer_id}>
                  <td className="p-3">
                    <p className="font-semibold text-slate-900">{c.name}</p>
                    <p className="text-[11px] text-slate-500">{c.phone}</p>
                  </td>
                  <td className="p-3 font-semibold text-brand-600">{c.member_tier}</td>
                  <td className="p-3 font-bold">{c.points_balance}</td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr><td colSpan="3" className="p-6 text-center text-slate-400">Belum ada member terdaftar.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
          <Tag className="w-5 h-5 text-emerald-600" />
          <span>Mesin Promo & Diskon</span>
        </h2>

        <form onSubmit={handleSavePromo} className="bg-white p-4 rounded-2xl border border-slate-200 space-y-3 shadow-sm">
          <input type="text" placeholder="Nama Promo (misal: Diskon Akhir Bulan)" value={promoForm.name} onChange={(e) => setPromoForm({ ...promoForm, name: e.target.value })} className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg" required />
          <div className="grid grid-cols-2 gap-2">
            <select value={promoForm.type} onChange={(e) => setPromoForm({ ...promoForm, type: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white">
              <option value="CART_DISCOUNT">Diskon Keranjang (%)</option>
              <option value="HAPPY_HOUR">Happy Hour</option>
              <option value="BUY_X_GET_Y">Buy X Get Y</option>
            </select>
            <input type="number" placeholder="Diskon %" value={promoForm.discount_percent} onChange={(e) => setPromoForm({ ...promoForm, discount_percent: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
          </div>
          <button type="submit" disabled={saving} className="px-4 py-2 bg-emerald-600 text-white text-xs font-semibold rounded-xl">
            Buat Promo
          </button>
        </form>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-2">
          <p className="text-xs font-bold text-slate-700">Promo Aktif ({bootstrapData?.promos?.length || 0})</p>
          {(bootstrapData?.promos || []).map((p) => (
            <div key={p.promo_id} className="p-2.5 bg-slate-50 rounded-xl flex justify-between text-xs">
              <span className="font-semibold text-slate-900">{p.name}</span>
              <span className="text-slate-500">{p.type}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
