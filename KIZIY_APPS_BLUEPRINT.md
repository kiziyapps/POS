# KIZIY APPS — Blueprint Konsep, Arsitektur & Implementation Plan

> **Status Dokumen:** Living Document (Aktif Diperbarui Setiap Keputusan Diskusi)  
> **Versi:** v2.1.0 (Fase 6 P0 Selesai — Thermal/WebBluetooth, Shift Blind Close, Batch Sync & Partial Return)  
> **Tanggal Pembaruan Terakhir:** 27 November 2026  
> **Target Brand:** KIZIY APPS (Enterprise-Grade Retail Web POS)

---

## 1. Tujuan Dokumen
Dokumen ini berfungsi sebagai **Single Source of Truth** untuk:
1. **Dasar Berpikir (Architectural Thinking):** Menyatukan visi bisnis dan desain teknis sistem KIZIY APPS.
2. **Panduan Eksekusi (Implementation Plan):** Peta jalan pengembangan bertahap dari fondasi hingga rilis produksi.
3. **Pelacak Progress & Celah Mekanisme (Progress & Gap Tracker):** Mencatat fitur yang sudah diputuskan, belum terealisasi, serta celah teknis yang wajib dipecahkan sebelum/selama implementasi.
4. **Modul Pembelajaran & Sosialisasi:** Menjadi kerangka materi edukasi bagi developer, admin/manajemen, dan kasir saat aplikasi siap disosialisasikan.

---

## 2. Stack & Arsitektur Sistem (Terkunci)

| Lapisan | Teknologi | Peran Utama |
| :--- | :--- | :--- |
| **Frontend** | **React + Vite + Tailwind CSS (PWA)** di GitHub Pages (Arsitektur Modular) | UI/UX Kasir Retail, Backoffice, Dashboard Analitik, Offline-First Queue (IndexedDB). |
| **Backend** | **Google Apps Script (GAS Standalone Web App)** | API Gateway (`doGet`/`doPost`), Business Logic, Session Auth (`CacheService`), Trigger Scheduler. |
| **Database** | **Google Sheets (Domain-Grouped + Auto-Sharding 200.000 Baris)** + **Daily Summary** | Tabel yang ditulis bersamaan digabung dalam 1 file; tabel lain terpisah. Rollover murni berbasis kapasitas 200.000 baris + tabel agregasi harian. |
| **File & Media Storage** | **Google Drive** (via Endpoint Thumbnail/CDN `lh3.googleusercontent.com`) | Penyimpanan gambar produk, logo struk, lampiran PDF invoice, ekspor laporan, dan arsip backup. |
| **Notifikasi Otomatis** | **Gmail** (via GAS `MailApp` + Quota Guard) | Pengiriman invoice/struk digital ke customer & laporan harian otomatis ke manajemen. |
| **Notifikasi Manual** | **WhatsApp** (`wa.me` Deep Link — Opsional & Auto-Fallback) | Pengiriman manual 1-klik untuk invoice/laporan, sekaligus **fallback otomatis** jika kuota Gmail mendekati batas. |

### Gambaran Aliran Data (High-Level)
```text
[GitHub Pages: React + Vite + Tailwind (PWA)]
   ├──► [IndexedDB] (Katalog Produk Offline & Antrian Transaksi Offline)
   │
   ▼ HTTPS POST/GET (Content-Type: text/plain + Session Token)
[GAS Standalone Web App]
   ├──► [CacheService] ──► Validasi Session Token & Cache Master Produk
   ├──► [KIZIY_MASTER_INDEX] ──► Shard Registry & Tabel Daily_Summary
   ├──► [Google Sheets Shards (DB_YYYY_MM_S1, S2, ...)]
   │       └──► Mutasi data lampau otomatis memicu re-sync ke Daily_Summary
   ├──► [Google Drive] ──► Media (CDN lh3) & Arsip File/Backup
   ├──► [Gmail] ──► Cek Quota ─┬─ Aman: Kirim Invoice/Laporan Otomatis
   │                           └─ Menipis: Flag Response -> Frontend tampilkan Fallback WA
   └──◄ [Response JSON] ──► Frontend
```

---

## 3. Cakupan Fitur Lengkap POS — Fokus Retail (KIZIY APPS)

