/**
 * KIZIY APPS - PosService
 * Menangani Checkout (Online & Offline Sync Idempotent), Void/Retur,
 * Auto-Audit NEEDS_STOCK_REVIEW, dan Re-Sync Daily_Summary.
 */

const PosService = {
  /**
   * Checkout transaksi retail (mendukung sync antrian offline & idempotency)
   */
  checkout: function (session, payload) {
    if (!payload || !payload.items || payload.items.length === 0) {
      throw new Error('Keranjang belanja kosong.');
    }

    return KiziyUtils.withScriptLock(function () {
      var txShard = ShardManager.openActiveShardForWrite('TX_SHARD');
      var txSheet = txShard.ss.getSheetByName('Transactions');
      var itemsSheet = txShard.ss.getSheetByName('Transaction_Items');
      var paySheet = txShard.ss.getSheetByName('Transaction_Payments');

      // 1. Idempotency check menggunakan client_tx_uuid
      var clientTxUuid = payload.client_tx_uuid || KiziyUtils.uuid();
      var existingTxs = KiziyUtils.sheetToObjects(txSheet);
      var duplicate = existingTxs.find(function (t) { return t.client_tx_uuid === clientTxUuid; });
      if (duplicate) {
        return {
          tx: duplicate,
          idempotent_replay: true,
          email_result: { sent: false, fallback_wa: false, reason: 'ALREADY_SYNCED' }
        };
      }

      var nowIso = payload.created_at || KiziyUtils.nowIso();
      var dateStr = String(nowIso).slice(0, 10);
      var outletId = payload.outlet_id || session.outlet_id || 'OUTLET_MAIN';
      if (outletId === 'ALL') outletId = 'OUTLET_MAIN';

      var seqNum = ('0000' + (existingTxs.length + 1)).slice(-4);
      var txId = 'INV-' + dateStr.replace(/-/g, '') + '-' + seqNum;

      // 2. Proses Pengurangan Stok & Cek Konflik Stok Minus
      var invSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.INVENTORY_MASTER_ID);
      var stockSheet = invSs.getSheetByName('Stock_Balances');
      var stockRows = KiziyUtils.sheetToObjects(stockSheet);

      var ledgerShard = ShardManager.openActiveShardForWrite('STOCK_LEDGER_SHARD');
      var ledgerSheet = ledgerShard.ss.getSheetByName('Stock_Ledger');

      var needsStockReview = false;
      var stockConflicts = [];
      var totalCogs = 0;
      var itemRowsToInsert = [];
      var ledgerRowsToInsert = [];

      payload.items.forEach(function (item) {
        var baseQty = Number(item.base_qty_deducted || item.qty || 1);
        var cogsSnap = Number(item.cogs_snapshot || 0);
        totalCogs += cogsSnap * baseQty;

        itemRowsToInsert.push({
          item_id: KiziyUtils.uuid(),
          tx_id: txId,
          variant_id: item.variant_id,
          sku: item.sku || '',
          product_name_snapshot: item.product_name_snapshot || item.name || '',
          qty: Number(item.qty || 1),
          unit_name: item.unit_name || 'pcs',
          base_qty_deducted: baseQty,
          unit_price: Number(item.unit_price || 0),
          cogs_snapshot: cogsSnap,
          discount_amount: Number(item.discount_amount || 0),
          line_total: Number(item.line_total || 0)
        });

        var balanceKey = outletId + '|' + item.variant_id;
        var stockRec = stockRows.find(function (s) { return s.balance_key === balanceKey; });
        var currentQty = stockRec ? Number(stockRec.qty_on_hand || 0) : 0;
        var nextQty = currentQty - baseQty;

        if (nextQty < 0) {
          needsStockReview = true;
          stockConflicts.push({
            variant_id: item.variant_id,
            sku: item.sku,
            before: currentQty,
            deducted: baseQty,
            after: nextQty
          });
        }

        if (stockRec) {
          stockSheet.getRange(stockRec._rowIndex, 4, 1, 2).setValues([[nextQty, nowIso]]);
          stockRec.qty_on_hand = nextQty;
        } else {
          KiziyUtils.appendObjectRow(stockSheet, {
            balance_key: balanceKey,
            outlet_id: outletId,
            variant_id: item.variant_id,
            qty_on_hand: nextQty,
            updated_at: nowIso
          });
          stockRows.push({ balance_key: balanceKey, qty_on_hand: nextQty });
        }

        ledgerRowsToInsert.push({
          ledger_id: KiziyUtils.uuid(),
          outlet_id: outletId,
          variant_id: item.variant_id,
          tx_ref_id: txId,
          movement_type: 'SALE',
          qty_delta: -baseQty,
          stock_after: nextQty,
          notes: payload.offline_receipt_no ? 'Offline Sync: ' + payload.offline_receipt_no : 'POS Sale',
          created_by: session.user_id,
          created_at: nowIso
        });
      });

      // 3. Siapkan Email Customer & Quota Guard
      var syncStatus = needsStockReview ? 'NEEDS_STOCK_REVIEW' : 'SYNCED';
      var txObj = {
        tx_id: txId,
        client_tx_uuid: clientTxUuid,
        offline_receipt_no: payload.offline_receipt_no || '',
        outlet_id: outletId,
        shift_id: payload.shift_id || '',
        cashier_id: session.user_id,
        customer_id: payload.customer_id || '',
        subtotal: Number(payload.subtotal || 0),
        discount_total: Number(payload.discount_total || 0),
        tax_total: Number(payload.tax_total || 0),
        rounding: Number(payload.rounding || 0),
        grand_total: Number(payload.grand_total || 0),
        sync_status: syncStatus,
        email_status: 'NOT_SENT',
        tx_status: 'COMPLETED',
        created_at: nowIso,
        updated_at: nowIso
      };

      var emailResult = { sent: false, fallback_wa: false, reason: 'NO_EMAIL_PROVIDED' };
      if (payload.customer_email) {
        emailResult = MailService.sendCustomerInvoice(txObj, payload.customer_email);
        txObj.email_status = emailResult.sent ? 'SENT' : (emailResult.fallback_wa ? 'QUOTA_FALLBACK' : 'FAILED');
      }

      // 4. Tulis ke TX_SHARD & STOCK_LEDGER_SHARD
      KiziyUtils.appendObjectRow(txSheet, txObj);
      KiziyUtils.appendObjectRowsBatch(itemsSheet, itemRowsToInsert);

      var payments = (payload.payments && payload.payments.length > 0)
        ? payload.payments
        : [{ method_id: 'PM_CASH', amount: txObj.grand_total, mdr_fee: 0, reference_no: '' }];

      var payRows = payments.map(function (p) {
        return {
          payment_id: KiziyUtils.uuid(),
          tx_id: txId,
          method_id: p.method_id,
          amount: Number(p.amount || 0),
          mdr_fee: Number(p.mdr_fee || 0),
          reference_no: p.reference_no || '',
          paid_at: nowIso
        };
      });
      KiziyUtils.appendObjectRowsBatch(paySheet, payRows);
      KiziyUtils.appendObjectRowsBatch(ledgerSheet, ledgerRowsToInsert);

      ShardManager.updateShardStats(txShard.record, txShard.ss);
      ShardManager.updateShardStats(ledgerShard.record, ledgerShard.ss);

      // 5. Jika stok minus saat sync, catat ke Audit_Logs (NEEDS_STOCK_REVIEW)
      if (needsStockReview) {
        PosService.logAudit_(outletId, session.user_id, 'NEEDS_STOCK_REVIEW', 'Transactions', txId, {
          offline_receipt_no: txObj.offline_receipt_no,
          conflicts: stockConflicts
        });
      }

      // 6. Update inkremental Daily_Summary
      SummaryEngine.applyTransactionDelta(dateStr, outletId, {
        tx_count: 1,
        gross_sales: txObj.subtotal,
        discount_total: txObj.discount_total,
        tax_total: txObj.tax_total,
        net_sales: txObj.grand_total - txObj.tax_total,
        total_cogs: totalCogs
      });

      return {
        tx: txObj,
        items: itemRowsToInsert,
        payments: payRows,
        email_result: emailResult
      };
    });
  },

  /**
   * Batch Checkout untuk sinkronisasi cepat antrian offline (mengurangi overhead openById)
   */
  checkoutBatch: function (session, txPayloads) {
    if (!txPayloads || !Array.isArray(txPayloads) || txPayloads.length === 0) {
      return { synced: 0, results: [] };
    }
    var results = [];
    for (var i = 0; i < txPayloads.length; i++) {
      results.push(PosService.checkout(session, txPayloads[i]));
    }
    return { synced: results.length, results: results };
  },

  /**
   * Void transaksi (termasuk transaksi lampau) + kembalikan stok + re-sync Daily_Summary
   */
  voidTransaction: function (session, txId, reason) {
    if (!txId) throw new Error('tx_id wajib diisi.');

    return KiziyUtils.withScriptLock(function () {
      var masterSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.MASTER_INDEX_ID);
      var shards = KiziyUtils.sheetToObjects(masterSs.getSheetByName('Shard_Registry'))
        .filter(function (s) { return s.domain_type === 'TX_SHARD'; });

      var foundTx = null;
      var foundSheet = null;
      var foundItems = [];

      for (var i = shards.length - 1; i >= 0; i--) {
        var ss = SpreadsheetApp.openById(shards[i].spreadsheet_id);
        var txSheet = ss.getSheetByName('Transactions');
        var txs = KiziyUtils.sheetToObjects(txSheet);
        var match = txs.find(function (t) { return t.tx_id === txId; });
        if (match) {
          foundTx = match;
          foundSheet = txSheet;
          foundItems = KiziyUtils.sheetToObjects(ss.getSheetByName('Transaction_Items'))
            .filter(function (it) { return it.tx_id === txId; });
          break;
        }
      }

      if (!foundTx) throw new Error('Transaksi tidak ditemukan: ' + txId);
      if (foundTx.tx_status === 'VOID') throw new Error('Transaksi sudah berstatus VOID.');

      var nowIso = KiziyUtils.nowIso();
      // Kolom 15: tx_status, 17: updated_at
      foundSheet.getRange(foundTx._rowIndex, 15).setValue('VOID');
      foundSheet.getRange(foundTx._rowIndex, 17).setValue(nowIso);

      // Kembalikan stok ke Stock_Balances & Stock_Ledger
      var invSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.INVENTORY_MASTER_ID);
      var stockSheet = invSs.getSheetByName('Stock_Balances');
      var stockRows = KiziyUtils.sheetToObjects(stockSheet);
      var ledgerShard = ShardManager.openActiveShardForWrite('STOCK_LEDGER_SHARD');
      var ledgerSheet = ledgerShard.ss.getSheetByName('Stock_Ledger');

      foundItems.forEach(function (it) {
        var qtyRestore = Number(it.base_qty_deducted || it.qty || 0);
        var balanceKey = foundTx.outlet_id + '|' + it.variant_id;
        var stockRec = stockRows.find(function (s) { return s.balance_key === balanceKey; });
        if (stockRec) {
          var nextQty = Number(stockRec.qty_on_hand || 0) + qtyRestore;
          stockSheet.getRange(stockRec._rowIndex, 4, 1, 2).setValues([[nextQty, nowIso]]);
          KiziyUtils.appendObjectRow(ledgerSheet, {
            ledger_id: KiziyUtils.uuid(),
            outlet_id: foundTx.outlet_id,
            variant_id: it.variant_id,
            tx_ref_id: txId,
            movement_type: 'RETURN',
            qty_delta: qtyRestore,
            stock_after: nextQty,
            notes: 'Void Tx: ' + (reason || '-'),
            created_by: session.user_id,
            created_at: nowIso
          });
        }
      });

      PosService.logAudit_(foundTx.outlet_id, session.user_id, 'VOID_TX', 'Transactions', txId, {
        reason: reason || ''
      });

      // WAJIB: Re-aggregate Daily_Summary untuk tanggal transaksi tersebut
      var txDate = String(foundTx.created_at || '').slice(0, 10);
      var summary = SummaryEngine.reAggregateDate(txDate, foundTx.outlet_id);

      return { tx_id: txId, status: 'VOID', daily_summary: summary };
    });
  },

  /**
   * Ambil daftar transaksi terbaru dari shard ACTIVE
   */
  listRecentTransactions: function (limit) {
    var active = ShardManager.getActiveShardRecord('TX_SHARD', true);
    if (!active) return [];
    var ss = SpreadsheetApp.openById(active.spreadsheet_id);
    var txs = KiziyUtils.sheetToObjects(ss.getSheetByName('Transactions'));
    txs.reverse();
    return txs.slice(0, limit || 50);
  },

  logAudit_: function (outletId, userId, action, targetTable, targetId, detailObj) {
    var auditShard = ShardManager.openActiveShardForWrite('AUDIT_SHARD');
    KiziyUtils.appendObjectRow(auditShard.ss.getSheetByName('Audit_Logs'), {
      log_id: KiziyUtils.uuid(),
      outlet_id: outletId,
      user_id: userId,
      action: action,
      target_table: targetTable,
      target_id: targetId,
      detail_json: JSON.stringify(detailObj || {}),
      created_at: KiziyUtils.nowIso()
    });
  }
};
