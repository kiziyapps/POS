/**
 * KIZIY APPS - AdminService
 * Mengelola User/Staff RBAC, Outlet, dan Transfer Stok Antar Cabang
 */

const AdminService = {
  listUsers: function () {
    var orgSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.ORG_RBAC_ID);
    var users = KiziyUtils.sheetToObjects(orgSs.getSheetByName('Users'));
    return users.map(function (u) {
      return {
        user_id: u.user_id,
        username: u.username,
        full_name: u.full_name,
        role_id: u.role_id,
        outlet_id: u.outlet_id,
        is_active: Boolean(u.is_active),
        last_login_at: u.last_login_at
      };
    });
  },

  saveUser: function (payload) {
    if (!payload || !payload.username || !payload.full_name || !payload.password) {
      throw new Error('Username, nama lengkap, dan password wajib diisi.');
    }

    return KiziyUtils.withScriptLock(function () {
      var orgSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.ORG_RBAC_ID);
      var sheet = orgSs.getSheetByName('Users');
      var existing = KiziyUtils.sheetToObjects(sheet);
      var dup = existing.find(function (u) {
        return String(u.username).toLowerCase() === String(payload.username).toLowerCase();
      });
      if (dup) throw new Error('Username sudah terdaftar: ' + payload.username);

      var userObj = {
        user_id: 'USR-' + KiziyUtils.uuid().slice(0, 8).toUpperCase(),
        username: payload.username.trim(),
        full_name: payload.full_name.trim(),
        pin_hash: KiziyUtils.sha256(payload.pin || '123456'),
        password_hash: KiziyUtils.sha256(payload.password),
        role_id: payload.role_id || 'ROLE_CASHIER',
        outlet_id: payload.outlet_id || 'OUTLET_MAIN',
        is_active: true,
        last_login_at: ''
      };
      KiziyUtils.appendObjectRow(sheet, userObj);
      return {
        user_id: userObj.user_id,
        username: userObj.username,
        full_name: userObj.full_name,
        role_id: userObj.role_id,
        outlet_id: userObj.outlet_id,
        is_active: true
      };
    });
  },

  transferStock: function (session, payload) {
    if (!payload || !payload.from_outlet_id || !payload.to_outlet_id || !payload.variant_id || !payload.qty) {
      throw new Error('Outlet asal, tujuan, varian, dan qty wajib diisi.');
    }
    if (payload.from_outlet_id === payload.to_outlet_id) {
      throw new Error('Outlet asal dan tujuan tidak boleh sama.');
    }

    return KiziyUtils.withScriptLock(function () {
      var qty = Number(payload.qty);
      var nowIso = KiziyUtils.nowIso();
      var transferId = 'TRF-' + KiziyUtils.todayDateStr().replace(/-/g, '') + '-' + KiziyUtils.uuid().slice(0, 4).toUpperCase();

      var invSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.INVENTORY_MASTER_ID);
      var stockSheet = invSs.getSheetByName('Stock_Balances');
      var stockRows = KiziyUtils.sheetToObjects(stockSheet);

      var fromKey = payload.from_outlet_id + '|' + payload.variant_id;
      var toKey = payload.to_outlet_id + '|' + payload.variant_id;
      var fromRec = stockRows.find(function (s) { return s.balance_key === fromKey; });
      var toRec = stockRows.find(function (s) { return s.balance_key === toKey; });

      var fromAfter = (fromRec ? Number(fromRec.qty_on_hand || 0) : 0) - qty;
      var toAfter = (toRec ? Number(toRec.qty_on_hand || 0) : 0) + qty;

      if (fromRec) {
        stockSheet.getRange(fromRec._rowIndex, 4, 1, 2).setValues([[fromAfter, nowIso]]);
      } else {
        KiziyUtils.appendObjectRow(stockSheet, {
          balance_key: fromKey, outlet_id: payload.from_outlet_id, variant_id: payload.variant_id, qty_on_hand: fromAfter, updated_at: nowIso
        });
      }

      if (toRec) {
        stockSheet.getRange(toRec._rowIndex, 4, 1, 2).setValues([[toAfter, nowIso]]);
      } else {
        KiziyUtils.appendObjectRow(stockSheet, {
          balance_key: toKey, outlet_id: payload.to_outlet_id, variant_id: payload.variant_id, qty_on_hand: toAfter, updated_at: nowIso
        });
      }

      var ledgerShard = ShardManager.openActiveShardForWrite('STOCK_LEDGER_SHARD');
      KiziyUtils.appendObjectRowsBatch(ledgerShard.ss.getSheetByName('Stock_Ledger'), [
        {
          ledger_id: KiziyUtils.uuid(),
          outlet_id: payload.from_outlet_id,
          variant_id: payload.variant_id,
          tx_ref_id: transferId,
          movement_type: 'TRANSFER_OUT',
          qty_delta: -qty,
          stock_after: fromAfter,
          notes: 'Transfer ke ' + payload.to_outlet_id,
          created_by: session.user_id,
          created_at: nowIso
        },
        {
          ledger_id: KiziyUtils.uuid(),
          outlet_id: payload.to_outlet_id,
          variant_id: payload.variant_id,
          tx_ref_id: transferId,
          movement_type: 'TRANSFER_IN',
          qty_delta: qty,
          stock_after: toAfter,
          notes: 'Transfer dari ' + payload.from_outlet_id,
          created_by: session.user_id,
          created_at: nowIso
        }
      ]);

      var trfShard = ShardManager.openActiveShardForWrite('TRANSFER_SHARD');
      KiziyUtils.appendObjectRow(trfShard.ss.getSheetByName('Stock_Transfers'), {
        transfer_id: transferId,
        from_outlet_id: payload.from_outlet_id,
        to_outlet_id: payload.to_outlet_id,
        status: 'COMPLETED',
        created_by: session.user_id,
        created_at: nowIso,
        received_at: nowIso
      });
      KiziyUtils.appendObjectRow(trfShard.ss.getSheetByName('Stock_Transfer_Items'), {
        transfer_item_id: KiziyUtils.uuid(),
        transfer_id: transferId,
        variant_id: payload.variant_id,
        qty_sent: qty,
        qty_received: qty
      });

      return { transfer_id: transferId, from_after: fromAfter, to_after: toAfter };
    });
  }
};
