# KIZIY APPS — Data Dictionary & Struktur Google Sheets

> **Versi:** v1.0.0  
> **Tanggal:** 26 November 2026  
> **Strategi Penyimpanan:** Domain-Grouped (tabel yang ditulis bersamaan dalam 1 transaksi digabung dalam 1 file; tabel independen dipisah)  
> **Strategi Rollover Shard:** Murni berbasis kapasitas (**200.000 baris** per file shard, tanpa rollover bulanan; *safety guard* sel < 7.000.000 sel)

---

## 1. Struktur Folder Google Drive
```text
/KIZIY_APPS_DATA/
├── 01_MASTER/                  # File Master & Konfigurasi (Non-Sharded)
├── 02_DB_SHARDS/               # File Transaksional & Ledger (Auto-Rollover @ 200.000 baris)
├── 03_MEDIA_PRODUCTS/          # Gambar Produk & Logo (Disajikan via lh3.googleusercontent.com)
├── 04_INVOICES_PDF/            # Arsip Struk/Invoice PDF
└── 05_BACKUPS_EXPORTS/         # Ekspor Laporan & Snapshot Backup
```

---

## 2. Pemetaan File Spreadsheet (Domain-Grouped)

### A. Kelompok Master & Sistem (Non-Sharded, di `/01_MASTER/`)
| Nama File Spreadsheet | Tab (Tabel) di Dalamnya | Alasan Pengelompokan / Pemisahan |
| :--- | :--- | :--- |
| **`KIZIY_MASTER_INDEX`** | `Shard_Registry`, `Daily_Summary`, `App_Settings` | Pusat kontrol sistem, lokasi seluruh shard, dan agregasi laporan harian. |
| **`KIZIY_ORG_RBAC`** | `Outlets`, `Users`, `Roles_Permissions`, `Payment_Methods`, `Tax_Configs` | Data organisasi, staf, izin akses, dan konfigurasi kasir (dibaca saat login/init). |
| **`KIZIY_CATALOG`** | `Categories`, `Products`, `Product_Variants`, `Unit_Conversions`, `Tier_Prices`, `Bundle_Items` | Katalog retail lengkap (di-cache di `CacheService` & `IndexedDB` frontend). |
| **`KIZIY_INVENTORY_MASTER`** | `Stock_Balances`, `Suppliers` | `Stock_Balances` dipisah agar update stok cepat tanpa membebani file katalog. |
| **`KIZIY_CRM_PROMO`** | `Customers`, `Promos`, `Vouchers` | Data pelanggan dan aturan promosi/voucher. |
| **`KIZIY_HELD_CARTS`** | `Held_Carts` | Keranjang tersimpan (*Park Bill*) yang bersifat sementara/dinamis. |

### B. Kelompok Transaksional & Operasional (Sharded @ 200.000 Baris, di `/02_DB_SHARDS/`)
| Domain Shard | Prefix Nama File | Tab (Tabel) yang Digabung (Ditulis Bersamaan) |
| :--- | :--- | :--- |
| **`TX_SHARD`** | `KIZIY_TX_SHARD_001` | `Transactions`, `Transaction_Items`, `Transaction_Payments` |
| **`RETURN_SHARD`** | `KIZIY_RETURN_SHARD_001` | `Returns`, `Return_Items` |
| **`STOCK_LEDGER_SHARD`** | `KIZIY_LEDGER_001` | `Stock_Ledger` *(1 tabel = 1 file karena volume sangat tinggi)* |
| **`PO_SHARD`** | `KIZIY_PO_SHARD_001` | `Purchase_Orders`, `Purchase_Order_Items` |
| **`OPNAME_SHARD`** | `KIZIY_OPNAME_SHARD_001` | `Stock_Opnames`, `Stock_Opname_Items` |
| **`TRANSFER_SHARD`** | `KIZIY_TRANSFER_SHARD_001` | `Stock_Transfers`, `Stock_Transfer_Items` |
| **`SHIFT_CASH_SHARD`** | `KIZIY_SHIFT_SHARD_001` | `Shifts`, `Cash_Movements`, `Expenses` |
| **`CRM_POINT_SHARD`** | `KIZIY_POINT_SHARD_001` | `Customer_Point_Ledger` *(1 tabel = 1 file)* |
| **`AUDIT_SHARD`** | `KIZIY_AUDIT_001` | `Audit_Logs` *(1 tabel = 1 file, termasuk flag `NEEDS_STOCK_REVIEW`)* |
| **`NOTIF_SHARD`** | `KIZIY_NOTIF_001` | `Notification_Logs` *(1 tabel = 1 file, log Gmail & Fallback WA)* |

---

## 3. Spesifikasi Kolom Lengkap (~31 Tabel)