### A. Modul Kasir & Transaksi Retail (Point of Sale)
- [ ] **Layar Kasir Cepat (Fast Checkout):** Pencarian produk instan (nama/SKU/barcode), scan barcode via scanner USB atau kamera, shortcut keyboard (F1–F12).
- [ ] **Varian & Harga Bertingkat (Retail Core):** Varian produk (ukuran, warna, model), SKU unik per varian, harga grosir/bertingkat (*tiered pricing* berdasarkan qty atau tier member).
- [ ] **Hold / Park Bill:** Simpan sementara keranjang belanja jika customer masih mengambil barang lain.
- [ ] **Multi-Payment & Split Bill:** Tunai (hitung kembalian otomatis), QRIS, Transfer Bank, EDC/Kartu, E-Wallet, atau kombinasi (Split Payment).
- [ ] **Pajak, Biaya Layanan & Pembulatan:** Konfigurasi PPN (inklusif/eksklusif) dan aturan pembulatan nominal.
- [ ] **Struk Digital & Cetak:** Cetak thermal printer (WebBluetooth / ESC-POS / Browser Print), kirim otomatis via Gmail, tombol kirim manual/fallback via WhatsApp.
- [ ] **Retur, Refund & Void:** Pembatalan transaksi atau retur sebagian item dengan otorisasi PIN Manager, pengembalian stok otomatis, serta **sinkronisasi ulang `Daily_Summary`**.

### B. Modul Inventori, Stok & Gudang
- [ ] **Master Produk & Kategori:** SKU, barcode, HPP (COGS), harga jual, harga grosir, multi-satuan (pcs/lusin/box dengan konversi stok otomatis).
- [ ] **Kartu Stok (Stock Ledger):** Log mutasi stok (*In, Out, Adjustment, Transfer, Sale, Return*) yang audit-ready.
- [ ] **Stok Opname (Stock Take):** Rekonsiliasi stok fisik vs sistem beserta laporan selisih nilai.
- [ ] **Manajemen Supplier & Purchase Order (PO):** Pembuatan PO, penerimaan barang (*Goods Receipt*), dan update HPP rata-rata/terakhir.
- [ ] **Peringatan Stok Menipis (Low Stock Alert):** Notifikasi otomatis saat stok menyentuh *minimum threshold*.
- [ ] **Multi-Outlet / Multi-Gudang:** Transfer stok antar cabang/gudang dan pemisahan stok/harga per outlet.

### C. Modul Pelanggan (CRM) & Promosi
- [ ] **Database Pelanggan:** Profil, nomor WA, email, histori belanja, segmentasi member.
- [ ] **Loyalty & Poin:** Akumulasi poin belanja, penukaran poin menjadi diskon/voucher, dan tiering member (Silver/Gold/Platinum).
- [ ] **Mesin Promo & Diskon Fleksibel:** Diskon nominal/persen per item atau per keranjang, Buy X Get Y, promo periode tanggal tertentu, kode voucher.

### D. Modul Manajemen Staff, Shift & Keamanan
- [ ] **Role-Based Access Control (RBAC):** Owner, Manager, Supervisor, Kasir, Staff Gudang dengan matriks izin granular.
- [ ] **Manajemen Shift Kasir (Open/Close Register):** Input modal awal (*opening cash*), pencatatan kas masuk/keluar (*petty cash*), tutup kasir (*blind close* / rekonsiliasi laci kas).
- [ ] **Audit Trail / Activity Log:** Mencatat siapa melakukan apa dan kapan (terutama aksi sensitif: void, edit harga, adjustment stok, ubah transaksi lampau).

### E. Modul Keuangan, Laporan & Analitik
- [ ] **Laporan Penjualan:** Harian, mingguan, bulanan, tahunan (via `Daily_Summary`), per kasir, per kategori, per produk terlaris, per metode pembayaran.
- [ ] **Laporan Laba Kotor (Gross Profit):** Perbandingan Omzet vs HPP vs Diskon.
- [ ] **Laporan Arus Kas & Pengeluaran Operasional:** Pencatatan biaya operasional harian toko.
- [ ] **Laporan Otomatis Harian ke Manajemen:** Dikirim terjadwal via Gmail (via Time-Driven Trigger) berisi ringkasan omzet, profit estimasi, transaksi void, dan stok kritis.

---

## 4. Desain Mekanisme Inti (Keputusan Terkunci)

