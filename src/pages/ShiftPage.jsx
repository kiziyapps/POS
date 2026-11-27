import React, { useState } from 'react';
import { Banknote, CheckCircle2, X, ArrowDownUp } from 'lucide-react';
import { useAuth } from '../store/AuthContext.jsx';
import { callGasApi } from '../services/gasClient.mjs';
import { formatRupiah } from '../utils/pricing.mjs';

export function ShiftModal({ onClose }) {
  const { activeShift, openShift, closeShift, user, session, isOnline } = useAuth();
  const [openingCash, setOpeningCash] = useState('500000');
  const [actualCash, setActualCash] = useState('');
  const [cashType, setCashType] = useState('OUT');
  const [cashAmount, setCashAmount] = useState('');
  const [cashReason, setCashReason] = useState('');
  const [closeSummary, setCloseSummary] = useState(null);
  const [busy, setBusy] = useState(false);

  const handleCashChange = (e) => setOpeningCash(e.target.value);
  const handleActualCashChange = (e) => setActualCash(e.target.value);

  const handleOpen = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await openShift(openingCash, user?.outlet_id);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleCashMovement = async (e) => {
    e.preventDefault();
    if (!cashAmount || !isOnline || !session?.token) return;
    setBusy(true);
    try {
      await callGasApi('shift.cash_movement', {
        shift_id: activeShift.shift_id,
        type: cashType,
        amount: Number(cashAmount),
        reason: cashReason
      }, session.token);
      setCashAmount('');
      setCashReason('');
      alert('Mutasi kas laci berhasil dicatat!');
    } catch (err) {
      alert(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleClose = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await closeShift(actualCash);
      if (res) {
        setCloseSummary(res);
      } else {
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
          <h2 className="font-bold text-base flex items-center gap-2">
            <Banknote className="w-5 h-5 text-emerald-400" />
            <span>Manajemen Shift & Kas Laci</span>
          </h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {closeSummary ? (
            <div className="space-y-3">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
                <p className="font-bold text-sm text-slate-900">Hasil Blind Close Shift</p>
                <div className="flex justify-between"><span>Target Sistem:</span><span>{formatRupiah(closeSummary.expected_cash)}</span></div>
                <div className="flex justify-between"><span>Kas Fisik Laci:</span><span>{formatRupiah(closeSummary.actual_cash)}</span></div>
                <div className="flex justify-between font-bold border-t pt-1.5">
                  <span>Selisih (Variance):</span>
                  <span className={closeSummary.variance === 0 ? 'text-emerald-600' : 'text-rose-600'}>{formatRupiah(closeSummary.variance)}</span>
                </div>
              </div>
              <button type="button" onClick={onClose} className="w-full py-2.5 bg-slate-900 text-white font-semibold rounded-xl text-sm">
                Selesai
              </button>
            </div>
          ) : activeShift ? (
            <div className="space-y-5">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
                <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Shift Sedang Berjalan</span>
                </p>
                <p className="text-sm text-slate-800 font-bold">ID: {activeShift.shift_id}</p>
                <p className="text-xs text-slate-600">Modal Awal: {formatRupiah(activeShift.opening_cash)}</p>
              </div>

              <form onSubmit={handleCashMovement} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
                <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                  <ArrowDownUp className="w-3.5 h-3.5" /> Petty Cash (Kas Masuk / Keluar)
                </p>
                <div className="grid grid-cols-3 gap-2">
                  <select value={cashType} onChange={(e) => setCashType(e.target.value)} className="px-2 py-1.5 text-xs border border-slate-300 rounded-lg bg-white">
                    <option value="OUT">Kas Keluar</option>
                    <option value="IN">Kas Masuk</option>
                  </select>
                  <input type="number" min="0" value={cashAmount} onChange={(e) => setCashAmount(e.target.value)} placeholder="Nominal" className="col-span-2 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg" required />
                </div>
                <div className="flex gap-2">
                  <input type="text" value={cashReason} onChange={(e) => setCashReason(e.target.value)} placeholder="Keterangan (misal: Beli Galon)" className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg" />
                  <button type="submit" disabled={busy} className="px-3 py-1.5 bg-slate-800 text-white text-xs font-semibold rounded-lg">
                    Catat
                  </button>
                </div>
              </form>

              <form onSubmit={handleClose} className="space-y-3 border-t pt-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Blind Close — Hitung Kas Fisik Laci (Rp)
                  </label>
                  <input type="number" min="0" value={actualCash} onChange={handleActualCashChange} placeholder="Masukkan jumlah uang fisik di laci" className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" required />
                </div>
                <button type="submit" disabled={busy} className="w-full py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-sm transition">
                  {busy ? 'Menutup Shift...' : 'Tutup Shift (Blind Close)'}
                </button>
              </form>
            </div>
          ) : (
            <form onSubmit={handleOpen} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Modal Awal Laci Kas (Rp)
                </label>
                <input type="number" min="0" value={openingCash} onChange={handleCashChange} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500" required />
              </div>
              <button type="submit" disabled={busy} className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl text-sm transition">
                {busy ? 'Membuka Shift...' : 'Buka Shift Sekarang'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