### 3.1 Sistem, Registry & Analitik (`KIZIY_MASTER_INDEX`)
1. **`Shard_Registry`**
   - `shard_id` (PK) | `domain_type` (`TX_SHARD`, `STOCK_LEDGER_SHARD`, dll.) | `spreadsheet_id` | `sequence_no` | `date_start` | `date_end` | `row_count` | `cell_count` | `status` (`ACTIVE` / `ARCHIVED`) | `created_at`
2. **`Daily_Summary`**
   - `summary_key` (PK: `YYYY-MM-DD|OUTLET_ID`) | `date` | `outlet_id` | `tx_count` | `gross_sales` | `discount_total` | `tax_total` | `net_sales` | `total_cogs` | `gross_profit` | `void_count` | `refund_total` | `expense_total` | `last_synced_at`
   - *Aturan Wajib:* Setiap mutasi/void/retur/penghapusan data lampau memicu *re-aggregate* untuk `summary_key` terkait.
3. **`App_Settings`**
   - `setting_key` (PK) | `setting_value` | `description` | `updated_at` | `updated_by`

### 3.2 Organisasi, Staf & Pembayaran (`KIZIY_ORG_RBAC`)
4. **`Outlets`**: `outlet_id` (PK) | `code` | `name` | `address` | `phone` | `email` | `receipt_header` | `receipt_footer` | `is_active`
5. **`Users`**: `user_id` (PK) | `username` | `full_name` | `pin_hash` | `password_hash` | `role_id` | `outlet_id` (`ALL` atau ID) | `is_active` | `last_login_at`
6. **`Roles_Permissions`**: `role_id` (PK) | `role_name` (`OWNER`, `MANAGER`, `SUPERVISOR`, `CASHIER`, `WAREHOUSE`) | `permissions_json`
7. **`Payment_Methods`**: `method_id` (PK) | `name` (`CASH`, `QRIS`, `TRANSFER`, `EDC_BCA`, dll.) | `type` | `mdr_percent` | `is_active`
8. **`Tax_Configs`**: `tax_id` (PK) | `name` (`PPN 11%`) | `rate_percent` | `is_inclusive` | `is_default` | `is_active`

### 3.3 Katalog Produk & Harga Retail (`KIZIY_CATALOG`)
9. **`Categories`**: `category_id` (PK) | `name` | `parent_id` | `sort_order` | `is_active`
10. **`Products`**: `product_id` (PK) | `name` | `category_id` | `description` | `base_unit` | `has_variants` | `is_bundle` | `drive_image_id` | `is_active` | `created_at`
11. **`Product_Variants`**: `variant_id` (PK) | `product_id` (FK) | `sku` | `barcode` | `variant_name` (misal `Merah / XL`) | `cogs` (HPP) | `sell_price` | `min_stock` | `is_active`
12. **`Unit_Conversions`**: `conv_id` (PK) | `variant_id` (FK) | `unit_name` (misal `Lusin`, `Dus`) | `barcode` | `multiplier_to_base` (misal `12`) | `unit_price`
13. **`Tier_Prices`**: `tier_id` (PK) | `variant_id` (FK) | `min_qty` | `member_tier` (`ALL`, `SILVER`, `GOLD`, `PLATINUM`) | `special_price`
14. **`Bundle_Items`**: `bundle_item_id` (PK) | `bundle_product_id` (FK) | `component_variant_id` (FK) | `qty`

### 3.4 Inventori Master (`KIZIY_INVENTORY_MASTER`)
15. **`Stock_Balances`**: `balance_key` (PK: `OUTLET_ID|VARIANT_ID`) | `outlet_id` | `variant_id` | `qty_on_hand` | `updated_at`
16. **`Suppliers`**: `supplier_id` (PK) | `name` | `contact_person` | `phone` | `email` | `address` | `payment_terms` | `is_active`

### 3.5 CRM, Promo & Hold Bill (`KIZIY_CRM_PROMO` & `KIZIY_HELD_CARTS`)
17. **`Customers`**: `customer_id` (PK) | `name` | `phone` | `email` | `member_tier` | `points_balance` | `total_spent` | `birth_date` | `created_at`
18. **`Promos`**: `promo_id` (PK) | `name` | `type` (`ITEM_DISCOUNT`, `CART_DISCOUNT`, `BUY_X_GET_Y`, `HAPPY_HOUR`) | `rules_json` | `start_at` | `end_at` | `is_active`
19. **`Vouchers`**: `voucher_code` (PK) | `promo_id` | `discount_type` (`PERCENT` / `FIXED`) | `discount_value` | `max_uses` | `used_count` | `expires_at` | `is_active`
20. **`Held_Carts`**: `hold_id` (PK) | `outlet_id` | `cashier_id` | `customer_id` | `label` | `cart_json` | `created_at`

