/**
 * KIZIY APPS - MailService
 * Pengiriman Invoice Customer & Laporan Harian Manajemen via Gmail,
 * dilengkapi Quota Guard & Auto-Fallback ke WhatsApp.
 */

const MailService = {
  /**
   * Kirim invoice ke customer dengan pengecekan sisa kuota Gmail
   */
  sendCustomerInvoice: function (txData, recipientEmail) {
    if (!recipientEmail) {
      return { sent: false, fallback_wa: true, reason: 'NO_EMAIL_PROVIDED' };
    }

    var remainingQuota = MailApp.getRemainingDailyQuota();
    if (remainingQuota <= KIZIY_CONFIG.GMAIL_QUOTA_RESERVE_FOR_REPORT) {
      this.logNotification_('WHATSAPP_FALLBACK', recipientEmail, 'INVOICE_' + txData.tx_id, txData.tx_id, 'QUOTA_FALLBACK');
      return {
        sent: false,
        fallback_wa: true,
        remaining_quota: remainingQuota,
        reason: 'QUOTA_NEAR_LIMIT'
      };
    }

    var subject = '[KIZIY APPS] Struk Pembelian ' + txData.tx_id;
    var htmlBody = this.buildInvoiceHtml_(txData);

    try {
      MailApp.sendEmail({
        to: recipientEmail,
        subject: subject,
        htmlBody: htmlBody
      });
      this.logNotification_('GMAIL', recipientEmail, subject, txData.tx_id, 'SENT');
      return { sent: true, fallback_wa: false, remaining_quota: remainingQuota - 1 };
    } catch (err) {
      this.logNotification_('WHATSAPP_FALLBACK', recipientEmail, subject, txData.tx_id, 'FAILED');
      return { sent: false, fallback_wa: true, reason: err.message };
    }
  },

  /**
   * Laporan Harian Otomatis ke Manajemen (pasang pada Time-Driven Trigger GAS)
   */
  sendDailyManagementReport: function (targetDateStr) {
    var dateStr = targetDateStr || KiziyUtils.todayDateStr();
    var masterSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.MASTER_INDEX_ID);
    var summaries = KiziyUtils.sheetToObjects(masterSs.getSheetByName('Daily_Summary'))
      .filter(function (s) { return s.date === dateStr; });

    var orgSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.ORG_RBAC_ID);
    var outlets = KiziyUtils.sheetToObjects(orgSs.getSheetByName('Outlets'));

    var ownerEmail = Session.getActiveUser().getEmail();
    var recipients = outlets.map(function (o) { return o.email; }).filter(Boolean);
    if (recipients.length === 0 && ownerEmail) recipients.push(ownerEmail);
    if (recipients.length === 0) return { sent: false, reason: 'NO_RECIPIENT' };

    var totalNet = 0;
    var totalProfit = 0;
    var totalTx = 0;
    var rowsHtml = summaries.map(function (s) {
      totalNet += Number(s.net_sales || 0);
      totalProfit += Number(s.gross_profit || 0);
      totalTx += Number(s.tx_count || 0);
      return '<tr><td>' + s.outlet_id + '</td><td>' + s.tx_count + '</td><td>Rp ' +
        Number(s.net_sales || 0).toLocaleString('id-ID') + '</td><td>Rp ' +
        Number(s.gross_profit || 0).toLocaleString('id-ID') + '</td><td>' +
        (s.void_count || 0) + '</td></tr>';
    }).join('');

    var html = '<h2>Laporan Harian KIZIY APPS (' + dateStr + ')</h2>' +
      '<p>Total Transaksi: <b>' + totalTx + '</b> | Net Sales: <b>Rp ' + totalNet.toLocaleString('id-ID') +
      '</b> | Gross Profit: <b>Rp ' + totalProfit.toLocaleString('id-ID') + '</b></p>' +
      '<table border="1" cellpadding="6" cellspacing="0">' +
      '<tr><th>Outlet</th><th>Tx</th><th>Net Sales</th><th>Gross Profit</th><th>Void</th></tr>' +
      (rowsHtml || '<tr><td colspan="5">Belum ada transaksi hari ini.</td></tr>') +
      '</table>';

    MailApp.sendEmail({
      to: recipients.join(','),
      subject: '[KIZIY APPS] Laporan Penjualan Harian - ' + dateStr,
      htmlBody: html
    });

    return { sent: true, date: dateStr, recipients: recipients };
  },

  buildInvoiceHtml_: function (txData) {
    return '<div style="font-family:sans-serif;max-width:480px;margin:auto;">' +
      '<h3>KIZIY APPS - Struk Digital</h3>' +
      '<p>No. Invoice: <b>' + txData.tx_id + '</b><br/>Tanggal: ' + (txData.created_at || KiziyUtils.nowIso()) + '</p>' +
      '<p>Total Bayar: <b>Rp ' + Number(txData.grand_total || 0).toLocaleString('id-ID') + '</b></p>' +
      '<p style="color:#666;font-size:12px;">Terima kasih telah berbelanja.</p></div>';
  },

  logNotification_: function (channel, recipient, subject, txRefId, status) {
    try {
      var shard = ShardManager.openActiveShardForWrite('NOTIF_SHARD');
      var sheet = shard.ss.getSheetByName('Notification_Logs');
      KiziyUtils.appendObjectRow(sheet, {
        notif_id: KiziyUtils.uuid(),
        channel: channel,
        recipient: recipient,
        subject_or_type: subject,
        tx_ref_id: txRefId || '',
        status: status,
        created_at: KiziyUtils.nowIso()
      });
    } catch (err) {
      Logger.log('Gagal mencatat Notification_Logs: ' + err.message);
    }
  }
};
