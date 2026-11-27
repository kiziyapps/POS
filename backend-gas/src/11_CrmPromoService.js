/**
 * KIZIY APPS - CrmPromoService
 * Mengelola Database Pelanggan, Loyalty Poin, Promo, dan Voucher
 */

const CrmPromoService = {
  listCustomers: function () {
    var crmSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.CRM_PROMO_ID);
    return KiziyUtils.sheetToObjects(crmSs.getSheetByName('Customers'));
  },

  saveCustomer: function (payload) {
    if (!payload || !payload.name) {
      throw new Error('Nama pelanggan wajib diisi.');
    }

    return KiziyUtils.withScriptLock(function () {
      var crmSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.CRM_PROMO_ID);
      var sheet = crmSs.getSheetByName('Customers');
      var nowIso = KiziyUtils.nowIso();

      var customerObj = {
        customer_id: payload.customer_id || ('CUST-' + KiziyUtils.uuid().slice(0, 8).toUpperCase()),
        name: payload.name,
        phone: payload.phone || '',
        email: payload.email || '',
        member_tier: payload.member_tier || 'SILVER',
        points_balance: Number(payload.points_balance || 0),
        total_spent: Number(payload.total_spent || 0),
        birth_date: payload.birth_date || '',
        created_at: nowIso
      };
      KiziyUtils.appendObjectRow(sheet, customerObj);
      return customerObj;
    });
  },

  addPoints: function (customerId, txRefId, pointsDelta, reason) {
    return KiziyUtils.withScriptLock(function () {
      var crmSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.CRM_PROMO_ID);
      var custSheet = crmSs.getSheetByName('Customers');
      var customers = KiziyUtils.sheetToObjects(custSheet);
      var target = customers.find(function (c) { return c.customer_id === customerId; });
      if (!target) throw new Error('Pelanggan tidak ditemukan: ' + customerId);

      var nextBalance = Number(target.points_balance || 0) + Number(pointsDelta || 0);
      custSheet.getRange(target._rowIndex, 6).setValue(nextBalance);

      var pointShard = ShardManager.openActiveShardForWrite('CRM_POINT_SHARD');
      KiziyUtils.appendObjectRow(pointShard.ss.getSheetByName('Customer_Point_Ledger'), {
        point_id: KiziyUtils.uuid(),
        customer_id: customerId,
        tx_ref_id: txRefId || '',
        points_delta: Number(pointsDelta || 0),
        balance_after: nextBalance,
        reason: reason || 'Transaksi Retail',
        created_at: KiziyUtils.nowIso()
      });

      return { customer_id: customerId, balance_after: nextBalance };
    });
  },

  savePromo: function (payload) {
    if (!payload || !payload.name) {
      throw new Error('Nama promo wajib diisi.');
    }

    return KiziyUtils.withScriptLock(function () {
      var crmSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.CRM_PROMO_ID);
      var promoObj = {
        promo_id: payload.promo_id || ('PRM-' + KiziyUtils.uuid().slice(0, 8).toUpperCase()),
        name: payload.name,
        type: payload.type || 'CART_DISCOUNT',
        rules_json: JSON.stringify(payload.rules || {}),
        start_at: payload.start_at || KiziyUtils.todayDateStr(),
        end_at: payload.end_at || '2099-12-31',
        is_active: true
      };
      KiziyUtils.appendObjectRow(crmSs.getSheetByName('Promos'), promoObj);
      return promoObj;
    });
  }
};
