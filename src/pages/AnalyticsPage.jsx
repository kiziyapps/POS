import React, { useState, useEffect, useCallback } from 'react';
import { BarChart3, Mail, MessageCircle, TrendingUp, DollarSign, Receipt, AlertCircle } from 'lucide-react';
import { useAuth } from '../store/AuthContext.jsx';
import { callGasApi } from '../services/gasClient.mjs';
import { offlineDb } from '../services/offlineDb.mjs';
import { buildDailyReportWaUrl } from '../services/whatsapp.mjs';
import { formatRupiah } from '../utils/pricing.mjs';

export function AnalyticsPage() {
  const { session, user, isOnline } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const firstDayYear = today.slice(0, 4) + '-01-01';

  const [startDate, setStartDate] = useState(firstDayYear);
  const [endDate, setEndDate] = useState(today);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  const loadSummary = useCallback(async () => {
    // 1. Instant 0ms dari IndexedDB (SWR, termasuk optimistic update)
    const cached = await offlineDb.getSummaryRows();
    if (cached && cached.length > 0) {
      const outletFilter = user?.outlet_id || 'ALL';
      const filtered = cached.filter((r) => {
        const d = String(r.date || '');
        const matchDate = (!startDate || d >= startDate) && (!endDate || d <= endDate);
        const matchOutlet = outletFilter === 'ALL' || r.outlet_id === outletFilter;
        return matchDate && matchOutlet;
      });
      setRows(filtered);
    }

    // 2. Revalidate di background dari GAS
    if (!isOnline || !session?.token) return;
    setLoading(true);
    try {
      const data = await callGasApi('summary.range', {
        start_date: startDate,
        end_date: endDate,
        outlet_id: user?.outlet_id || 'ALL'
      }, session.token);
      const safeRows = data || [];
      setRows(safeRows);
      await offlineDb.saveSummaryRows(safeRows);
    } catch (err) {
      console.warn('Gagal memuat Daily_Summary:', err.message);
    } finally {
      setLoading(false);
    }
  }, [isOnline, session?.token, startDate, endDate, user?.outlet_id]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  const totals = rows.reduce((acc, r) => {
    acc.txCount += Number(r.tx_count || 0);
    acc.netSales += Number(r.net_sales || 0);
    acc.grossProfit += Number(r.gross_profit || 0);
    acc.expenseTotal += Number(r.expense_total || 0);
    acc.voidCount += Number(r.void_count || 0);
    return acc;
  }, { txCount: 0, netSales: 0, grossProfit: 0, expenseTotal: 0, voidCount: 0 });

  const handleSendDailyEmail = async () => {
    if (!isOnline || !session?.token) return;
    try {
      setSendingEmail(true);
      await callGasApi('report.send_daily', { date: endDate }, session.token);
      alert('Laporan harian berhasil dikirim ke email manajemen!');
    } catch (err) {
      alert('Gagal kirim laporan: ' + err.message);
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-brand-600" />
            <span>Dashboard Analitik (Daily_Summary)</span>
          </h2>
          <p className="text-xs text-slate-500">Agregasi lintas shard otomatis & selalu tersinkron saat ada void/retur lampau.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white" />
          <span className="text-xs text-slate-500">s/d</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white" />
          <button type="button" onClick={loadSummary} disabled={loading} className="px-3 py-1.5 bg-slate-900 text-white text-xs font-semibold rounded-lg">
            {loading ? 'Memuat...' : 'Filter'}
          </button>
          <button type="button" onClick={handleSendDailyEmail} disabled={sendingEmail} className="px-3 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1">
            <Mail className="w-3.5 h-3.5" />
            <span>{sendingEmail ? 'Mengirim...' : 'Email Manajemen'}</span>
          </button>
          <a href={buildDailyReportWaUrl(totals, startDate, endDate)} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1">
            <MessageCircle className="w-3.5 h-3.5" />
            <span>Share WA</span>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Net Sales</span>
            <DollarSign className="w-4 h-4 text-brand-500" />
          </div>
          <p className="text-xl font-extrabold text-slate-900">{formatRupiah(totals.netSales)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Gross Profit</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-xl font-extrabold text-emerald-700">{formatRupiah(totals.grossProfit)}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Total Transaksi</span>
            <Receipt className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-xl font-extrabold text-slate-900">{totals.txCount}</p>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span>Biaya & Void</span>
            <AlertCircle className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-sm font-bold text-slate-900">{formatRupiah(totals.expenseTotal)}</p>
          <p className="text-[11px] text-rose-600">{totals.voidCount} transaksi void</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 overflow-x-auto shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
            <tr>
              <th className="p-3">Tanggal</th>
              <th className="p-3">Outlet</th>
              <th className="p-3">Tx</th>
              <th className="p-3">Net Sales</th>
              <th className="p-3">COGS</th>
              <th className="p-3">Gross Profit</th>
              <th className="p-3">Expense</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r) => (
              <tr key={r.summary_key} className="hover:bg-slate-50">
                <td className="p-3 font-semibold text-slate-900">{r.date}</td>
                <td className="p-3 text-slate-600">{r.outlet_id}</td>
                <td className="p-3">{r.tx_count}</td>
                <td className="p-3 font-semibold">{formatRupiah(r.net_sales)}</td>
                <td className="p-3 text-slate-600">{formatRupiah(r.total_cogs)}</td>
                <td className="p-3 font-bold text-emerald-700">{formatRupiah(r.gross_profit)}</td>
                <td className="p-3 text-rose-600">{formatRupiah(r.expense_total)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan="7" className="p-8 text-center text-slate-400">Belum ada data ringkasan pada periode ini.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
