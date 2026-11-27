/**
 * KIZIY APPS - ShiftReturnService
 * Mengelola Shift Kasir (Open, Petty Cash In/Out, Blind Close) & Partial Return
 */

const ShiftReturnService = {
  openShift: function (session, payload) {
    return KiziyUtils.withScriptLock(function () {
      var shiftShard = ShardManager.openActiveShardForWrite('SHIFT_CASH_SHARD');
      var sheet = shiftShard.ss.getSheetByName('Shifts');
      var outletId = (payload && payload.outlet_id) || session.outlet_id || 'OUTLET_MAIN';
      if (outletId === 'ALL') outletId = 'OUTLET_MAIN';

      var shiftObj = {
        shift_id: (payload && payload.shift_id) || ('SHF-' + Date.now()),
        outlet_id: outletId,
        cashier_id: session.user_id,
        opened_at: (payload && payload.opened_at) || KiziyUtils.nowIso(),
        opening_cash: Number((payload && payload.opening_cash) || 0),
        closed_at: '',
        expected_cash: 0,
        actual_cash: 0,
        variance: 0,
        status: 'OPEN'
      };
      KiziyUtils.appendObjectRow(sheet, shiftObj);
      return shiftObj;
    });
  },

  recordCashMovement: function (session, payload) {
    if (!payload || !payload.shift_id || !payload.amount) {
      throw new Error('shift_id dan nominal kas wajib diisi.');
    }

    return KiziyUtils.withScriptLock(function () {
      var shiftShard = ShardManager.openActiveShardForWrite('SHIFT_CASH_SHARD');
      var sheet = shiftShard.ss.getSheetByName('Cash_Movements');
      var movObj = {
        movement_id: 'MOV-' + KiziyUtils.uuid().slice(0, 8).toUpperCase(),
        shift_id: payload.shift_id,
        type: payload.type === 'IN' ? 'IN' : 'OUT',
        amount: Number(payload.amount),
        reason: payload.reason || '',
        created_at: KiziyUtils.nowIso()
      };
      KiziyUtils.appendObjectRow(sheet, movObj);
      return movObj;
    });
  },

  /**
   * Blind Close: kasir input actual_cash, server hitung expected_cash & variance
   */
  closeShift: function (session, payload) {
    if (!payload || !payload.shift_id) {
      throw new Error('shift_id wajib diisi.');
    }

    return KiziyUtils.withScriptLock(function () {
      var shiftShard = ShardManager.openActiveShardForWrite('SHIFT_CASH_SHARD');
      var shiftSheet = shiftShard.ss.getSheetByName('Shifts');
      var shifts = KiziyUtils.sheetToObjects(shiftSheet);
      var target = shifts.find(function (s) { return s.shift_id === payload.shift_id; });
      if (!target) throw new Error('Shift tidak ditemukan: ' + payload.shift_id);

      var movements = KiziyUtils.sheetToObjects(shiftShard.ss.getSheetByName('Cash_Movements'))
        .filter(function (m) { return m.shift_id === payload.shift_id; });

      var cashIn = 0;
      var cashOut = 0;
      movements.forEach(function (m) {
        if (m.type === 'IN') cashIn += Number(m.amount || 0);
        else cashOut += Number(m.amount || 0);
      });

      // Hitung penjualan tunai pada shift ini
      var cashSales = 0;
      var txShard = ShardManager.getActiveShardRecord('TX_SHARD', true);
      if (txShard) {
        var txSs = SpreadsheetApp.openById(txShard.spreadsheet_id);
        var shiftTxs = KiziyUtils.sheetToObjects(txSs.getSheetByName('Transactions'))
          .filter(function (t) { return t.shift_id === payload.shift_id && t.tx_status !== 'VOID'; });
        var txIdMap = {};
        shiftTxs.forEach(function (t) { txIdMap[t.tx_id] = true; });
        var payments = KiziyUtils.sheetToObjects(txSs.getSheetByName('Transaction_Payments'));
        payments.forEach(function (p) {
          if (txIdMap[p.tx_id] && p.method_id === 'PM_CASH') {
            cashSales += Number(p.amount || 0);
          }
        });
      }

      var expectedCash = Number(target.opening_cash || 0) + cashSales + cashIn - cashOut;
      var actualCash = Number(payload.actual_cash || 0);
      var variance = actualCash - expectedCash;
      var nowIso = KiziyUtils.nowIso();

      // Kolom 6: closed_at, 7: expected_cash, 8: actual_cash, 9: variance, 10: status
      shiftSheet.getRange(target._rowIndex, 6, 1, 5).setValues([[
        nowIso, expectedCash, actualCash, variance, 'CLOSED'
      ]]);

      return {
        shift_id: payload.shift_id,
        expected_cash: expectedCash,
        actual_cash: actualCash,
        variance: variance,
        status: 'CLOSED'
      };
    });
  },

  /**
   * Partial Return: retur sebagian item dari transaksi + restock + re-sync Daily_Summary
   */
  partialReturn: function (session, payload) {
    if (!payload || !payload.tx_id || !payload.items || payload.items.length === 0) {
      throw new Error('tx_id dan item retur wajib diisi.');
    }

    return KiziyUtils.withScriptLock(function () {
      var masterSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.MASTER_INDEX_ID);
      var shards = KiziyUtils.sheetToObjects(masterSs.getSheetByName('Shard_Registry'))
        .filter(function (s) { return s.domain_type === 'TX_SHARD'; });

      var foundTx = null;
      var foundSheet = null;
      for (var i = shards.length - 1; i >= 0; i--) {
        var ss = SpreadsheetApp.openById(shards[i].spreadsheet_id);
        var txSheet = ss.getSheetByName('Transactions');
        var match = KiziyUtils.sheetToObjects(txSheet).find(function (t) { return t.tx_id === payload.tx_id; });
        if (match) {
          foundTx = match;
          foundSheet = txSheet;
          break;
        }
      }

      if (!foundTx) throw new Error('Transaksi tidak ditemukan: ' + payload.tx_id);
      if (foundTx.tx_status === 'VOID') throw new Error('Transaksi sudah di-VOID.');

      var retShard = ShardManager.openActiveShardForWrite('RETURN_SHARD');
      var retSheet = retShard.ss.getSheetByName('Returns');
      var retItemsSheet = retShard.ss.getSheetByName('Return_Items');
      var nowIso = KiziyUtils.nowIso();
      var returnId = 'RET-' + KiziyUtils.todayDateStr().replace(/-/g, '') + '-' + KiziyUtils.uuid().slice(0, 4).toUpperCase();

      var invSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.INVENTORY_MASTER_ID);
      var stockSheet = invSs.getSheetByName('Stock_Balances');
      var stockRows = KiziyUtils.sheetToObjects(stockSheet);
      var ledgerShard = ShardManager.openActiveShardForWrite('STOCK_LEDGER_SHARD');
      var ledgerSheet = ledgerShard.ss.getSheetByName('Stock_Ledger');

      var refundTotal = 0;
      var retItems = [];

      payload.items.forEach(function (it) {
        var qtyRet = Number(it.qty_returned || 1);
        var refAmt = Number(it.refund_amount || 0);
        refundTotal += refAmt;
        var restock = it.restock_flag !== false;

        retItems.push({
          return_item_id: KiziyUtils.uuid(),
          return_id: returnId,
          tx_item_id: it.tx_item_id || '',
          variant_id: it.variant_id,
          qty_returned: qtyRet,
          restock_flag: restock,
          refund_amount: refAmt
        });

        if (restock && it.variant_id) {
          var balanceKey = foundTx.outlet_id + '|' + it.variant_id;
          var stockRec = stockRows.find(function (s) { return s.balance_key === balanceKey; });
          var nextQty = (stockRec ? Number(stockRec.qty_on_hand || 0) : 0) + qtyRet;
          if (stockRec) {
            stockSheet.getRange(stockRec._rowIndex, 4, 1, 2).setValues([[nextQty, nowIso]]);
          } else {
            KiziyUtils.appendObjectRow(stockSheet, {
              balance_key: balanceKey,
              outlet_id: foundTx.outlet_id,
              variant_id: it.variant_id,
              qty_on_hand: nextQty,
              updated_at: nowIso
            });
          }
          KiziyUtils.appendObjectRow(ledgerSheet, {
            ledger_id: KiziyUtils.uuid(),
            outlet_id: foundTx.outlet_id,
            variant_id: it.variant_id,
            tx_ref_id: returnId,
            movement_type: 'RETURN',
            qty_delta: qtyRet,
            stock_after: nextQty,
            notes: 'Partial Return ' + payload.tx_id,
            created_by: session.user_id,
            created_at: nowIso
          });
        }
      });

      KiziyUtils.appendObjectRow(retSheet, {
        return_id: returnId,
        tx_id: payload.tx_id,
        outlet_id: foundTx.outlet_id,
        shift_id: payload.shift_id || foundTx.shift_id || '',
        authorized_by: session.user_id,
        reason: payload.reason || 'Retur Pelanggan',
        refund_total: refundTotal,
        refund_method: payload.refund_method || 'PM_CASH',
        created_at: nowIso
      });
      KiziyUtils.appendObjectRowsBatch(retItemsSheet, retItems);

      foundSheet.getRange(foundTx._rowIndex, 15).setValue('PARTIAL_RETURN');
      foundSheet.getRange(foundTx._rowIndex, 17).setValue(nowIso);

      var txDate = String(foundTx.created_at || '').slice(0, 10);
      var summary = SummaryEngine.reAggregateDate(txDate, foundTx.outlet_id);

      return { return_id: returnId, tx_id: payload.tx_id, refund_total: refundTotal, daily_summary: summary };
    });
  }
};
