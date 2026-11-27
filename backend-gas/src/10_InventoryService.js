/**
 * KIZIY APPS - InventoryService
 * Mengelola Master Produk, Varian, dan Penyesuaian Stok (Stock Adjustment)
 */

const InventoryService = {
  /**
   * Tambah produk baru beserta varian default dan stok awal
   */
  saveProduct: function (session, payload) {
    if (!payload || !payload.name || !payload.sku) {
      throw new Error('Nama produk dan SKU wajib diisi.');
    }

    return KiziyUtils.withScriptLock(function () {
      var catSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.CATALOG_ID);
      var prodSheet = catSs.getSheetByName('Products');
      var varSheet = catSs.getSheetByName('Product_Variants');
      var nowIso = KiziyUtils.nowIso();

      var productId = payload.product_id || ('PRD-' + KiziyUtils.uuid().slice(0, 8).toUpperCase());
      var variantId = payload.variant_id || ('VAR-' + KiziyUtils.uuid().slice(0, 8).toUpperCase());

      KiziyUtils.appendObjectRow(prodSheet, {
        product_id: productId,
        name: payload.name,
        category_id: payload.category_id || 'CAT_GENERAL',
        description: payload.description || '',
        base_unit: payload.base_unit || 'pcs',
        has_variants: Boolean(payload.variant_name),
        is_bundle: false,
        drive_image_id: payload.drive_image_id || '',
        is_active: true,
        created_at: nowIso
      });

      var variantObj = {
        variant_id: variantId,
        product_id: productId,
        sku: payload.sku,
        barcode: payload.barcode || payload.sku,
        variant_name: payload.variant_name || 'Standard',
        cogs: Number(payload.cogs || 0),
        sell_price: Number(payload.sell_price || 0),
        min_stock: Number(payload.min_stock || 5),
        is_active: true
      };
      KiziyUtils.appendObjectRow(varSheet, variantObj);

      // Set stok awal jika diisi
      var outletId = payload.outlet_id || session.outlet_id || 'OUTLET_MAIN';
      if (outletId === 'ALL') outletId = 'OUTLET_MAIN';
      var initialStock = Number(payload.initial_stock || 0);

      var invSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.INVENTORY_MASTER_ID);
      var stockSheet = invSs.getSheetByName('Stock_Balances');
      KiziyUtils.appendObjectRow(stockSheet, {
        balance_key: outletId + '|' + variantId,
        outlet_id: outletId,
        variant_id: variantId,
        qty_on_hand: initialStock,
        updated_at: nowIso
      });

      if (initialStock !== 0) {
        var ledgerShard = ShardManager.openActiveShardForWrite('STOCK_LEDGER_SHARD');
        KiziyUtils.appendObjectRow(ledgerShard.ss.getSheetByName('Stock_Ledger'), {
          ledger_id: KiziyUtils.uuid(),
          outlet_id: outletId,
          variant_id: variantId,
          tx_ref_id: productId,
          movement_type: 'MANUAL_ADJ',
          qty_delta: initialStock,
          stock_after: initialStock,
          notes: 'Stok Awal Produk Baru',
          created_by: session.user_id,
          created_at: nowIso
        });
      }

      return { product_id: productId, variant: variantObj, initial_stock: initialStock };
    });
  },

  /**
   * Penyesuaian stok manual (Stock In / Adjustment)
   */
  adjustStock: function (session, payload) {
    if (!payload || !payload.variant_id || payload.qty_delta === undefined) {
      throw new Error('variant_id dan qty_delta wajib diisi.');
    }

    return KiziyUtils.withScriptLock(function () {
      var outletId = payload.outlet_id || session.outlet_id || 'OUTLET_MAIN';
      if (outletId === 'ALL') outletId = 'OUTLET_MAIN';
      var delta = Number(payload.qty_delta);
      var nowIso = KiziyUtils.nowIso();

      var invSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.INVENTORY_MASTER_ID);
      var stockSheet = invSs.getSheetByName('Stock_Balances');
      var stockRows = KiziyUtils.sheetToObjects(stockSheet);

      var balanceKey = outletId + '|' + payload.variant_id;
      var stockRec = stockRows.find(function (s) { return s.balance_key === balanceKey; });
      var currentQty = stockRec ? Number(stockRec.qty_on_hand || 0) : 0;
      var nextQty = currentQty + delta;

      if (stockRec) {
        stockSheet.getRange(stockRec._rowIndex, 4, 1, 2).setValues([[nextQty, nowIso]]);
      } else {
        KiziyUtils.appendObjectRow(stockSheet, {
          balance_key: balanceKey,
          outlet_id: outletId,
          variant_id: payload.variant_id,
          qty_on_hand: nextQty,
          updated_at: nowIso
        });
      }

      var ledgerShard = ShardManager.openActiveShardForWrite('STOCK_LEDGER_SHARD');
      KiziyUtils.appendObjectRow(ledgerShard.ss.getSheetByName('Stock_Ledger'), {
        ledger_id: KiziyUtils.uuid(),
        outlet_id: outletId,
        variant_id: payload.variant_id,
        tx_ref_id: 'ADJ-' + Date.now(),
        movement_type: 'MANUAL_ADJ',
        qty_delta: delta,
        stock_after: nextQty,
        notes: payload.notes || 'Penyesuaian Stok Manual',
        created_by: session.user_id,
        created_at: nowIso
      });

      return { balance_key: balanceKey, qty_on_hand: nextQty };
    });
  }
};
