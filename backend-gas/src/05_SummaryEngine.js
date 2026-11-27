/**
 * KIZIY APPS - SummaryEngine
 * Mengelola tabel Daily_Summary di KIZIY_MASTER_INDEX termasuk re-agregasi otomatis
 * saat terjadi perubahan / void / retur / penghapusan data lampau di shard mana pun.
 */

const SummaryEngine = {
  /**
   * Update inkremental cepat saat transaksi baru selesai
   */
  applyTransactionDelta: function (dateStr, outletId, delta) {
    var summaryKey = dateStr + '|' + outletId;
    var masterSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.MASTER_INDEX_ID);
    var sheet = masterSs.getSheetByName('Daily_Summary');
    var rows = KiziyUtils.sheetToObjects(sheet);

    var existing = rows.find(function (r) { return r.summary_key === summaryKey; });
    if (!existing) {
      KiziyUtils.appendObjectRow(sheet, {
        summary_key: summaryKey,
        date: dateStr,
        outlet_id: outletId,
        tx_count: delta.tx_count || 0,
        gross_sales: delta.gross_sales || 0,
        discount_total: delta.discount_total || 0,
        tax_total: delta.tax_total || 0,
        net_sales: delta.net_sales || 0,
        total_cogs: delta.total_cogs || 0,
        gross_profit: (delta.net_sales || 0) - (delta.total_cogs || 0),
        void_count: delta.void_count || 0,
        refund_total: delta.refund_total || 0,
        expense_total: delta.expense_total || 0,
        last_synced_at: KiziyUtils.nowIso()
      });
      return;
    }

    var nextNet = Number(existing.net_sales || 0) + (delta.net_sales || 0);
    var nextCogs = Number(existing.total_cogs || 0) + (delta.total_cogs || 0);
    var updatedRow = [
      summaryKey,
      dateStr,
      outletId,
      Number(existing.tx_count || 0) + (delta.tx_count || 0),
      Number(existing.gross_sales || 0) + (delta.gross_sales || 0),
      Number(existing.discount_total || 0) + (delta.discount_total || 0),
      Number(existing.tax_total || 0) + (delta.tax_total || 0),
      nextNet,
      nextCogs,
      nextNet - nextCogs,
      Number(existing.void_count || 0) + (delta.void_count || 0),
      Number(existing.refund_total || 0) + (delta.refund_total || 0),
      Number(existing.expense_total || 0) + (delta.expense_total || 0),
      KiziyUtils.nowIso()
    ];
    sheet.getRange(existing._rowIndex, 1, 1, updatedRow.length).setValues([updatedRow]);
  },

  /**
   * WAJIB dipanggil setiap kali ada mutasi/void/retur/hapus pada data lampau!
   * Menghitung ulang seluruh metrik pada tanggal & outlet tertentu lintas semua shard terkait.
   */
  reAggregateDate: function (dateStr, outletId) {
    var txShards = ShardManager.getShardsByDateRange('TX_SHARD', dateStr, dateStr);
    var returnShards = ShardManager.getShardsByDateRange('RETURN_SHARD', dateStr, dateStr);
    var shiftShards = ShardManager.getShardsByDateRange('SHIFT_CASH_SHARD', dateStr, dateStr);

    var txCount = 0;
    var grossSales = 0;
    var discountTotal = 0;
    var taxTotal = 0;
    var netSales = 0;
    var totalCogs = 0;
    var voidCount = 0;
    var refundTotal = 0;
    var expenseTotal = 0;

    // 1. Scan TX_SHARDs
    txShards.forEach(function (shard) {
      var ss = SpreadsheetApp.openById(shard.spreadsheet_id);
      var txs = KiziyUtils.sheetToObjects(ss.getSheetByName('Transactions'));
      var items = KiziyUtils.sheetToObjects(ss.getSheetByName('Transaction_Items'));

      var validTxIds = {};
      txs.forEach(function (t) {
        var tDate = String(t.created_at || '').slice(0, 10);
        if (tDate === dateStr && t.outlet_id === outletId) {
          if (t.tx_status === 'VOID') {
            voidCount += 1;
          } else {
            txCount += 1;
            grossSales += Number(t.subtotal || 0);
            discountTotal += Number(t.discount_total || 0);
            taxTotal += Number(t.tax_total || 0);
            netSales += Number(t.grand_total || 0) - Number(t.tax_total || 0);
            validTxIds[t.tx_id] = true;
          }
        }
      });

      items.forEach(function (it) {
        if (validTxIds[it.tx_id]) {
          totalCogs += Number(it.cogs_snapshot || 0) * Number(it.base_qty_deducted || it.qty || 0);
        }
      });
    });

    // 2. Scan RETURN_SHARDs
    returnShards.forEach(function (shard) {
      var ss = SpreadsheetApp.openById(shard.spreadsheet_id);
      var returns = KiziyUtils.sheetToObjects(ss.getSheetByName('Returns'));
      returns.forEach(function (r) {
        var rDate = String(r.created_at || '').slice(0, 10);
        if (rDate === dateStr && r.outlet_id === outletId) {
          refundTotal += Number(r.refund_total || 0);
        }
      });
    });

    // 3. Scan SHIFT_CASH_SHARDs untuk Expenses
    shiftShards.forEach(function (shard) {
      var ss = SpreadsheetApp.openById(shard.spreadsheet_id);
      var expenses = KiziyUtils.sheetToObjects(ss.getSheetByName('Expenses'));
      expenses.forEach(function (e) {
        var eDate = String(e.created_at || '').slice(0, 10);
        if (eDate === dateStr && e.outlet_id === outletId) {
          expenseTotal += Number(e.amount || 0);
        }
      });
    });

    // 4. Timpa baris Daily_Summary
    var summaryKey = dateStr + '|' + outletId;
    var masterSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.MASTER_INDEX_ID);
    var sheet = masterSs.getSheetByName('Daily_Summary');
    var rows = KiziyUtils.sheetToObjects(sheet);
    var existing = rows.find(function (r) { return r.summary_key === summaryKey; });

    var finalRow = [
      summaryKey, dateStr, outletId, txCount, grossSales, discountTotal,
      taxTotal, netSales, totalCogs, (netSales - totalCogs), voidCount,
      refundTotal, expenseTotal, KiziyUtils.nowIso()
    ];

    if (existing) {
      sheet.getRange(existing._rowIndex, 1, 1, finalRow.length).setValues([finalRow]);
    } else {
      sheet.appendRow(finalRow);
    }

    return { summary_key: summaryKey, net_sales: netSales, gross_profit: netSales - totalCogs };
  }
};
