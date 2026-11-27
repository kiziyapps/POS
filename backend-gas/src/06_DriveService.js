/**
 * KIZIY APPS - DriveService
 * Upload media produk ke Google Drive & generate URL CDN lh3.googleusercontent.com
 */

const DriveService = {
  /**
   * Upload gambar produk (Base64) ke folder /03_MEDIA_PRODUCTS/
   */
  uploadProductMedia: function (base64Data, fileName, mimeType) {
    if (!base64Data || !fileName) {
      throw new Error('Data file dan nama file wajib diisi.');
    }

    var folderId = PropertiesService.getScriptProperties().getProperty(KIZIY_CONFIG.PROP_KEYS.FOLDER_MEDIA_ID);
    if (!folderId) {
      throw new Error('Folder Media belum dikonfigurasi.');
    }

    var cleanBase64 = base64Data.indexOf('base64,') !== -1 ? base64Data.split('base64,')[1] : base64Data;
    var decoded = Utilities.base64Decode(cleanBase64);
    var blob = Utilities.newBlob(decoded, mimeType || 'image/jpeg', fileName);

    var folder = DriveApp.getFolderById(folderId);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var fileId = file.getId();
    return {
      file_id: fileId,
      cdn_url: this.getCdnUrl(fileId, 400),
      thumbnail_url: this.getCdnUrl(fileId, 160)
    };
  },

  /**
   * Format URL CDN Google (lh3) untuk mencegah rate limit / CORS di browser
   */
  getCdnUrl: function (fileId, width) {
    if (!fileId) return '';
    return 'https://lh3.googleusercontent.com/d/' + fileId + '=w' + (width || 400);
  }
};
