/**
 * KIZIY APPS - One-Click Environment Installer
 * Jalankan fungsi setupKiziyEnvironment() sekali dari Apps Script Editor
 * untuk membuat seluruh folder Drive, 6 Master Files, 10 Initial Shards, dan Admin default.
 */

function setupKiziyEnvironment() {
  return KiziyUtils.withScriptLock(function () {
    var props = PropertiesService.getScriptProperties();

    // 1. Buat Struktur Folder Google Drive
    var rootFolder = getOrCreateFolder_(DriveApp.getRootFolder(), KIZIY_CONFIG.DRIVE_FOLDERS.ROOT);
    var masterFolder = getOrCreateFolder_(rootFolder, KIZIY_CONFIG.DRIVE_FOLDERS.MASTER);
    var shardsFolder = getOrCreateFolder_(rootFolder, KIZIY_CONFIG.DRIVE_FOLDERS.SHARDS);
    var mediaFolder = getOrCreateFolder_(rootFolder, KIZIY_CONFIG.DRIVE_FOLDERS.MEDIA);
    var invoicesFolder = getOrCreateFolder_(rootFolder, KIZIY_CONFIG.DRIVE_FOLDERS.INVOICES);
    var backupsFolder = getOrCreateFolder_(rootFolder, KIZIY_CONFIG.DRIVE_FOLDERS.BACKUPS);

    props.setProperties({
      [KIZIY_CONFIG.PROP_KEYS.ROOT_FOLDER_ID]: rootFolder.getId(),
      [KIZIY_CONFIG.PROP_KEYS.FOLDER_MASTER_ID]: masterFolder.getId(),
      [KIZIY_CONFIG.PROP_KEYS.FOLDER_SHARDS_ID]: shardsFolder.getId(),
      [KIZIY_CONFIG.PROP_KEYS.FOLDER_MEDIA_ID]: mediaFolder.getId(),
      [KIZIY_CONFIG.PROP_KEYS.FOLDER_INVOICES_ID]: invoicesFolder.getId(),
      [KIZIY_CONFIG.PROP_KEYS.FOLDER_BACKUPS_ID]: backupsFolder.getId()
    });

    // 2. Buat 6 Master Spreadsheet Files
    Object.keys(MASTER_FILE_SCHEMAS).forEach(function (fileName) {
      var schema = MASTER_FILE_SCHEMAS[fileName];
      var existingId = props.getProperty(schema.propKey);
      if (!existingId) {
        var ss = createSpreadsheetWithTabs_(fileName, schema.tabs, masterFolder);
        props.setProperty(schema.propKey, ss.getId());
      }
    });

    // 3. Buat Initial Shard (001) untuk setiap Domain Shard jika belum ada
    Object.keys(SHARD_DOMAIN_SCHEMAS).forEach(function (domainType) {
      var activeShard = ShardManager.getActiveShardRecord(domainType, true);
      if (!activeShard) {
        ShardManager.createNewShard(domainType, 1);
      }
    });

    // 4. Seed Data Awal (Outlet Pusat, Role RBAC, Owner Default, Payment Methods, Tax)
    seedInitialMasterData_();

    return {
      status: 'INSTALLED',
      rootFolderId: rootFolder.getId(),
      masterIndexId: props.getProperty(KIZIY_CONFIG.PROP_KEYS.MASTER_INDEX_ID)
    };
  }, 30000);
}

/**
 * Pasang Time-Driven Trigger untuk Laporan Harian Manajemen pukul 22:00 WIB
 */
function installDailyReportTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === 'runScheduledDailyReport') {
      ScriptApp.deleteTrigger(t);
    }
  });
  ScriptApp.newTrigger('runScheduledDailyReport')
    .timeBased()
    .everyDays(1)
    .atHour(22)
    .create();
  return { status: 'TRIGGER_INSTALLED', hour: 22 };
}

function runScheduledDailyReport() {
  return MailService.sendDailyManagementReport();
}

function getOrCreateFolder_(parent, name) {
  var iter = parent.getFoldersByName(name);
  if (iter.hasNext()) return iter.next();
  return parent.createFolder(name);
}

