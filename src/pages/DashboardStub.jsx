import React from 'react';
import { ShoppingCart, Package, BarChart3, Users } from 'lucide-react';
import { useAuth } from '../store/AuthContext.jsx';

export function DashboardStub({ onOpenShiftModal }) {
  const { bootstrapData, activeShift } = useAuth();

  const stats = [
    { label: 'Produk Tersinkron', value: bootstrapData?.products?.length ?? 0, icon: Package },
    { label: 'Varian SKU', value: bootstrapData?.variants?.length ?? 0, icon: ShoppingCart },
    { label: 'Outlet Aktif', value: bootstrapData?.outlets?.length ?? 0, icon: Users },
    { label: 'Metode Bayar', value: bootstrapData?.payment_methods?.length ?? 0, icon: BarChart3 }
  ];

  const statCards = stats.map((s) => {
    const Icon = s.icon;
    return (
      <div key={s.label} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between text-slate-500 text-xs mb-2">
          <span>{s.label}</span>
          <Icon className="w-4 h-4 text-brand-500" />
        </div>
        <p className="text-2xl font-bold text-slate-900">{s.value}</p>
      </div>
    );
  });

  return (
    <main className="max-w-6xl mx-auto p-6 space-y-6">
      {!activeShift && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between">
          <div>
            <p className="font-semibold text-amber-900 text-sm">Shift Kasir Belum Dibuka</p>
            <p className="text-xs text-amber-700">Silakan buka shift dan masukkan modal awal sebelum memulai transaksi.</p>
          </div>
          <button type="button" onClick={onOpenShiftModal} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg">
            Buka Shift
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards}
      </div>

      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm text-center space-y-2">
        <h2 className="text-lg font-bold text-slate-900">Fondasi PWA & IndexedDB Siap</h2>
        <p className="text-sm text-slate-600 max-w-xl mx-auto">
          Layar Kasir Retail (Checkout, Barcode, Harga Bertingkat, Multi-Payment, Cetak Struk) dan Modul Inventori akan diaktifkan pada Fase 3.
        </p>
      </div>
    </main>
  );
}
