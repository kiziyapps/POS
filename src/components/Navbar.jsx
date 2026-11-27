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
    { id: 'POS', label: 'Kasir', icon: ShoppingCart },
    { id: 'INVENTORY', label: 'Stok', icon: Package },
    { id: 'TRANSACTIONS', label: 'Riwayat', icon: Receipt },
    { id: 'CRM', label: 'CRM', icon: Users },
    { id: 'PROCUREMENT', label: 'PO', icon: Truck },
    { id: 'ANALYTICS', label: 'Analitik', icon: BarChart3 }
  ];

  const desktopNavButtons = navItems.map((item) => {
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

  const mobileNavButtons = navItems.map((item) => {
    const Icon = item.icon;
    const isActive = activeTab === item.id;
    const btnCls = isActive
      ? 'flex-1 py-2 flex flex-col items-center justify-center gap-0.5 text-brand-600 font-bold text-[11px]'
      : 'flex-1 py-2 flex flex-col items-center justify-center gap-0.5 text-slate-500 font-medium text-[11px]';
    return (
      <button key={item.id} type="button" onClick={() => onChangeTab(item.id)} className={btnCls}>
        <Icon className="w-5 h-5" />
        <span>{item.label}</span>
      </button>
    );
  });

  return (
    <>
      <header className="bg-slate-900 text-white px-3 sm:px-4 py-2.5 flex items-center justify-between gap-2 shadow-md sticky top-0 z-30">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-brand-600 flex items-center justify-center font-bold text-base shrink-0">
            K
          </div>
          <div className="min-w-0">
            <h1 className="font-bold text-sm sm:text-base leading-tight tracking-wide truncate">KIZIY APPS</h1>
            <p className="text-[11px] text-slate-400 flex items-center gap-1 truncate">
              <Store className="w-3 h-3 shrink-0" />
              <span className="truncate">{user?.outlet_id || 'OUTLET_MAIN'} • {user?.full_name}</span>
            </p>
          </div>

          <nav className="hidden lg:flex items-center gap-1 ml-3">
            {desktopNavButtons}
          </nav>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className={onlineBadgeClass}>
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
            {hasOfflineQueue && (
              <span className="px-1.5 py-0.5 bg-amber-500 text-slate-950 rounded-full font-bold text-[10px]">
                {offlineQueueCount}
              </span>
            )}
          </div>

          {syncing && (
            <RefreshCw className="w-4 h-4 text-brand-400 animate-spin" title="Sinkronisasi data..." />
          )}

          <button type="button" onClick={onOpenShiftModal} className={shiftBtnClass}>
            <Clock className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{activeShift ? 'Shift Aktif' : 'Buka Shift'}</span>
          </button>

          <button type="button" onClick={logout} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition" title="Keluar">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Bottom Navigation Bar untuk Smartphone & Tablet */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex items-center justify-around z-30 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
        {mobileNavButtons}
      </nav>
    </>
  );
}
