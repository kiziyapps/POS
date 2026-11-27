import React from 'react';
import { Wifi, WifiOff, RefreshCw, LogOut, Clock, Store, ShoppingCart, Package, Receipt, BarChart3, Users, Truck } from 'lucide-react';
import { useAuth } from '../store/AuthContext.jsx';

export function Navbar({ activeTab, onChangeTab, onOpenShiftModal }) {
  const { user, activeShift, isOnline, offlineQueueCount, syncing, logout } = useAuth();
  const hasOfflineQueue = offlineQueueCount > 0;
  const onlineBadgeClass = isOnline
    ? 'px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300'
    : 'px-2.5 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 bg-amber-500/20 text-amber-300';
  const shiftBtnClass = activeShift
    ? 'px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition bg-slate-800 hover:bg-slate-700 text-emerald-300 border border-emerald-500/40'
    : 'px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition bg-rose-600 hover:bg-rose-500 text-white';

  const navItems = [
    { id: 'POS', label: 'Kasir POS', icon: ShoppingCart },
    { id: 'INVENTORY', label: 'Produk & Stok', icon: Package },
    { id: 'TRANSACTIONS', label: 'Riwayat', icon: Receipt },
    { id: 'CRM', label: 'CRM & Promo', icon: Users },
    { id: 'PROCUREMENT', label: 'PO & Biaya', icon: Truck },
    { id: 'ANALYTICS', label: 'Analitik', icon: BarChart3 }
  ];

  const navButtons = navItems.map((item) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    const btnCls = isActive
      ? 'px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 bg-brand-600 text-white'
      : 'px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 text-slate-300 hover:bg-slate-800';
    return (
      <button key={item.id} type="button" onClick={() => onChangeTab(item.id)} className={btnCls}>
        <Icon className="w-3.5 h-3.5" />
        <span>{item.label}</span>
      </button>
    );
  });

  return (
    <header className="bg-slate-900 text-white px-4 py-3 flex flex-wrap items-center justify-between gap-3 shadow-md">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-brand-600 flex items-center justify-center font-bold text-lg">
            K
          </div>
          <div>
            <h1 className="font-bold text-base leading-tight tracking-wide">KIZIY APPS</h1>
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <Store className="w-3 h-3" />
              <span>{user?.outlet_id || 'OUTLET_MAIN'} • {user?.full_name}</span>
            </p>
          </div>
        </div>

        <nav className="flex items-center gap-1">
          {navButtons}
        </nav>
      </div>

      <div className="flex items-center gap-3">
        <div className={onlineBadgeClass}>
          {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          <span>{isOnline ? 'Online' : 'Offline Mode'}</span>
          {hasOfflineQueue && (
            <span className="ml-1 px-1.5 py-0.5 bg-amber-500 text-slate-950 rounded-full font-bold">
              {offlineQueueCount} Antrian
            </span>
          )}
        </div>

        {syncing && (
          <RefreshCw className="w-4 h-4 text-brand-400 animate-spin" title="Sinkronisasi data..." />
        )}

        <button type="button" onClick={onOpenShiftModal} className={shiftBtnClass}>
          <Clock className="w-3.5 h-3.5" />
          <span>{activeShift ? 'Shift Aktif' : 'Buka Shift'}</span>
        </button>

        <button type="button" onClick={logout} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition" title="Keluar">
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
