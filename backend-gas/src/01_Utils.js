/**
 * KIZIY APPS - Shared Utilities
 */

const KiziyUtils = {
  /**
   * Generate UUID v4 via GAS Utilities
   */
  uuid: function () {
    return Utilities.getUuid();
  },

  /**
   * Format tanggal ISO dengan timezone Asia/Jakarta
   */
  nowIso: function () {
    return Utilities.formatDate(new Date(), KIZIY_CONFIG.TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
  },

  /**
   * Format tanggal YYYY-MM-DD
   */
  todayDateStr: function (dateObj) {
    var d = dateObj || new Date();
    return Utilities.formatDate(d, KIZIY_CONFIG.TIMEZONE, 'yyyy-MM-dd');
  },

  /**
   * SHA-256 Hex Hash untuk password/PIN
   */
  sha256: function (rawText) {
    var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(rawText));
    return digest.map(function (byte) {
      var v = (byte < 0) ? byte + 256 : byte;
      return ('0' + v.toString(16)).slice(-2);
    }).join('');
  },

  /**
   * Standardized JSON Response untuk GAS Web App
   */
  jsonResponse: function (ok, data, errorMsg, meta) {
    var payload = {
      ok: Boolean(ok),
      timestamp: this.nowIso(),
      data: ok ? (data !== undefined ? data : null) : null,
      error: ok ? null : (errorMsg || 'Unknown error'),
      meta: meta || {}
    };
    return ContentService
      .createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);
  },

  /**
   * Buka Spreadsheet dengan error handling jelas
   */
  openSpreadsheetByProp: function (propKey) {
    var id = PropertiesService.getScriptProperties().getProperty(propKey);
    if (!id) {
      throw new Error('Property ' + propKey + ' belum dikonfigurasi. Jalankan setupKiziyEnvironment() terlebih dahulu.');
    }
    return SpreadsheetApp.openById(id);
  },

  /**
   * Konversi seluruh baris sheet (header di baris 1) menjadi array of objects
   */
  sheetToObjects: function (sheet) {
    if (!sheet) return [];
    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    if (lastRow < 2 || lastCol < 1) return [];

    var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
    var headers = values[0];
    var results = [];

    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      var obj = { _rowIndex: i + 1 };
      var hasContent = false;
      for (var c = 0; c < headers.length; c++) {
        var key = String(headers[c]).trim();
        if (key) {
          obj[key] = row[c];
          if (row[c] !== '' && row[c] !== null && row[c] !== undefined) {
            hasContent = true;
          }
        }
      }
      if (hasContent) results.push(obj);
    }
    return results;
  },

  /**
   * Append 1 baris object sesuai urutan header kolom
   */
  appendObjectRow: function (sheet, obj) {
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var row = headers.map(function (h) {
      var val = obj[String(h).trim()];
      return val !== undefined ? val : '';
    });
    sheet.appendRow(row);
  },

  /**
   * Batch append array of objects (jauh lebih cepat dari appendRow di loop)
   */
  appendObjectRowsBatch: function (sheet, objects) {
    if (!objects || objects.length === 0) return;
    var lastCol = sheet.getLastColumn();
    var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var rows = objects.map(function (obj) {
      return headers.map(function (h) {
        var val = obj[String(h).trim()];
        return val !== undefined ? val : '';
      });
    });
    var startRow = sheet.getLastRow() + 1;
    sheet.getRange(startRow, 1, rows.length, headers.length).setValues(rows);
  },

  /**
   * Jalankan fungsi di dalam ScriptLock dengan timeout standar
   */
  withScriptLock: function (fn, timeoutMs) {
    var lock = LockService.getScriptLock();
    var wait = timeoutMs || 15000;
    if (!lock.tryLock(wait)) {
      throw new Error('Server sedang sibuk memproses transaksi lain. Silakan coba beberapa detik lagi.');
    }
    try {
      return fn();
    } finally {
      lock.releaseLock();
    }
  }
};
