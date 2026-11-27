/**
 * KIZIY APPS - API Gateway Router (doGet / doPost)
 * Menggunakan Content-Type: text/plain pada POST dari React untuk bypass CORS preflight.
 */

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'system.health';
  if (action === 'system.health') {
    return KiziyUtils.jsonResponse(true, {
      app: KIZIY_CONFIG.APP_NAME,
      version: KIZIY_CONFIG.VERSION,
      status: 'ONLINE',
      remaining_gmail_quota: MailApp.getRemainingDailyQuota()
    });
  }
  return KiziyUtils.jsonResponse(false, null, 'Endpoint GET tidak didukung. Gunakan POST.');
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return KiziyUtils.jsonResponse(false, null, 'Payload request kosong.');
    }

    var body = JSON.parse(e.postData.contents);
    var action = body.action;
    var payload = body.payload || {};
    var token = body.token || '';

    // 1. Public Endpoints (Tanpa Session Token)
    if (action === 'auth.login') {
      return KiziyUtils.jsonResponse(true, AuthService.login(payload.username, payload.secret, payload.mode));
    }
    if (action === 'system.health') {
      return KiziyUtils.jsonResponse(true, { app: KIZIY_CONFIG.APP_NAME, version: KIZIY_CONFIG.VERSION, status: 'ONLINE' });
    }

    // 2. Protected Endpoints (Wajib Session Token Valid)
    var session = AuthService.verifySession(token);

    switch (action) {
      case 'auth.refresh':
        return KiziyUtils.jsonResponse(true, AuthService.silentRefresh(token));

      case 'auth.logout':
        return KiziyUtils.jsonResponse(true, AuthService.logout(token));

      case 'system.bootstrap':
        return KiziyUtils.jsonResponse(true, handleBootstrap_(session));

      case 'media.upload':
        AuthService.requirePermission(session, 'inventory.write');
        return KiziyUtils.jsonResponse(true, DriveService.uploadProductMedia(payload.base64, payload.file_name, payload.mime_type));

      case 'summary.range':
        AuthService.requirePermission(session, 'reports.view');
        return KiziyUtils.jsonResponse(true, handleGetSummaryRange_(payload.start_date, payload.end_date, payload.outlet_id));

      case 'summary.reaggregate':
        AuthService.requirePermission(session, 'void.manage');
        return KiziyUtils.jsonResponse(true, KiziyUtils.withScriptLock(function () {
          return SummaryEngine.reAggregateDate(payload.date, payload.outlet_id);
        }));

      case 'pos.checkout':
        AuthService.requirePermission(session, 'pos.checkout');
        return KiziyUtils.jsonResponse(true, PosService.checkout(session, payload));

      case 'pos.checkout_batch':
        AuthService.requirePermission(session, 'pos.checkout');
        return KiziyUtils.jsonResponse(true, PosService.checkoutBatch(session, payload.transactions));

      case 'pos.partial_return':
        AuthService.requirePermission(session, 'void.manage');
        return KiziyUtils.jsonResponse(true, ShiftReturnService.partialReturn(session, payload));

      case 'shift.open':
        AuthService.requirePermission(session, 'shift.manage');
        return KiziyUtils.jsonResponse(true, ShiftReturnService.openShift(session, payload));

      case 'shift.cash_movement':
        AuthService.requirePermission(session, 'shift.manage');
        return KiziyUtils.jsonResponse(true, ShiftReturnService.recordCashMovement(session, payload));

      case 'shift.close':
        AuthService.requirePermission(session, 'shift.manage');
        return KiziyUtils.jsonResponse(true, ShiftReturnService.closeShift(session, payload));

      case 'pos.void':
        AuthService.requirePermission(session, 'void.manage');
        return KiziyUtils.jsonResponse(true, PosService.voidTransaction(session, payload.tx_id, payload.reason));

      case 'pos.list_recent':
        return KiziyUtils.jsonResponse(true, PosService.listRecentTransactions(payload.limit));

      case 'inventory.save_product':
        AuthService.requirePermission(session, 'inventory.write');
        return KiziyUtils.jsonResponse(true, InventoryService.saveProduct(session, payload));

      case 'inventory.adjust_stock':
        AuthService.requirePermission(session, 'inventory.write');
        return KiziyUtils.jsonResponse(true, InventoryService.adjustStock(session, payload));

      case 'inventory.add_variant':
        AuthService.requirePermission(session, 'inventory.write');
        return KiziyUtils.jsonResponse(true, InventoryService.addVariant(session, payload));

      case 'inventory.save_tier_price':
        AuthService.requirePermission(session, 'inventory.write');
        return KiziyUtils.jsonResponse(true, InventoryService.saveTierPrice(payload));

      case 'inventory.save_unit_conversion':
        AuthService.requirePermission(session, 'inventory.write');
        return KiziyUtils.jsonResponse(true, InventoryService.saveUnitConversion(payload));

      case 'inventory.ledger':
        return KiziyUtils.jsonResponse(true, InventoryService.getStockLedger(payload.variant_id, payload.limit));

      case 'inventory.transfer_stock':
        AuthService.requirePermission(session, 'inventory.write');
        return KiziyUtils.jsonResponse(true, AdminService.transferStock(session, payload));

      case 'admin.list_users':
        AuthService.requirePermission(session, 'users.view');
        return KiziyUtils.jsonResponse(true, AdminService.listUsers());

      case 'admin.save_user':
        AuthService.requirePermission(session, '*');
        return KiziyUtils.jsonResponse(true, AdminService.saveUser(payload));

      case 'crm.list_customers':
        return KiziyUtils.jsonResponse(true, CrmPromoService.listCustomers());

      case 'crm.save_customer':
        AuthService.requirePermission(session, 'customers.create');
        return KiziyUtils.jsonResponse(true, CrmPromoService.saveCustomer(payload));

      case 'crm.save_promo':
        AuthService.requirePermission(session, 'inventory.write');
        return KiziyUtils.jsonResponse(true, CrmPromoService.savePromo(payload));

      case 'po.list':
        return KiziyUtils.jsonResponse(true, ProcurementService.listRecentPurchaseOrders());

      case 'po.create':
        AuthService.requirePermission(session, 'po.write');
        return KiziyUtils.jsonResponse(true, ProcurementService.createPurchaseOrder(session, payload));

      case 'po.receive':
        AuthService.requirePermission(session, 'po.write');
        return KiziyUtils.jsonResponse(true, ProcurementService.receivePurchaseOrder(session, payload.po_id));

      case 'opname.submit':
        AuthService.requirePermission(session, 'opname.write');
        return KiziyUtils.jsonResponse(true, ProcurementService.submitStockOpname(session, payload));

      case 'expense.record':
        AuthService.requirePermission(session, 'shift.manage');
        return KiziyUtils.jsonResponse(true, ProcurementService.recordExpense(session, payload));

      case 'report.send_daily':
        AuthService.requirePermission(session, 'reports.view');
        return KiziyUtils.jsonResponse(true, MailService.sendDailyManagementReport(payload.date));

      default:
        return KiziyUtils.jsonResponse(false, null, 'Action tidak dikenal: ' + action);
    }
  } catch (err) {
    return KiziyUtils.jsonResponse(false, null, err.message);
  }
}

