/**
 * KIZIY APPS - ProcurementService
 * Mengelola Purchase Order (PO), Stock Opname, dan Pengeluaran Operasional (Expenses)
 */

const ProcurementService = {
  /**
   * Buat Purchase Order baru ke Supplier
   */
  createPurchaseOrder: function (session, payload) {
    if (!payload || !payload.items || payload.items.length === 0) {
      throw new Error('Item Purchase Order tidak boleh kosong.');
    }

    return KiziyUtils.withScriptLock(function () {
      var poShard = ShardManager.openActiveShardForWrite('PO_SHARD');
      var poSheet = poShard.ss.getSheetByName('Purchase_Orders');
      var poItemsSheet = poShard.ss.getSheetByName('Purchase_Order_Items');

      var nowIso = KiziyUtils.nowIso();
      var poId = 'PO-' + KiziyUtils.todayDateStr().replace(/-/g, '') + '-' + KiziyUtils.uuid().slice(0, 4).toUpperCase();
      var outletId = payload.outlet_id || session.outlet_id || 'OUTLET_MAIN';
      if (outletId === 'ALL') outletId = 'OUTLET_MAIN';

      var totalCost = 0;
      var itemRows = payload.items.map(function (it) {
        var qty = Number(it.qty_ordered || 1);
        var cost = Number(it.unit_cost || 0);
        totalCost += qty * cost;
        return {
          po_item_id: KiziyUtils.uuid(),
          po_id: poId,
          variant_id: it.variant_id,
          qty_ordered: qty,
          qty_received: 0,
          unit_cost: cost
        };
      });

      var poObj = {
        po_id: poId,
        supplier_id: payload.supplier_id || 'SUP_GENERAL',
        outlet_id: outletId,
        status: 'ORDERED',
        total_cost: totalCost,
        created_by: session.user_id,
        created_at: nowIso,
        received_at: ''
      };

      KiziyUtils.appendObjectRow(poSheet, poObj);
      KiziyUtils.appendObjectRowsBatch(poItemsSheet, itemRows);
      ShardManager.updateShardStats(poShard.record, poShard.ss);

      return { po: poObj, items: itemRows };
    });
  },

  /**
   * Penerimaan Barang PO -> Tambah Stock_Balances + Catat Stock_Ledger (PO_IN)
   */
  receivePurchaseOrder: function (session, poId) {
    if (!poId) throw new Error('po_id wajib diisi.');

    return KiziyUtils.withScriptLock(function () {
      var poShard = ShardManager.openActiveShardForWrite('PO_SHARD');
      var poSheet = poShard.ss.getSheetByName('Purchase_Orders');
      var poItemsSheet = poShard.ss.getSheetByName('Purchase_Order_Items');

      var pos = KiziyUtils.sheetToObjects(poSheet);
      var targetPo = pos.find(function (p) { return p.po_id === poId; });
      if (!targetPo) throw new Error('PO tidak ditemukan: ' + poId);
      if (targetPo.status === 'RECEIVED') throw new Error('PO sudah diterima sebelumnya.');

      var nowIso = KiziyUtils.nowIso();
      poSheet.getRange(targetPo._rowIndex, 4).setValue('RECEIVED');
      poSheet.getRange(targetPo._rowIndex, 8).setValue(nowIso);

      var poItems = KiziyUtils.sheetToObjects(poItemsSheet).filter(function (i) { return i.po_id === poId; });
      var invSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.INVENTORY_MASTER_ID);
      var stockSheet = invSs.getSheetByName('Stock_Balances');
      var stockRows = KiziyUtils.sheetToObjects(stockSheet);
      var ledgerShard = ShardManager.openActiveShardForWrite('STOCK_LEDGER_SHARD');
      var ledgerSheet = ledgerShard.ss.getSheetByName('Stock_Ledger');

      poItems.forEach(function (it) {
        var qtyIn = Number(it.qty_ordered || 0);
        poItemsSheet.getRange(it._rowIndex, 5).setValue(qtyIn);

        var balanceKey = targetPo.outlet_id + '|' + it.variant_id;
        var stockRec = stockRows.find(function (s) { return s.balance_key === balanceKey; });
        var nextQty = (stockRec ? Number(stockRec.qty_on_hand || 0) : 0) + qtyIn;

        if (stockRec) {
          stockSheet.getRange(stockRec._rowIndex, 4, 1, 2).setValues([[nextQty, nowIso]]);
        } else {
          KiziyUtils.appendObjectRow(stockSheet, {
            balance_key: balanceKey,
            outlet_id: targetPo.outlet_id,
            variant_id: it.variant_id,
            qty_on_hand: nextQty,
            updated_at: nowIso
          });
        }

        KiziyUtils.appendObjectRow(ledgerSheet, {
          ledger_id: KiziyUtils.uuid(),
          outlet_id: targetPo.outlet_id,
          variant_id: it.variant_id,
          tx_ref_id: poId,
          movement_type: 'PO_IN',
          qty_delta: qtyIn,
          stock_after: nextQty,
          notes: 'Penerimaan PO ' + poId,
          created_by: session.user_id,
          created_at: nowIso
        });
      });

      return { po_id: poId, status: 'RECEIVED', items_received: poItems.length };
    });
  },

  /**
   * Stock Opname: Rekonsiliasi stok fisik vs sistem
   */
  submitStockOpname: function (session, payload) {
    if (!payload || !payload.items || payload.items.length === 0) {
      throw new Error('Item Stock Opname wajib diisi.');
    }

    return KiziyUtils.withScriptLock(function () {
      var opShard = ShardManager.openActiveShardForWrite('OPNAME_SHARD');
      var opSheet = opShard.ss.getSheetByName('Stock_Opnames');
      var opItemsSheet = opShard.ss.getSheetByName('Stock_Opname_Items');

      var nowIso = KiziyUtils.nowIso();
      var opId = 'OPN-' + KiziyUtils.todayDateStr().replace(/-/g, '') + '-' + KiziyUtils.uuid().slice(0, 4).toUpperCase();
      var outletId = payload.outlet_id || session.outlet_id || 'OUTLET_MAIN';
      if (outletId === 'ALL') outletId = 'OUTLET_MAIN';

      var invSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.INVENTORY_MASTER_ID);
      var stockSheet = invSs.getSheetByName('Stock_Balances');
      var stockRows = KiziyUtils.sheetToObjects(stockSheet);
      var ledgerShard = ShardManager.openActiveShardForWrite('STOCK_LEDGER_SHARD');
      var ledgerSheet = ledgerShard.ss.getSheetByName('Stock_Ledger');

      var opItems = [];
      payload.items.forEach(function (it) {
        var balanceKey = outletId + '|' + it.variant_id;
        var stockRec = stockRows.find(function (s) { return s.balance_key === balanceKey; });
        var sysQty = stockRec ? Number(stockRec.qty_on_hand || 0) : 0;
        var physQty = Number(it.physical_qty || 0);
        var variance = physQty - sysQty;

        opItems.push({
          opname_item_id: KiziyUtils.uuid(),
          opname_id: opId,
          variant_id: it.variant_id,
          system_qty: sysQty,
          physical_qty: physQty,
          variance_qty: variance,
          variance_value: variance * Number(it.cogs || 0)
        });

        if (variance !== 0) {
          if (stockRec) {
            stockSheet.getRange(stockRec._rowIndex, 4, 1, 2).setValues([[physQty, nowIso]]);
          } else {
            KiziyUtils.appendObjectRow(stockSheet, {
              balance_key: balanceKey,
              outlet_id: outletId,
              variant_id: it.variant_id,
              qty_on_hand: physQty,
              updated_at: nowIso
            });
          }

          KiziyUtils.appendObjectRow(ledgerSheet, {
            ledger_id: KiziyUtils.uuid(),
            outlet_id: outletId,
            variant_id: it.variant_id,
            tx_ref_id: opId,
            movement_type: 'OPNAME_ADJ',
            qty_delta: variance,
            stock_after: physQty,
            notes: 'Stock Opname ' + opId,
            created_by: session.user_id,
            created_at: nowIso
          });
        }
      });

      KiziyUtils.appendObjectRow(opSheet, {
        opname_id: opId,
        outlet_id: outletId,
        status: 'APPROVED',
        created_by: session.user_id,
        approved_by: session.user_id,
        created_at: nowIso,
        approved_at: nowIso
      });
      KiziyUtils.appendObjectRowsBatch(opItemsSheet, opItems);

      return { opname_id: opId, items: opItems };
    });
  },

  /**
   * Catat Pengeluaran Operasional Toko & update Daily_Summary.expense_total
   */
  recordExpense: function (session, payload) {
    if (!payload || !payload.amount || !payload.category) {
      throw new Error('Kategori dan nominal pengeluaran wajib diisi.');
    }

    return KiziyUtils.withScriptLock(function () {
      var shiftShard = ShardManager.openActiveShardForWrite('SHIFT_CASH_SHARD');
      var expSheet = shiftShard.ss.getSheetByName('Expenses');
      var nowIso = KiziyUtils.nowIso();
      var dateStr = String(nowIso).slice(0, 10);
      var outletId = payload.outlet_id || session.outlet_id || 'OUTLET_MAIN';
      if (outletId === 'ALL') outletId = 'OUTLET_MAIN';

      var expenseObj = {
        expense_id: 'EXP-' + KiziyUtils.uuid().slice(0, 8).toUpperCase(),
        outlet_id: outletId,
        shift_id: payload.shift_id || '',
        category: payload.category,
        amount: Number(payload.amount),
        notes: payload.notes || '',
        drive_receipt_id: payload.drive_receipt_id || '',
        created_at: nowIso
      };
      KiziyUtils.appendObjectRow(expSheet, expenseObj);

      SummaryEngine.applyTransactionDelta(dateStr, outletId, {
        expense_total: expenseObj.amount
      });

      return expenseObj;
    });
  },

  listRecentPurchaseOrders: function () {
    var active = ShardManager.getActiveShardRecord('PO_SHARD', true);
    if (!active) return [];
    var ss = SpreadsheetApp.openById(active.spreadsheet_id);
    var pos = KiziyUtils.sheetToObjects(ss.getSheetByName('Purchase_Orders'));
    pos.reverse();
    return pos.slice(0, 30);
  }
};