### 1. Auto-Sharding Database (Domain-Grouped & Kapasitas 200.000 Baris) & Daily Summary
- **Strategi Grouping File (Domain-Grouped):**
  - Hanya tabel yang **selalu ditulis bersamaan dalam 1 transaksi** yang digabung dalam 1 file Spreadsheet (misal `TX_SHARD`: `Transactions`, `Transaction_Items`, `Transaction_Payments`; `PO_SHARD`: `Purchase_Orders`, `Purchase_Order_Items`, dst.) untuk meminimalkan latensi `openById()` di GAS.
  - Tabel master dan tabel independen lainnya disimpan terpisah agar kapasitas dan perawatannya bersih. Detail lengkap struktur file ada di [DATA_DICTIONARY.md](file:///Users/soviajewelry/Kiziy%20POS/DATA_DICTIONARY.md).
- **Strategi Rollover (Murni Kapasitas — Tanpa Rollover Bulanan):**
  - Shard aktif dirotasi secara otomatis **hanya ketika total baris pada file shard mencapai 200.000 baris** (dengan *safety guard* batas sel < 7.000.000 sel).
  - `KIZIY_MASTER_INDEX` menyimpan `Shard_Registry` (`shard_id`, `domain_type`, `spreadsheet_id`, `date_start`, `date_end`, `row_count`, `status: ACTIVE | ARCHIVED`).
- **Tabel `Daily_Summary` & Konsistensi Mutasi Lampau:**
  - Setiap transaksi sukses melakukan update inkremental pada baris tanggal terkait di `Daily_Summary` (menyimpan: `date`, `outlet_id`, `tx_count`, `gross_sales`, `discount_total`, `tax_total`, `net_sales`, `total_cogs`, `gross_profit`, `void_count`, `refund_total`).
  - **Aturan Wajib Konsistensi:** Apabila terjadi perubahan, void, retur, atau penghapusan pada transaksi lampau (baik di shard aktif maupun shard `ARCHIVED`), backend **wajib** menghitung ulang (*re-aggregate*) ringkasan untuk tanggal & outlet transaksi tersebut dari shard sumbernya, lalu menimpa baris terkait di `Daily_Summary` dalam satu blok `LockService`.

### 2. Autentikasi Session Token (`CacheService` + Silent Refresh) & Offline-First (PWA + IndexedDB)
- **Auth, CORS & Silent Refresh:**
  - Frontend mengirim request POST dengan `Content-Type: text/plain` untuk menghindari *CORS preflight* GAS.
  - Login memverifikasi kredensial/PIN terhadap sheet `Users`, lalu menerbitkan random `session_token` yang disimpan di `CacheService.getScriptCache()` (maksimal TTL 6 jam / 21.600 detik).
  - **Silent Refresh:** Selama kasir masih aktif di aplikasi (mendekati ambang batas TTL, misal di jam ke-4 atau ke-5), frontend otomatis memicu *silent refresh* di background untuk memperbarui `session_token` baru di `CacheService` tanpa mengganggu alur kasir. Jika kasir benar-benar *idle* melewati 6 jam, sistem meminta verifikasi cepat via PIN kasir.
- **Offline-First (PWA + IndexedDB) & Resolusi Konflik:**
  - Service Worker meng-cache aset statis React + Vite + Tailwind.
  - `IndexedDB` menyimpan salinan lokal **Master Produk, Varian, Harga Grosir, Pelanggan**, serta **Offline Transaction Queue**.
  - **Penomoran Struk Offline:** Saat offline, transaksi menggunakan nomor struk lokal unik (`OFF-{DEVICE_ID}-{SHORT_UUID}`) beserta `client_tx_uuid` (*idempotency key*). Saat koneksi kembali dan *sync* berhasil, server menerbitkan nomor struk resmi (`INV-YYYYMMDD-XXXX`) dan memetakan keduanya agar riwayat tetap terlacak.
  - **Konflik Stok Saat Sync:** Jika saat sinkronisasi stok di server ternyata kurang (karena terjual oleh kasir lain), transaksi **tetap dicatat masuk** (agar pembukuan uang tidak hilang), namun otomatis ditandai dengan status **`NEEDS_STOCK_REVIEW`** pada Audit Log untuk ditindaklanjuti oleh Manager/Gudang.

### 3. Gmail Quota Guard & Auto-Fallback ke WhatsApp
- Sebelum mengirim email invoice ke customer, GAS mengecek `MailApp.getRemainingDailyQuota()`.
- **Ambang Batas Cadangan (Quota Buffer):** Sisakan cadangan kuota (misal 10–15 email) khusus untuk **Laporan Harian Manajemen**.
- Jika kuota tersisa di bawah ambang batas aman, GAS tetap menyimpan transaksi, menandai `email_status: "QUOTA_EXCEEDED_FALLBACK_WA"`, dan frontend otomatis menampilkan/menyorot tombol **Kirim Struk via WhatsApp (`wa.me`)** lengkap dengan teks struk terformat.

### 4. Penyajian Media Google Drive via CDN
- Gambar produk diunggah ke folder Drive `/KIZIY_APPS_DATA/Media_Products`.
- Frontend merender gambar menggunakan URL CDN Google: `https://lh3.googleusercontent.com/d/{FILE_ID}=w400` (ukuran disesuaikan kebutuhan list/detail) dan di-cache oleh Service Worker PWA.

---

## 5. Celah Mekanisme & Topik Diskusi Lanjutan

### A. Celah yang Sudah Diputuskan (Fase 0 Selesai 100%)
- [x] Strategi Auto-Sharding & Cross-Shard Reporting → *Domain-Grouped untuk tabel yang ditulis bersamaan; Rollover murni kapasitas **200.000 baris** (tanpa rollover bulanan) + Tabel `Daily_Summary` dengan sync otomatis saat mutasi data lampau.*
- [x] CORS, Auth & Offline Resilience → *`text/plain` POST + Session Token di `CacheService` + Silent Refresh + PWA & IndexedDB.*
- [x] Konflik Stok & Penomoran Struk Offline → *Nomor lokal `OFF-{DEVICE_ID}-{SHORT_UUID}` dipetakan ke nomor resmi saat sync; stok kurang tetap masuk dengan flag `NEEDS_STOCK_REVIEW` di Audit Log.*
- [x] Batasan Kuota Gmail → *Quota Guard + Fallback otomatis ke tombol WhatsApp.*
- [x] Fokus Bisnis & Stack Frontend → *Retail POS + React + Vite + Tailwind (PWA Modular).*
- [x] Penyajian Media Drive → *Endpoint Thumbnail/CDN `lh3.googleusercontent.com`.*
- [x] Struktur Repository → **Monorepo** (`/frontend`, `/backend-gas`, `/docs`, `/.github/workflows`).
- [x] Skema Database Lengkap (~31 Tabel POS Retail) → Terdokumentasi di [DATA_DICTIONARY.md](file:///Users/soviajewelry/Kiziy%20POS/DATA_DICTIONARY.md).

### B. Celah Mekanisme Selanjutnya (Tahap Eksekusi)
- *(Seluruh celah arsitektur Fase 0 telah tertutup. Pemantauan risiko performa akan dilakukan saat Stress Test di Fase 5).*

---

## 6. Progress & Implementation Plan

### Status Saat Ini
- **Fase Aktif:** **Selesai (Ready for UAT, Deployment & Sosialisasi)**.
- **Terealisasi:**
  - [x] Fase 0: Blueprint & Data Dictionary (`KIZIY_APPS_BLUEPRINT.md`, `DATA_DICTIONARY.md`).
  - [x] Fase 1: Monorepo & Backend GAS Standalone (`00_Config.js` s/d `12_ProcurementService.js`).
  - [x] Fase 2: Fondasi Frontend React + Vite + Tailwind PWA (`offlineDb.mjs`, `gasClient.mjs`, `whatsapp.mjs`, `AuthContext.jsx`).
  - [x] Fase 3: MVP Kasir Retail (`PosPage.jsx`), Master Produk & Stok (`InventoryPage.jsx`), Riwayat & Void (`TransactionsPage.jsx`).
  - [x] Fase 4: Dashboard Analitik (`AnalyticsPage.jsx`), CRM & Promo (`CrmPromoPage.jsx`), PO & Biaya (`ProcurementPage.jsx`), & Trigger Laporan Harian Gmail (`installDailyReportTrigger`).
  - [x] Fase 5: Stress test *sharding rollover* @ 200.000 baris + *cross-shard void re-sync* (`gas_contract.test.js`) & 3 Paket Modul Pembelajaran (`/docs`).
- **Belum Terealisasi:**
  - *(Seluruh target implementasi Fase 0–5 telah selesai; siap untuk deployment ke GAS & GitHub Pages).*

### Roadmap Implementasi

- **Fase 0: Finalisasi Arsitektur & Skema Data (100% Selesai ✅)**
  - [x] Menentukan *Tech Stack* Frontend (React + Vite + Tailwind PWA Modular).
  - [x] Menetapkan fokus bisnis POS (Retail).
  - [x] Memutuskan strategi *Auto-Sharding* (Domain-Grouped, batas 200.000 baris tanpa rollover bulanan) & `Daily_Summary` re-sync.
  - [x] Menyepakati Auth (`CacheService` + Silent Refresh), Offline-Sync (IndexedDB + Mapping Struk + `NEEDS_STOCK_REVIEW`), Gmail Fallback WA, dan Drive CDN.
  - [x] Memutuskan struktur repository (**Monorepo**).
  - [x] Merancang & menyepakati skema lengkap seluruh tabel/sheet ([DATA_DICTIONARY.md](file:///Users/soviajewelry/Kiziy%20POS/DATA_DICTIONARY.md)).

- **Fase 1: Fondasi Backend (GAS Standalone) & Database Engine (100% Selesai ✅)**
  - [x] Setup Monorepo & project GAS (`appsscript.json`, `.clasp.json.example`, `deploy-pages.yml`).
  - [x] Pembuatan `02_Installer.js` (`setupKiziyEnvironment`), `00_Config.js`, & `04_ShardManager.js` (auto-rollover @ 200.000 baris, cross-shard reader).
  - [x] Implementasi `05_SummaryEngine.js` (inkremental update + `reAggregateDate` otomatis saat mutasi data lampau).
  - [x] Implementasi `03_AuthService.js` (`CacheService` + Silent Refresh), `06_DriveService.js`, `07_MailService.js` (Quota Guard + Fallback WA), `08_Router.js`, dan `LockService`.

- **Fase 2: Fondasi Frontend (React + Vite + Tailwind PWA) (100% Selesai ✅)**
  - [x] Setup project React + Vite + Tailwind + `vite-plugin-pwa` (Workbox cache aset & CDN Drive `lh3.googleusercontent.com`) + GitHub Actions deploy ke GitHub Pages.
  - [x] Implementasi IndexedDB wrapper (`offlineDb.mjs`) untuk katalog lokal, shift, & antrian transaksi offline.
  - [x] Implementasi API Client (`gasClient.mjs`: `text/plain` CORS bypass) & WhatsApp Deep Link (`whatsapp.mjs`).
  - [x] UI Login (Password/PIN + konfigurasi URL GAS), Silent Refresh (tiap 4 jam), RBAC helper, & Manajemen Shift (`ShiftPage.jsx`).

- **Fase 3: Fitur Inti POS Retail & Inventori (MVP Operasional) (100% Selesai ✅)**
  - [x] Backend `09_PosService.js` (`checkout` idempotent, `NEEDS_STOCK_REVIEW` audit log, `voidTransaction` + `SummaryEngine.reAggregateDate`) & `10_InventoryService.js`.
  - [x] Modul Master Produk, Varian, & Upload Gambar ke Drive (`InventoryPage.jsx`) + Penyesuaian Stok.
  - [x] Modul Kasir Retail (`PosPage.jsx`: Scan Barcode, Harga Bertingkat/Grosir `pricing.mjs`, Hold Bill, Diskon, PPN 11%, Multi-Payment, Offline Queue, Cetak Struk & Fallback WA).
  - [x] Modul Riwayat Transaksi, Sync Antrian Offline, & Void Transaksi (`TransactionsPage.jsx`).

- **Fase 4: Notifikasi, Laporan & Fitur Enterprise Lanjutan (100% Selesai ✅)**
  - [x] Integrasi Gmail (`07_MailService.js` + `installDailyReportTrigger()` pukul 22:00 WIB) + Quota Guard & Tombol WhatsApp Manual (`buildDailyReportWaUrl`).
  - [x] Modul CRM, Loyalty Poin, & Promo (`11_CrmPromoService.js` & `CrmPromoPage.jsx`).
  - [x] Modul PO/Supplier, Stock Opname, & Biaya Operasional (`12_ProcurementService.js` & `ProcurementPage.jsx`).
  - [x] Dashboard Analitik Tahunan berbasis `Daily_Summary` (`AnalyticsPage.jsx`).

- **Fase 5: Pengujian, Optimasi & Modul Sosialisasi (100% Selesai ✅)**
  - [x] Stress test simulasi *sharding rollover* @ 200.000 baris, *cross-shard void re-sync `Daily_Summary`*, & *offline sync idempotency* (`gas_contract.test.js` — 2/2 PASS).
  - [x] Penyusunan Modul Pembelajaran di `/docs/` ([01_panduan_teknis_developer.md](file:///Users/soviajewelry/Kiziy%20POS/docs/01_panduan_teknis_developer.md), [02_panduan_manajemen_owner.md](file:///Users/soviajewelry/Kiziy%20POS/docs/02_panduan_manajemen_owner.md), [03_panduan_kasir_frontliner.md](file:///Users/soviajewelry/Kiziy%20POS/docs/03_panduan_kasir_frontliner.md)).
  - [x] Verifikasi penuh Ring 0 Syntax Guard & Vite Production PWA Build.

---

## 7. Kerangka Modul Pembelajaran & Sosialisasi (Rancangan Awal)
Saat aplikasi siap disosialisasikan, dokumen ini akan diturunkan menjadi 3 paket materi:
1. **Modul 1 — Panduan Teknis & Maintenance (Developer/IT):** Arsitektur React-GAS-Sheets-Drive, cara kerja `ShardManager` & `Daily_Summary` re-sync, troubleshooting `CacheService`/kuota Gmail, dan deployment GitHub/clasp.
2. **Modul 2 — Panduan Operasional Manajemen (Owner/Manager):** Setup produk retail/varian/grosir, manajemen stok/PO/opname, membaca laporan harian Gmail, audit void/retur lampau, dan RBAC.
3. **Modul 3 — Panduan Cepat Kasir (Frontliner):** Buka/tutup shift, scan barcode & checkout cepat, transaksi mode offline, cetak struk, serta kirim invoice via Gmail atau fallback WhatsApp.

---

## 8. Log Keputusan Diskusi (Decision Log)
| Tanggal | Topik | Keputusan | Catatan |
| :--- | :--- | :--- | :--- |
| 26 Nov 2026 | Inisiasi Konsep | Stack ditetapkan: GitHub (FE), GAS Standalone (BE), Google Sheets Auto-Sharding (DB), Drive (Media), Gmail (Auto), WA (Manual Opsional). | Draft awal dibuat. |
| 26 Nov 2026 | Fokus Bisnis & FE Stack | Fokus **Retail**. Frontend menggunakan **React + Vite + Tailwind CSS (PWA)** berarsitektur modular. | Memprioritaskan fitur barcode, varian, grosir, stok. |
| 26 Nov 2026 | Sharding & Reporting | Sharding **kombinasi periode waktu + kapasitas**. Laporan tahunan via tabel **`Daily_Summary`** yang wajib **re-sync** setiap ada perubahan/hapus data lampau. | Menjamin konsistensi laporan lintas shard. |
| 26 Nov 2026 | Auth & Offline-First | Session token disimpan di **`CacheService` GAS** dengan masa berlaku. Frontend memakai **PWA + IndexedDB** (*Offline-First*). | Perlu mitigasi batas TTL 6 jam `CacheService`. |
| 26 Nov 2026 | Kuota Gmail & Media | **Auto-fallback ke tombol WhatsApp** saat kuota Gmail mendekati batas. Media Drive disajikan via **endpoint thumbnail/CDN Google**. | Menjaga kelancaran pengiriman struk & loading gambar. |
| 26 Nov 2026 | Silent Refresh & Offline Conflict | **Silent refresh** token `CacheService` saat kasir aktif. Struk offline `OFF-{DEVICE_ID}-{SHORT_UUID}` dipetakan ke nomor resmi saat sync; stok minus tetap masuk dengan flag **`NEEDS_STOCK_REVIEW`** di Audit Log. | Menjaga shift >6 jam tanpa logout paksa & nol kehilangan data transaksi offline. |
| 26 Nov 2026 | Struktur Repository | Menggunakan **Monorepo** (`/frontend`, `/backend-gas`, `/docs`, `/.github/workflows`). | Menjaga sinkronisasi kontrak API FE–BE & dokumentasi dalam satu repo. |
| 26 Nov 2026 | Granularitas File & Rollover | **Domain-Grouped** (gabungkan hanya tabel yang ditulis bersamaan dalam 1 transaksi; tabel lain terpisah). Rollover murni kapasitas **200.000 baris** (tanpa rollover bulanan). | Minimalkan latensi `openById()` saat checkout sekaligus menjaga efisiensi kapasitas. |
| 26 Nov 2026 | Skema Database POS | Disepakati ~31 tabel POS Retail lengkap dalam `DATA_DICTIONARY.md`. | Fase 0 ditutup 100%, siap masuk Fase 1. |
| 27 Nov 2026 | Scan Barcode Kamera | Penambahan `BarcodeScannerModal` (`html5-qrcode`) untuk input produk baru, pencarian/edit stok, penjualan kasir, dan input Purchase Order. | Mendukung kamera HP/laptop (iOS, Android, Desktop). |