/**
 * Mengirim data master awal untuk sinkronisasi IndexedDB PWA di Frontend
 */
function handleBootstrap_(session) {
  var orgSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.ORG_RBAC_ID);
  var catSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.CATALOG_ID);
  var invSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.INVENTORY_MASTER_ID);
  var crmSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.CRM_PROMO_ID);

  return {
    user: session,
    outlets: KiziyUtils.sheetToObjects(orgSs.getSheetByName('Outlets')),
    payment_methods: KiziyUtils.sheetToObjects(orgSs.getSheetByName('Payment_Methods')),
    tax_configs: KiziyUtils.sheetToObjects(orgSs.getSheetByName('Tax_Configs')),
    categories: KiziyUtils.sheetToObjects(catSs.getSheetByName('Categories')),
    products: KiziyUtils.sheetToObjects(catSs.getSheetByName('Products')),
    variants: KiziyUtils.sheetToObjects(catSs.getSheetByName('Product_Variants')),
    unit_conversions: KiziyUtils.sheetToObjects(catSs.getSheetByName('Unit_Conversions')),
    tier_prices: KiziyUtils.sheetToObjects(catSs.getSheetByName('Tier_Prices')),
    stock_balances: KiziyUtils.sheetToObjects(invSs.getSheetByName('Stock_Balances')),
    customers: KiziyUtils.sheetToObjects(crmSs.getSheetByName('Customers')),
    promos: KiziyUtils.sheetToObjects(crmSs.getSheetByName('Promos')),
    vouchers: KiziyUtils.sheetToObjects(crmSs.getSheetByName('Vouchers'))
  };
}

function handleGetSummaryRange_(startDate, endDate, outletId) {
  var masterSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.MASTER_INDEX_ID);
  var rows = KiziyUtils.sheetToObjects(masterSs.getSheetByName('Daily_Summary'));
  return rows.filter(function (r) {
    var d = String(r.date || '');
    var matchDate = (!startDate || d >= startDate) && (!endDate || d <= endDate);
    var matchOutlet = !outletId || outletId === 'ALL' || r.outlet_id === outletId;
    return matchDate && matchOutlet;
  });
}
