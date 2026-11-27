import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { callGasApi } from '../services/gasClient.mjs';
import { offlineDb } from '../services/offlineDb.mjs';
import { APP_CONSTANTS } from '../config/env.mjs';

const AuthContext = createContext(null);
const SESSION_STORAGE_KEY = 'kiziy_session';

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [bootstrapData, setBootstrapData] = useState(null);
  const [activeShift, setActiveShift] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [offlineQueueCount, setOfflineQueueCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncLockRef = useRef(false);

  const refreshQueueCount = useCallback(async () => {
    const queue = await offlineDb.getOfflineQueue();
    setOfflineQueueCount(queue.length);
    return queue;
  }, []);

  /**
   * Background Sync Worker: memproses antrian offline_tx_queue tanpa memblokir UI
   */
  const syncOfflineQueueNow = useCallback(async () => {
    if (syncLockRef.current || !navigator.onLine || !session?.token) return { synced: 0 };
    syncLockRef.current = true;
    setSyncing(true);
    let syncedCount = 0;

    try {
      const queue = await offlineDb.getOfflineQueue();
      queue.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));

      for (const item of queue) {
        await callGasApi('pos.checkout', item, session.token);
        await offlineDb.removeOfflineTx(item.client_tx_uuid);
        syncedCount += 1;
        await refreshQueueCount();
      }

      if (syncedCount > 0) {
        const fresh = await callGasApi('system.bootstrap', {}, session.token);
        if (fresh) {
          setBootstrapData(fresh);
          await offlineDb.saveBootstrapData(fresh);
        }
      }
    } catch (err) {
      console.warn('Background sync tertunda:', err.message);
    } finally {
      syncLockRef.current = false;
      setSyncing(false);
      await refreshQueueCount();
    }
    return { synced: syncedCount };
  }, [session?.token, refreshQueueCount]);

  /**
   * Optimistic Checkout (0ms): simpan lokal dulu, lalu sync di background
   */
  const enqueueAndSyncTx = useCallback(async (txPayload) => {
    await offlineDb.enqueueOfflineTx(txPayload);
    const updatedBoot = await offlineDb.applyOptimisticSale(txPayload);
    if (updatedBoot) setBootstrapData(updatedBoot);
    await refreshQueueCount();

    // Jalankan sync di background tanpa await agar UI langsung menampilkan struk
    if (navigator.onLine && session?.token) {
      setTimeout(() => {
        syncOfflineQueueNow();
      }, 50);
    }
    return txPayload;
  }, [session?.token, refreshQueueCount, syncOfflineQueueNow]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncOfflineQueueNow();
    };
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    refreshQueueCount();
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [refreshQueueCount, syncOfflineQueueNow]);

  // Auto-sync periodik tiap 30 detik jika masih ada antrian
  useEffect(() => {
    if (!session?.token || offlineQueueCount === 0) return undefined;
    const timer = setInterval(() => {
      if (navigator.onLine) syncOfflineQueueNow();
    }, 30000);
    return () => clearInterval(timer);
  }, [session?.token, offlineQueueCount, syncOfflineQueueNow]);

  useEffect(() => {
    let cancelled = false;
    async function initLocalData() {
      const cached = await offlineDb.getBootstrapData();
      if (!cancelled && cached) setBootstrapData(cached);

      const shift = await offlineDb.getActiveShift();
      if (!cancelled && shift) setActiveShift(shift);

      if (session?.token && navigator.onLine) {
        try {
          await syncOfflineQueueNow();
          setSyncing(true);
          const fresh = await callGasApi('system.bootstrap', {}, session.token);
          if (!cancelled && fresh) {
            setBootstrapData(fresh);
            await offlineDb.saveBootstrapData(fresh);
          }
        } catch (err) {
          console.warn('Bootstrap sync skipped:', err.message);
        } finally {
          if (!cancelled) setSyncing(false);
        }
      }
    }
    initLocalData();
    return () => { cancelled = true; };
  }, [session?.token, syncOfflineQueueNow]);

  useEffect(() => {
    if (!session?.token) return undefined;
    const interval = setInterval(async () => {
      if (!navigator.onLine) return;
      try {
        const refreshed = await callGasApi('auth.refresh', {}, session.token);
        const nextSession = { token: refreshed.token, user: refreshed.user };
        setSession(nextSession);
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
      } catch (err) {
        console.warn('Silent refresh gagal:', err.message);
      }
    }, APP_CONSTANTS.SILENT_REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [session?.token]);

  const login = async (username, secret, mode = 'PASSWORD') => {
    const res = await callGasApi('auth.login', { username, secret, mode });
    const nextSession = { token: res.token, user: res.user };
    setSession(nextSession);
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSession));
    return nextSession;
  };

  const logout = async () => {
    if (session?.token && navigator.onLine) {
      try {
        await callGasApi('auth.logout', {}, session.token);
      } catch (err) {
        console.warn('Logout server warning:', err.message);
      }
    }
    setSession(null);
    localStorage.removeItem(SESSION_STORAGE_KEY);
  };

  const openShift = async (openingCash, outletId) => {
    const shiftObj = {
      shift_id: 'SHF-' + Date.now(),
      outlet_id: outletId || session?.user?.outlet_id || 'OUTLET_MAIN',
      cashier_id: session?.user?.user_id,
      cashier_name: session?.user?.full_name,
      opening_cash: Number(openingCash || 0),
      opened_at: new Date().toISOString(),
      status: 'OPEN'
    };
    await offlineDb.saveActiveShift(shiftObj);
    setActiveShift(shiftObj);
    return shiftObj;
  };

  const closeShift = async () => {
    await offlineDb.clearActiveShift();
    setActiveShift(null);
  };

  const hasPermission = (perm) => {
    const perms = session?.user?.permissions || [];
    if (perms.includes('*') || perms.includes(perm)) return true;
    const prefix = perm.split('.')[0] + '.*';
    return perms.includes(prefix);
  };

  const contextValue = {
    session,
    user: session?.user || null,
    bootstrapData,
    activeShift,
    isOnline,
    offlineQueueCount,
    syncing,
    login,
    logout,
    openShift,
    closeShift,
    hasPermission,
    refreshQueueCount,
    enqueueAndSyncTx,
    syncOfflineQueueNow
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
