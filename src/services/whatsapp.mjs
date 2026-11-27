/**
 * KIZIY APPS - WhatsApp Deep Link Generator
 * Digunakan untuk tombol kirim manual & Auto-Fallback saat kuota Gmail mendekati batas.
 */

export function formatPhoneForWa(phone) {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('0')) {
    digits = '62' + digits.slice(1);
  }
  return digits;
}

export function buildInvoiceWaUrl(phone, tx) {
  const formattedPhone = formatPhoneForWa(phone);
  const lines = [
    `*KIZIY APPS — Struk Digital*`,
    `No. Struk: ${tx.tx_id || tx.offline_receipt_no}`,
    `Tanggal: ${tx.created_at || new Date().toLocaleString('id-ID')}`,
    `Total: *Rp ${Number(tx.grand_total || 0).toLocaleString('id-ID')}*`,
    ``,
    `Terima kasih telah berbelanja!`
  ];
  const text = encodeURIComponent(lines.join('\n'));
  return formattedPhone
    ? `https://wa.me/${formattedPhone}?text=${text}`
    : `https://wa.me/?text=${text}`;
}

export function buildDailyReportWaUrl(totals, startDate, endDate) {
  const lines = [
    `*KIZIY APPS — Ringkasan Laporan*`,
    `Periode: ${startDate} s/d ${endDate}`,
    `Total Transaksi: ${totals.txCount}`,
    `Net Sales: *Rp ${Number(totals.netSales || 0).toLocaleString('id-ID')}*`,
    `Gross Profit: *Rp ${Number(totals.grossProfit || 0).toLocaleString('id-ID')}*`,
    `Pengeluaran: Rp ${Number(totals.expenseTotal || 0).toLocaleString('id-ID')}`,
    `Void: ${totals.voidCount} transaksi`
  ];
  return `https://wa.me/?text=${encodeURIComponent(lines.join('\n'))}`;
}
