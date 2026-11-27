import React, { useState } from 'react';
import { Banknote, CheckCircle2, X } from 'lucide-react';
import { useAuth } from '../store/AuthContext.jsx';

export function ShiftModal({ onClose }) {
  const { activeShift, openShift, closeShift, user } = useAuth();
  const [openingCash, setOpeningCash] = useState('500000');

  const handleCashChange = (e) => setOpeningCash(e.target.value);

  const handleOpen = async (e) => {
    e.preventDefault();
    await openShift(openingCash, user?.outlet_id);
    onClose();
  };

  const handleClose = async () => {
    await closeShift();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <h2 className="font-bold text-base flex items-center gap-2">
            <Banknote className="w-5 h-5 text-emerald-400" />
            <span>Manajemen Shift Kasir</span>
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          {activeShift ? (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
                <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Shift Sedang Berjalan</span>
                </p>
                <p className="text-sm text-slate-800 font-bold">ID: {activeShift.shift_id}</p>
                <p className="text-xs text-slate-600">
                  Modal Awal: Rp {Number(activeShift.opening_cash || 0).toLocaleString('id-ID')}
                </p>
                <p className="text-xs text-slate-500">
                  Dibuka: {new Date(activeShift.opened_at).toLocaleString('id-ID')}
                </p>
              </div>
              <button type="button" onClick={handleClose} className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-sm transition">
                Tutup Shift (Close Register)
              </button>
            </div>
          ) : (
            <form onSubmit={handleOpen} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Modal Awal Laci Kas (Rp)
                </label>
                <input type="number" min="0" value={openingCash} onChange={handleCashChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" required />
              </div>
              <button type="submit" className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl text-sm transition">
                Buka Shift Sekarang
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