function createSpreadsheetWithTabs_(title, tabsMap, targetFolder) {
  var ss = SpreadsheetApp.create(title);
  var file = DriveApp.getFileById(ss.getId());
  file.moveTo(targetFolder);

  var tabNames = Object.keys(tabsMap);
  var defaultSheet = ss.getSheets()[0];

  tabNames.forEach(function (tabName, idx) {
    var sheet = idx === 0 ? defaultSheet : ss.insertSheet(tabName);
    if (idx === 0) sheet.setName(tabName);

    var headers = tabsMap[tabName];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  });

  return ss;
}

function seedInitialMasterData_() {
  var orgSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.ORG_RBAC_ID);

  // Seed Outlet Default
  var outletsSheet = orgSs.getSheetByName('Outlets');
  if (outletsSheet.getLastRow() < 2) {
    KiziyUtils.appendObjectRow(outletsSheet, {
      outlet_id: 'OUTLET_MAIN',
      code: 'MAIN',
      name: 'KIZIY Store Pusat',
      address: 'Jl. Utama No. 1',
      phone: '081234567890',
      email: Session.getActiveUser().getEmail() || '',
      receipt_header: 'KIZIY APPS RETAIL POS',
      receipt_footer: 'Terima kasih telah berbelanja!',
      is_active: true
    });
  }

  // Seed Roles
  var rolesSheet = orgSs.getSheetByName('Roles_Permissions');
  if (rolesSheet.getLastRow() < 2) {
    KiziyUtils.appendObjectRowsBatch(rolesSheet, [
      { role_id: 'ROLE_OWNER', role_name: 'OWNER', permissions_json: JSON.stringify(['*']) },
      { role_id: 'ROLE_MANAGER', role_name: 'MANAGER', permissions_json: JSON.stringify(['pos.*', 'inventory.*', 'reports.*', 'void.*', 'users.view']) },
      { role_id: 'ROLE_CASHIER', role_name: 'CASHIER', permissions_json: JSON.stringify(['pos.checkout', 'pos.hold', 'shift.manage', 'customers.create']) },
      { role_id: 'ROLE_WAREHOUSE', role_name: 'WAREHOUSE', permissions_json: JSON.stringify(['inventory.*', 'po.*', 'opname.*']) }
    ]);
  }

  // Seed Owner Default (username: admin, PIN: 123456, password: admin123 — WAJIB diganti saat produksi)
  var usersSheet = orgSs.getSheetByName('Users');
  if (usersSheet.getLastRow() < 2) {
    KiziyUtils.appendObjectRow(usersSheet, {
      user_id: 'USR_OWNER_01',
      username: 'admin',
      full_name: 'Owner Kiziy',
      pin_hash: KiziyUtils.sha256('123456'),
      password_hash: KiziyUtils.sha256('admin123'),
      role_id: 'ROLE_OWNER',
      outlet_id: 'ALL',
      is_active: true,
      last_login_at: ''
    });
  }

  // Seed Payment Methods
  var pmSheet = orgSs.getSheetByName('Payment_Methods');
  if (pmSheet.getLastRow() < 2) {
    KiziyUtils.appendObjectRowsBatch(pmSheet, [
      { method_id: 'PM_CASH', name: 'Tunai', type: 'CASH', mdr_percent: 0, is_active: true },
      { method_id: 'PM_QRIS', name: 'QRIS', type: 'QRIS', mdr_percent: 0.7, is_active: true },
      { method_id: 'PM_TRANSFER', name: 'Transfer Bank', type: 'TRANSFER', mdr_percent: 0, is_active: true },
      { method_id: 'PM_EDC', name: 'Kartu Debit/Kredit', type: 'EDC', mdr_percent: 1.5, is_active: true }
    ]);
  }

  // Seed Tax
  var taxSheet = orgSs.getSheetByName('Tax_Configs');
  if (taxSheet.getLastRow() < 2) {
    KiziyUtils.appendObjectRow(taxSheet, {
      tax_id: 'TAX_PPN11',
      name: 'PPN 11%',
      rate_percent: 11,
      is_inclusive: false,
      is_default: false,
      is_active: true
    });
  }
}
