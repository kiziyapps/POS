/**
 * KIZIY APPS - ShardManager (Domain-Grouped + Auto-Rollover @ 200.000 Baris)
 */

const ShardManager = {
  /**
   * Ambil record shard ACTIVE untuk domain tertentu dari KIZIY_MASTER_INDEX
   */
  getActiveShardRecord: function (domainType, allowNull) {
    var masterSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.MASTER_INDEX_ID);
    var regSheet = masterSs.getSheetByName('Shard_Registry');
    var rows = KiziyUtils.sheetToObjects(regSheet);

    for (var i = rows.length - 1; i >= 0; i--) {
      if (rows[i].domain_type === domainType && rows[i].status === 'ACTIVE') {
        return rows[i];
      }
    }
    if (allowNull) return null;
    throw new Error('Shard ACTIVE tidak ditemukan untuk domain: ' + domainType);
  },

  /**
   * Buat file shard baru di /02_DB_SHARDS/ dan daftarkan ke Shard_Registry
   */
  createNewShard: function (domainType, sequenceNo) {
    var schema = SHARD_DOMAIN_SCHEMAS[domainType];
    if (!schema) throw new Error('Domain shard tidak dikenal: ' + domainType);

    var shardsFolderId = PropertiesService.getScriptProperties().getProperty(KIZIY_CONFIG.PROP_KEYS.FOLDER_SHARDS_ID);
    var shardsFolder = DriveApp.getFolderById(shardsFolderId);

    var seqPadded = ('000' + sequenceNo).slice(-3);
    var title = schema.prefix + '_' + seqPadded;
    var ss = createSpreadsheetWithTabs_(title, schema.tabs, shardsFolder);

    var today = KiziyUtils.todayDateStr();
    var shardRecord = {
      shard_id: domainType + '_' + seqPadded,
      domain_type: domainType,
      spreadsheet_id: ss.getId(),
      sequence_no: sequenceNo,
      date_start: today,
      date_end: '',
      row_count: 0,
      cell_count: 0,
      status: 'ACTIVE',
      created_at: KiziyUtils.nowIso()
    };

    var masterSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.MASTER_INDEX_ID);
    var regSheet = masterSs.getSheetByName('Shard_Registry');
    KiziyUtils.appendObjectRow(regSheet, shardRecord);
    shardRecord._rowIndex = regSheet.getLastRow();

    return shardRecord;
  },

  /**
   * Buka Spreadsheet shard ACTIVE untuk menulis, sekaligus cek kapasitas rollover
   */
  openActiveShardForWrite: function (domainType) {
    var record = this.getActiveShardRecord(domainType, false);
    var ss = SpreadsheetApp.openById(record.spreadsheet_id);

    // Hitung total baris & sel seluruh tab di dalam file shard
    var stats = this.computeSpreadsheetUsage_(ss);
    if (stats.totalRows >= KIZIY_CONFIG.SHARD_MAX_ROWS || stats.totalCells >= KIZIY_CONFIG.SHARD_MAX_CELLS_SAFETY) {
      // Archive shard lama & buat shard baru
      this.archiveAndRollover_(record, stats);
      var newRecord = this.createNewShard(domainType, Number(record.sequence_no) + 1);
      ss = SpreadsheetApp.openById(newRecord.spreadsheet_id);
      record = newRecord;
    }

    return { record: record, ss: ss };
  },

  /**
   * Update statistik penggunaan baris/sel setelah penulisan
   */
  updateShardStats: function (shardRecord, ss) {
    var stats = this.computeSpreadsheetUsage_(ss);
    var masterSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.MASTER_INDEX_ID);
    var regSheet = masterSs.getSheetByName('Shard_Registry');
    // Kolom 7: row_count, Kolom 8: cell_count
    regSheet.getRange(shardRecord._rowIndex, 7, 1, 2).setValues([[stats.totalRows, stats.totalCells]]);
  },

  /**
   * Ambil daftar seluruh shard yang beririsan dengan rentang tanggal tertentu (Cross-Shard Query)
   */
  getShardsByDateRange: function (domainType, startDate, endDate) {
    var masterSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.MASTER_INDEX_ID);
    var rows = KiziyUtils.sheetToObjects(masterSs.getSheetByName('Shard_Registry'));

    return rows.filter(function (r) {
      if (r.domain_type !== domainType) return false;
      var sStart = String(r.date_start || '');
      var sEnd = String(r.date_end || '9999-12-31');
      return (sStart <= endDate) && (sEnd >= startDate);
    });
  },

  computeSpreadsheetUsage_: function (ss) {
    var sheets = ss.getSheets();
    var totalRows = 0;
    var totalCells = 0;
    for (var i = 0; i < sheets.length; i++) {
      var r = Math.max(0, sheets[i].getLastRow() - 1); // exclude header
      var c = sheets[i].getLastColumn();
      totalRows += r;
      totalCells += (sheets[i].getLastRow() * c);
    }
    return { totalRows: totalRows, totalCells: totalCells };
  },

  archiveAndRollover_: function (record, stats) {
    var masterSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.MASTER_INDEX_ID);
    var regSheet = masterSs.getSheetByName('Shard_Registry');
    var today = KiziyUtils.todayDateStr();
    // Kolom 6: date_end, 7: row_count, 8: cell_count, 9: status
    regSheet.getRange(record._rowIndex, 6, 1, 4).setValues([[
      today,
      stats.totalRows,
      stats.totalCells,
      'ARCHIVED'
    ]]);
  }
};
