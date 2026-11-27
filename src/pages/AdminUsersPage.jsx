import React, { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, UserPlus } from 'lucide-react';
import { useAuth } from '../store/AuthContext.jsx';
import { callGasApi } from '../services/gasClient.mjs';

export function AdminUsersPage() {
  const { session, isOnline, bootstrapData } = useAuth();
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({
    username: '', full_name: '', password: '', pin: '123456', role_id: 'ROLE_CASHIER', outlet_id: 'OUTLET_MAIN'
  });
  const [saving, setSaving] = useState(false);

  const outlets = bootstrapData?.outlets || [{ outlet_id: 'OUTLET_MAIN', name: 'KIZIY Store Pusat' }];

  const loadUsers = useCallback(async () => {
    if (!isOnline || !session?.token) return;
    try {
      const list = await callGasApi('admin.list_users', {}, session.token);
      setUsers(list || []);
    } catch (err) {
      console.warn('Gagal memuat daftar user:', err.message);
    }
  }, [isOnline, session?.token]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSaveUser = async (e) => {
    e.preventDefault();
    if (!isOnline) return;
    setSaving(true);
    try {
      await callGasApi('admin.save_user', form, session.token);
      setForm({ username: '', full_name: '', password: '', pin: '123456', role_id: 'ROLE_CASHIER', outlet_id: 'OUTLET_MAIN' });
      await loadUsers();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
        <ShieldCheck className="w-5 h-5 text-brand-600" />
        <span>Manajemen Staff, Role & Outlet</span>
      </h2>

      <form onSubmit={handleSaveUser} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
        <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <UserPlus className="w-4 h-4" /> Tambah Akun Staff Baru
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input type="text" placeholder="Username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" required />
          <input type="text" placeholder="Nama Lengkap" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" required />
          <input type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" required />
          <input type="text" placeholder="PIN Kasir (6 Digit)" value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
          <select value={form.role_id} onChange={(e) => setForm({ ...form, role_id: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white">
            <option value="ROLE_CASHIER">CASHIER</option>
            <option value="ROLE_MANAGER">MANAGER</option>
            <option value="ROLE_WAREHOUSE">WAREHOUSE</option>
            <option value="ROLE_OWNER">OWNER</option>
          </select>
          <select value={form.outlet_id} onChange={(e) => setForm({ ...form, outlet_id: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white">
            <option value="ALL">Semua Outlet (ALL)</option>
            {outlets.map((o) => (
              <option key={o.outlet_id} value={o.outlet_id}>{o.name}</option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={saving} className="px-4 py-2 bg-brand-600 text-white text-xs font-semibold rounded-xl">
          {saving ? 'Menyimpan...' : 'Simpan Staff'}
        </button>
      </form>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
            <tr>
              <th className="p-3">Username</th>
              <th className="p-3">Nama</th>
              <th className="p-3">Role</th>
              <th className="p-3">Outlet</th>
              <th className="p-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((u) => (
              <tr key={u.user_id}>
                <td className="p-3 font-semibold text-slate-900">{u.username}</td>
                <td className="p-3">{u.full_name}</td>
                <td className="p-3 font-semibold text-brand-600">{u.role_id}</td>
                <td className="p-3 text-slate-600">{u.outlet_id}</td>
                <td className="p-3">
                  <span className={u.is_active ? 'px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 font-semibold' : 'px-2 py-0.5 rounded bg-slate-100 text-slate-500'}>
                    {u.is_active ? 'AKTIF' : 'NONAKTIF'}
                  </span>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan="5" className="p-6 text-center text-slate-400">Tidak ada data atau butuh izin Owner/Manager.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
