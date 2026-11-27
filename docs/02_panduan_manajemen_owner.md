# Modul 2 — Panduan Operasional Manajemen (Owner / Manager)

## 1. Keamanan Awal (Wajib Setelah Instalasi)
1. Login menggunakan akun default (`username: admin`, `password: admin123`, `PIN: 123456`).
2. Buka file **`KIZIY_ORG_RBAC`** di Google Drive `/KIZIY_APPS_DATA/01_MASTER/` dan segera ubah `password_hash` / `pin_hash` atau tambahkan akun Kasir, Manager, dan Gudang sesuai kebutuhan.

## 2. Mengelola Produk, Varian & Foto Produk
1. Masuk ke menu **Produk & Stok**.
2. Klik **Tambah Produk**, isi Nama, SKU, Barcode, Varian, HPP (COGS), Harga Jual, dan Stok Awal.
3. Unggah foto produk—foto otomatis tersimpan di Google Drive (`/03_MEDIA_PRODUCTS/`) dan tampil cepat di layar kasir.
4. Gunakan tombol **(+ / -)** pada daftar stok untuk penyesuaian stok cepat (otomatis tercatat di `Stock_Ledger`).

## 3. Purchase Order (PO) & Biaya Operasional
1. Masuk ke menu **PO & Biaya**.
2. Untuk kulakan/restok dari supplier, pilih produk, masukkan qty & harga beli, lalu klik **Terbitkan PO**.
3. Saat barang fisik tiba di toko, klik **Terima Barang** pada daftar PO—stok toko dan `Stock_Ledger` otomatis bertambah.
4. Catat pengeluaran harian (listrik, plastik, bensin, dll.) di form **Biaya Operasional** agar otomatis mengurangi laporan laba bersih harian.

## 4. Audit & Laporan Manajemen
- **Audit Stok Minus (`NEEDS_STOCK_REVIEW`):** Buka menu **Riwayat**. Jika ada transaksi offline yang menyinkronkan stok melebihi sisa stok gudang, sistem tetap mencatat uang masuk tetapi memberi label **`NEEDS_STOCK_REVIEW`**. Segera lakukan pengecekan fisik/opname.
- **Void Transaksi:** Hanya role `OWNER` / `MANAGER` yang dapat melakukan **Void** di menu **Riwayat**. Stok otomatis kembali dan `Daily_Summary` otomatis dihitung ulang.
- **Analitik & Laporan Harian:** Masuk ke menu **Analitik** untuk melihat omzet & profit rentang tanggal/tahunan, kirim ulang laporan ke email manajemen, atau bagikan ringkasan ke grup WhatsApp manajemen.