### 3.6 Transaksi Kasir — `TX_SHARD` (Rollover @ 200.000 baris)
21. **`Transactions`**: `tx_id` (PK: `INV-YYYYMMDD-XXXX`) | `client_tx_uuid` (Idempotency) | `offline_receipt_no` (`OFF-...`) | `outlet_id` | `shift_id` | `cashier_id` | `customer_id` | `subtotal` | `discount_total` | `tax_total` | `rounding` | `grand_total` | `sync_status` (`SYNCED` / `NEEDS_STOCK_REVIEW`) | `email_status` | `tx_status` (`COMPLETED` / `VOID` / `PARTIAL_RETURN` / `FULL_RETURN`) | `created_at` | `updated_at`
22. **`Transaction_Items`**: `item_id` (PK) | `tx_id` (FK) | `variant_id` | `sku` | `product_name_snapshot` | `qty` | `unit_name` | `base_qty_deducted` | `unit_price` | `cogs_snapshot` | `discount_amount` | `line_total`
23. **`Transaction_Payments`**: `payment_id` (PK) | `tx_id` (FK) | `method_id` | `amount` | `mdr_fee` | `reference_no` | `paid_at`

### 3.7 Retur & Refund — `RETURN_SHARD` (Rollover @ 200.000 baris)
24. **`Returns`**: `return_id` (PK) | `tx_id` (FK) | `outlet_id` | `shift_id` | `authorized_by` | `reason` | `refund_total` | `refund_method` | `created_at`
25. **`Return_Items`**: `return_item_id` (PK) | `return_id` (FK) | `tx_item_id` | `variant_id` | `qty_returned` | `restock_flag` (`TRUE`/`FALSE`) | `refund_amount`

### 3.8 Ledger Stok, PO, Opname & Transfer (Sharded @ 200.000 baris)
26. **`Stock_Ledger`** (`STOCK_LEDGER_SHARD`): `ledger_id` (PK) | `outlet_id` | `variant_id` | `tx_ref_id` | `movement_type` (`SALE`, `RETURN`, `PO_IN`, `OPNAME_ADJ`, `TRANSFER_OUT`, `TRANSFER_IN`, `MANUAL_ADJ`) | `qty_delta` | `stock_after` | `notes` | `created_by` | `created_at`
27. **`Purchase_Orders`** & **`Purchase_Order_Items`** (`PO_SHARD`): Header PO (`po_id`, `supplier_id`, `outlet_id`, `status`, `total_cost`, `received_at`) & Detail Item (`po_item_id`, `po_id`, `variant_id`, `qty_ordered`, `qty_received`, `unit_cost`).
28. **`Stock_Opnames`** & **`Stock_Opname_Items`** (`OPNAME_SHARD`): Header Opname (`opname_id`, `outlet_id`, `status`, `created_by`, `approved_by`) & Detail (`variant_id`, `system_qty`, `physical_qty`, `variance_qty`, `variance_value`).
29. **`Stock_Transfers`** & **`Stock_Transfer_Items`** (`TRANSFER_SHARD`): Header Transfer (`transfer_id`, `from_outlet_id`, `to_outlet_id`, `status`) & Detail (`variant_id`, `qty_sent`, `qty_received`).

### 3.9 Shift, Keuangan, Poin, Audit & Notifikasi (Sharded @ 200.000 baris)
30. **`Shifts`, `Cash_Movements`, `Expenses`** (`SHIFT_CASH_SHARD`):
    - `Shifts`: `shift_id`, `outlet_id`, `cashier_id`, `opened_at`, `opening_cash`, `closed_at`, `expected_cash`, `actual_cash`, `variance`, `status`
    - `Cash_Movements`: `movement_id`, `shift_id`, `type` (`IN`/`OUT`), `amount`, `reason`, `created_at`
    - `Expenses`: `expense_id`, `outlet_id`, `shift_id`, `category`, `amount`, `notes`, `drive_receipt_id`, `created_at`
31. **`Customer_Point_Ledger`** (`CRM_POINT_SHARD`): `point_id`, `customer_id`, `tx_ref_id`, `points_delta`, `balance_after`, `reason`, `created_at`
32. **`Audit_Logs`** (`AUDIT_SHARD`): `log_id`, `outlet_id`, `user_id`, `action` (misal `VOID_TX`, `NEEDS_STOCK_REVIEW`, `EDIT_PAST_TX`, `PRICE_OVERRIDE`), `target_table`, `target_id`, `detail_json`, `created_at`
33. **`Notification_Logs`** (`NOTIF_SHARD`): `notif_id`, `channel` (`GMAIL` / `WHATSAPP_FALLBACK`), `recipient`, `subject_or_type`, `tx_ref_id`, `status` (`SENT` / `QUOTA_FALLBACK` / `FAILED`), `created_at`
