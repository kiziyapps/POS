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
  },

  /**
   * Tambah varian baru pada produk yang sudah ada
   */
  addVariant: function (session, payload) {
    if (!payload || !payload.product_id || !payload.sku || !payload.variant_name) {
      throw new Error('product_id, sku, dan variant_name wajib diisi.');
    }

    return KiziyUtils.withScriptLock(function () {
      var catSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.CATALOG_ID);
      var varSheet = catSs.getSheetByName('Product_Variants');
      var variantId = 'VAR-' + KiziyUtils.uuid().slice(0, 8).toUpperCase();
      var variantObj = {
        variant_id: variantId,
        product_id: payload.product_id,
        sku: payload.sku,
        barcode: payload.barcode || payload.sku,
        variant_name: payload.variant_name,
        cogs: Number(payload.cogs || 0),
        sell_price: Number(payload.sell_price || 0),
        min_stock: Number(payload.min_stock || 5),
        is_active: true
      };
      KiziyUtils.appendObjectRow(varSheet, variantObj);

      var outletId = payload.outlet_id || session.outlet_id || 'OUTLET_MAIN';
      if (outletId === 'ALL') outletId = 'OUTLET_MAIN';
      var invSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.INVENTORY_MASTER_ID);
      KiziyUtils.appendObjectRow(invSs.getSheetByName('Stock_Balances'), {
        balance_key: outletId + '|' + variantId,
        outlet_id: outletId,
        variant_id: variantId,
        qty_on_hand: Number(payload.initial_stock || 0),
        updated_at: KiziyUtils.nowIso()
      });

      return variantObj;
    });
  },

  /**
   * Simpan aturan harga grosir / bertingkat (Tier_Prices)
   */
  saveTierPrice: function (payload) {
    if (!payload || !payload.variant_id || !payload.min_qty || !payload.special_price) {
      throw new Error('variant_id, min_qty, dan special_price wajib diisi.');
    }
    return KiziyUtils.withScriptLock(function () {
      var catSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.CATALOG_ID);
      var obj = {
        tier_id: 'TIER-' + KiziyUtils.uuid().slice(0, 8).toUpperCase(),
        variant_id: payload.variant_id,
        min_qty: Number(payload.min_qty),
        member_tier: payload.member_tier || 'ALL',
        special_price: Number(payload.special_price)
      };
      KiziyUtils.appendObjectRow(catSs.getSheetByName('Tier_Prices'), obj);
      return obj;
    });
  },

  /**
   * Simpan konversi multi-satuan (misal 1 Dus = 12 Pcs)
   */
  saveUnitConversion: function (payload) {
    if (!payload || !payload.variant_id || !payload.unit_name || !payload.multiplier_to_base) {
      throw new Error('variant_id, unit_name, dan multiplier_to_base wajib diisi.');
    }
    return KiziyUtils.withScriptLock(function () {
      var catSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.CATALOG_ID);
      var obj = {
        conv_id: 'CNV-' + KiziyUtils.uuid().slice(0, 8).toUpperCase(),
        variant_id: payload.variant_id,
        unit_name: payload.unit_name,
        barcode: payload.barcode || '',
        multiplier_to_base: Number(payload.multiplier_to_base),
        unit_price: Number(payload.unit_price || 0)
      };
      KiziyUtils.appendObjectRow(catSs.getSheetByName('Unit_Conversions'), obj);
      return obj;
    });
  },

  /**
   * Ambil Kartu Stok (Stock_Ledger) terbaru
   */
  getStockLedger: function (variantId, limit) {
    var active = ShardManager.getActiveShardRecord('STOCK_LEDGER_SHARD', true);
    if (!active) return [];
    var ss = SpreadsheetApp.openById(active.spreadsheet_id);
    var rows = KiziyUtils.sheetToObjects(ss.getSheetByName('Stock_Ledger'));
    if (variantId) {
      rows = rows.filter(function (r) { return r.variant_id === variantId; });
    }
    rows.reverse();
    return rows.slice(0, limit || 50);
  }
};
