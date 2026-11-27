/**
 * KIZIY APPS - AuthService (Session Token via CacheService + Silent Refresh)
 */

const AuthService = {
  CACHE_PREFIX: 'KIZIY_SESS_',

  /**
   * Login dengan username + password atau PIN
   */
  login: function (username, secret, mode) {
    if (!username || !secret) {
      throw new Error('Username dan password/PIN wajib diisi.');
    }

    var orgSs = KiziyUtils.openSpreadsheetByProp(KIZIY_CONFIG.PROP_KEYS.ORG_RBAC_ID);
    var users = KiziyUtils.sheetToObjects(orgSs.getSheetByName('Users'));
    var roles = KiziyUtils.sheetToObjects(orgSs.getSheetByName('Roles_Permissions'));

    var targetUser = null;
    var secretHash = KiziyUtils.sha256(secret);

    for (var i = 0; i < users.length; i++) {
      var u = users[i];
      if (String(u.username).toLowerCase() === String(username).toLowerCase() && Boolean(u.is_active)) {
        var matchPassword = (mode !== 'PIN') && (u.password_hash === secretHash);
        var matchPin = (mode === 'PIN') && (u.pin_hash === secretHash);
        if (matchPassword || matchPin) {
          targetUser = u;
          break;
        }
      }
    }

    if (!targetUser) {
      throw new Error('Username atau kredensial tidak valid.');
    }

    var roleObj = roles.find(function (r) { return r.role_id === targetUser.role_id; });
    var permissions = roleObj ? JSON.parse(roleObj.permissions_json || '[]') : [];

    var token = KiziyUtils.uuid().replace(/-/g, '');
    var sessionData = {
      token: token,
      user_id: targetUser.user_id,
      username: targetUser.username,
      full_name: targetUser.full_name,
      role_id: targetUser.role_id,
      role_name: roleObj ? roleObj.role_name : 'CASHIER',
      outlet_id: targetUser.outlet_id,
      permissions: permissions,
      issued_at: KiziyUtils.nowIso()
    };

    var cache = CacheService.getScriptCache();
    cache.put(this.CACHE_PREFIX + token, JSON.stringify(sessionData), KIZIY_CONFIG.SESSION_TTL_SECONDS);

    // Update last_login_at
    var usersSheet = orgSs.getSheetByName('Users');
    usersSheet.getRange(targetUser._rowIndex, 9).setValue(KiziyUtils.nowIso());

    return {
      token: token,
      ttl_seconds: KIZIY_CONFIG.SESSION_TTL_SECONDS,
      user: sessionData
    };
  },

  /**
   * Verifikasi token dari CacheService
   */
  verifySession: function (token) {
    if (!token) {
      throw new Error('UNAUTHENTICATED: Token sesi tidak ditemukan.');
    }
    var cache = CacheService.getScriptCache();
    var raw = cache.get(this.CACHE_PREFIX + token);
    if (!raw) {
      throw new Error('SESSION_EXPIRED: Sesi telah berakhir. Silakan verifikasi ulang.');
    }
    return JSON.parse(raw);
  },

  /**
   * Silent Refresh saat kasir masih aktif sebelum TTL 6 jam habis
   */
  silentRefresh: function (oldToken) {
    var session = this.verifySession(oldToken);
    var newToken = KiziyUtils.uuid().replace(/-/g, '');
    session.token = newToken;
    session.refreshed_at = KiziyUtils.nowIso();

    var cache = CacheService.getScriptCache();
    cache.put(this.CACHE_PREFIX + newToken, JSON.stringify(session), KIZIY_CONFIG.SESSION_TTL_SECONDS);
    cache.remove(this.CACHE_PREFIX + oldToken);

    return {
      token: newToken,
      ttl_seconds: KIZIY_CONFIG.SESSION_TTL_SECONDS,
      user: session
    };
  },

  /**
   * Logout & hapus token
   */
  logout: function (token) {
    if (token) {
      CacheService.getScriptCache().remove(this.CACHE_PREFIX + token);
    }
    return { logged_out: true };
  },

  /**
   * Cek izin RBAC (mendukung wildcard '*' dan 'module.*')
   */
  requirePermission: function (session, requiredPerm) {
    var perms = session.permissions || [];
    if (perms.indexOf('*') !== -1) return true;
    if (perms.indexOf(requiredPerm) !== -1) return true;

    var prefix = requiredPerm.split('.')[0] + '.*';
    if (perms.indexOf(prefix) !== -1) return true;

    throw new Error('FORBIDDEN: Anda tidak memiliki izin untuk aksi (' + requiredPerm + ').');
  }
};
