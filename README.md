# KIZIY APPS — Enterprise Retail Web POS

Aplikasi Web POS Retail lengkap berbasis arsitektur **Zero-Cost / Low-Maintenance Cloud**:
- **Frontend:** React + Vite + Tailwind CSS (PWA, Offline-First via IndexedDB) di **GitHub Pages**
- **Backend:** **Google Apps Script (GAS)** Standalone Web App
- **Database:** **Google Sheets** (*Domain-Grouped* + *Auto-Sharding* kapasitas 200.000 baris + `Daily_Summary`)
- **Storage:** **Google Drive** (Media via CDN `lh3.googleusercontent.com` & Arsip PDF/Backup)
- **Notifikasi:** **Gmail** (Auto Invoice & Laporan Harian) + **WhatsApp** (`wa.me` Manual & Auto-Fallback)

## Struktur Monorepo
- `frontend/` — Aplikasi Web POS PWA (Fase 2–4)
- `backend-gas/` — Backend Google Apps Script (Fase 1)
- `docs/` — Dokumentasi Teknis & Modul Pembelajaran/Sosialisasi (Fase 5)
- `.github/workflows/` — CI/CD otomatis ke GitHub Pages

## Dokumen Utama
- [KIZIY_APPS_BLUEPRINT.md](./KIZIY_APPS_BLUEPRINT.md) — Konsep, Arsitektur, Celah Mekanisme & Implementation Plan
- [DATA_DICTIONARY.md](./DATA_DICTIONARY.md) — Spesifikasi Lengkap 33 Tabel & Pemetaan File Sheets
