# Modul 1 — Panduan Teknis & Maintenance (Developer / IT)

## 1. Gambaran Arsitektur Monorepo
- `frontend/`: React + Vite + Tailwind CSS (PWA Offline-First dengan IndexedDB) — di-deploy otomatis ke **GitHub Pages** via `.github/workflows/deploy-pages.yml`.
- `backend-gas/`: Google Apps Script (GAS Standalone Web App) — mengelola API Gateway, Auth (`CacheService`), Auto-Sharding (`ShardManager`), Agregasi (`SummaryEngine`), Drive Media, dan Gmail.
- `DATA_DICTIONARY.md`: Referensi resmi seluruh 33 tabel & pemetaan file Google Sheets.

## 2. Langkah Setup & Deployment Awal

### A. Setup Backend GAS Standalone
1. Buka [script.google.com](https://script.google.com) dan buat project baru bernama **KIZIY APPS Backend** (atau gunakan `clasp` dengan menyalin `backend-gas/.clasp.json.example` menjadi `.clasp.json`).
2. Salin seluruh file di `backend-gas/src/` (`00_Config.js` s/d `12_ProcurementService.js`) dan `appsscript.json` ke project GAS.
3. Di GAS Editor, jalankan fungsi **`setupKiziyEnvironment()`** satu kali dan berikan izin akses (Drive, Sheets, Gmail).
   - Fungsi ini otomatis membuat folder `/KIZIY_APPS_DATA/` di Drive, 6 file Master, 10 file Shard awal (`001`), serta user default (`admin` / password `admin123` / PIN `123456`).
4. Jalankan fungsi **`installDailyReportTrigger()`** satu kali untuk menjadwalkan laporan harian manajemen otomatis via Gmail setiap pukul **22:00 WIB**.
5. Klik **Deploy → New Deployment → Web App**:
   - *Execute as:* **Me (Owner)**
   - *Who has access:* **Anyone**
   - Salin URL Web App (`https://script.google.com/macros/s/.../exec`).

### B. Setup Frontend (GitHub Pages)
1. Push repository ke GitHub pada branch `main` (aktifkan GitHub Pages dengan source **GitHub Actions**).
2. Atau set `VITE_GAS_WEBAPP_URL` di `.env` / GitHub Secrets, atau langsung tempel URL Web App GAS melalui tombol ikon **Gear (Pengaturan)** di halaman Login.

## 3. Mekanisme Penting & Troubleshooting
- **Auto-Sharding @ 200.000 Baris:** `ShardManager` memantau jumlah baris pada file shard aktif. Saat mencapai 200.000 baris, shard lama otomatis ditandai `ARCHIVED` di `KIZIY_MASTER_INDEX → Shard_Registry` dan file shard baru (`_002`, `_003`, dst.) otomatis dibuat.
- **Konsistensi `Daily_Summary`:** Setiap void/retur data lampau memanggil `SummaryEngine.reAggregateDate(date, outletId)` di dalam `LockService` agar laporan tahunan tetap akurat.
- **Batas Kuota Gmail:** Jika sisa kuota harian `MailApp` ≤ 15, sistem otomatis memblokir pengiriman invoice customer dan memberi sinyal ke frontend untuk menampilkan tombol **Fallback WhatsApp**.
- **Testing Lokal:** Jalankan `node --test backend-gas/tests/gas_contract.test.js` dan `cd frontend && npm run build` sebelum push perubahan.
