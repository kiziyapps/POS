/**
 * KIZIY APPS - Global Configuration & Schema Registry
 * Mengacu pada DATA_DICTIONARY.md v1.0.0
 */

const KIZIY_CONFIG = {
  APP_NAME: 'KIZIY APPS',
  VERSION: '1.0.0',
  TIMEZONE: 'Asia/Jakarta',

  // Batas Rollover Shard (Murni Kapasitas, tanpa rollover bulanan)
  SHARD_MAX_ROWS: 200000,
  SHARD_MAX_CELLS_SAFETY: 7000000,

  // CacheService TTL (GAS max 21600 detik / 6 jam)
  SESSION_TTL_SECONDS: 18000, // 5 jam (buffer sebelum 6 jam untuk silent refresh)
  CATALOG_CACHE_TTL_SECONDS: 3600, // 1 jam

  // Gmail Quota Buffer (sisakan untuk Laporan Harian Manajemen)
  GMAIL_QUOTA_RESERVE_FOR_REPORT: 15,

  // Property Keys di PropertiesService.getScriptProperties()
  PROP_KEYS: {
    ROOT_FOLDER_ID: 'KIZIY_ROOT_FOLDER_ID',
    MASTER_INDEX_ID: 'KIZIY_MASTER_INDEX_ID',
    ORG_RBAC_ID: 'KIZIY_ORG_RBAC_ID',
    CATALOG_ID: 'KIZIY_CATALOG_ID',
    INVENTORY_MASTER_ID: 'KIZIY_INVENTORY_MASTER_ID',
    CRM_PROMO_ID: 'KIZIY_CRM_PROMO_ID',
    HELD_CARTS_ID: 'KIZIY_HELD_CARTS_ID',
    FOLDER_MASTER_ID: 'KIZIY_FOLDER_MASTER_ID',
    FOLDER_SHARDS_ID: 'KIZIY_FOLDER_SHARDS_ID',
    FOLDER_MEDIA_ID: 'KIZIY_FOLDER_MEDIA_ID',
    FOLDER_INVOICES_ID: 'KIZIY_FOLDER_INVOICES_ID',
    FOLDER_BACKUPS_ID: 'KIZIY_FOLDER_BACKUPS_ID'
  },

  DRIVE_FOLDERS: {
    ROOT: 'KIZIY_APPS_DATA',
    MASTER: '01_MASTER',
    SHARDS: '02_DB_SHARDS',
    MEDIA: '03_MEDIA_PRODUCTS',
    INVOICES: '04_INVOICES_PDF',
    BACKUPS: '05_BACKUPS_EXPORTS'
  }
};

/**
 * Definisi File Master (Non-Sharded) & Tab di dalamnya
 */
const MASTER_FILE_SCHEMAS = {
  KIZIY_MASTER_INDEX: {
    propKey: KIZIY_CONFIG.PROP_KEYS.MASTER_INDEX_ID,
    tabs: {
      Shard_Registry: [
        'shard_id', 'domain_type', 'spreadsheet_id', 'sequence_no',
        'date_start', 'date_end', 'row_count', 'cell_count', 'status', 'created_at'
      ],
      Daily_Summary: [
        'summary_key', 'date', 'outlet_id', 'tx_count', 'gross_sales',
        'discount_total', 'tax_total', 'net_sales', 'total_cogs', 'gross_profit',
        'void_count', 'refund_total', 'expense_total', 'last_synced_at'
      ],
      App_Settings: [
        'setting_key', 'setting_value', 'description', 'updated_at', 'updated_by'
      ]
    }
  },
  KIZIY_ORG_RBAC: {
    propKey: KIZIY_CONFIG.PROP_KEYS.ORG_RBAC_ID,
    tabs: {
      Outlets: [
        'outlet_id', 'code', 'name', 'address', 'phone', 'email',
        'receipt_header', 'receipt_footer', 'is_active'
      ],
      Users: [
        'user_id', 'username', 'full_name', 'pin_hash', 'password_hash',
        'role_id', 'outlet_id', 'is_active', 'last_login_at'
      ],
      Roles_Permissions: [
        'role_id', 'role_name', 'permissions_json'
      ],
      Payment_Methods: [
        'method_id', 'name', 'type', 'mdr_percent', 'is_active'
      ],
      Tax_Configs: [
        'tax_id', 'name', 'rate_percent', 'is_inclusive', 'is_default', 'is_active'
      ]
    }
  },
  KIZIY_CATALOG: {
    propKey: KIZIY_CONFIG.PROP_KEYS.CATALOG_ID,
    tabs: {
      Categories: ['category_id', 'name', 'parent_id', 'sort_order', 'is_active'],
      Products: [
        'product_id', 'name', 'category_id', 'description', 'base_unit',
        'has_variants', 'is_bundle', 'drive_image_id', 'is_active', 'created_at'
      ],
      Product_Variants: [
        'variant_id', 'product_id', 'sku', 'barcode', 'variant_name',
        'cogs', 'sell_price', 'min_stock', 'is_active'
      ],
      Unit_Conversions: [
        'conv_id', 'variant_id', 'unit_name', 'barcode', 'multiplier_to_base', 'unit_price'
      ],
      Tier_Prices: [
        'tier_id', 'variant_id', 'min_qty', 'member_tier', 'special_price'
      ],
      Bundle_Items: [
        'bundle_item_id', 'bundle_product_id', 'component_variant_id', 'qty'
      ]
    }
  },
  KIZIY_INVENTORY_MASTER: {
    propKey: KIZIY_CONFIG.PROP_KEYS.INVENTORY_MASTER_ID,
    tabs: {
      Stock_Balances: ['balance_key', 'outlet_id', 'variant_id', 'qty_on_hand', 'updated_at'],
      Suppliers: ['supplier_id', 'name', 'contact_person', 'phone', 'email', 'address', 'payment_terms', 'is_active']
    }
  },
  KIZIY_CRM_PROMO: {
    propKey: KIZIY_CONFIG.PROP_KEYS.CRM_PROMO_ID,
    tabs: {
      Customers: [
        'customer_id', 'name', 'phone', 'email', 'member_tier',
        'points_balance', 'total_spent', 'birth_date', 'created_at'
      ],
      Promos: ['promo_id', 'name', 'type', 'rules_json', 'start_at', 'end_at', 'is_active'],
      Vouchers: ['voucher_code', 'promo_id', 'discount_type', 'discount_value', 'max_uses', 'used_count', 'expires_at', 'is_active']
    }
  },
  KIZIY_HELD_CARTS: {
    propKey: KIZIY_CONFIG.PROP_KEYS.HELD_CARTS_ID,
    tabs: {
      Held_Carts: ['hold_id', 'outlet_id', 'cashier_id', 'customer_id', 'label', 'cart_json', 'created_at']
    }
  }
};

/**
 * Definisi Domain Shard (Auto-Rollover @ 200.000 baris)
 */
const SHARD_DOMAIN_SCHEMAS = {
  TX_SHARD: {
    prefix: 'KIZIY_TX_SHARD',
    tabs: {
      Transactions: [
        'tx_id', 'client_tx_uuid', 'offline_receipt_no', 'outlet_id', 'shift_id',
        'cashier_id', 'customer_id', 'subtotal', 'discount_total', 'tax_total',
        'rounding', 'grand_total', 'sync_status', 'email_status', 'tx_status',
        'created_at', 'updated_at'
      ],
      Transaction_Items: [
        'item_id', 'tx_id', 'variant_id', 'sku', 'product_name_snapshot',
        'qty', 'unit_name', 'base_qty_deducted', 'unit_price', 'cogs_snapshot',
        'discount_amount', 'line_total'
      ],
      Transaction_Payments: [
        'payment_id', 'tx_id', 'method_id', 'amount', 'mdr_fee', 'reference_no', 'paid_at'
      ]
    }
  },
  RETURN_SHARD: {
    prefix: 'KIZIY_RETURN_SHARD',
    tabs: {
      Returns: ['return_id', 'tx_id', 'outlet_id', 'shift_id', 'authorized_by', 'reason', 'refund_total', 'refund_method', 'created_at'],
      Return_Items: ['return_item_id', 'return_id', 'tx_item_id', 'variant_id', 'qty_returned', 'restock_flag', 'refund_amount']
    }
  },
  STOCK_LEDGER_SHARD: {
    prefix: 'KIZIY_LEDGER',
    tabs: {
      Stock_Ledger: [
        'ledger_id', 'outlet_id', 'variant_id', 'tx_ref_id', 'movement_type',
        'qty_delta', 'stock_after', 'notes', 'created_by', 'created_at'
      ]
    }
  },
  PO_SHARD: {
    prefix: 'KIZIY_PO_SHARD',
    tabs: {
      Purchase_Orders: ['po_id', 'supplier_id', 'outlet_id', 'status', 'total_cost', 'created_by', 'created_at', 'received_at'],
      Purchase_Order_Items: ['po_item_id', 'po_id', 'variant_id', 'qty_ordered', 'qty_received', 'unit_cost']
    }
  },
  OPNAME_SHARD: {
    prefix: 'KIZIY_OPNAME_SHARD',
    tabs: {
      Stock_Opnames: ['opname_id', 'outlet_id', 'status', 'created_by', 'approved_by', 'created_at', 'approved_at'],
      Stock_Opname_Items: ['opname_item_id', 'opname_id', 'variant_id', 'system_qty', 'physical_qty', 'variance_qty', 'variance_value']
    }
  },
  TRANSFER_SHARD: {
    prefix: 'KIZIY_TRANSFER_SHARD',
    tabs: {
      Stock_Transfers: ['transfer_id', 'from_outlet_id', 'to_outlet_id', 'status', 'created_by', 'created_at', 'received_at'],
      Stock_Transfer_Items: ['transfer_item_id', 'transfer_id', 'variant_id', 'qty_sent', 'qty_received']
    }
  },
  SHIFT_CASH_SHARD: {
    prefix: 'KIZIY_SHIFT_CASH_SHARD',
    tabs: {
      Shifts: ['shift_id', 'outlet_id', 'cashier_id', 'opened_at', 'opening_cash', 'closed_at', 'expected_cash', 'actual_cash', 'variance', 'status'],
      Cash_Movements: ['movement_id', 'shift_id', 'type', 'amount', 'reason', 'created_at'],
      Expenses: ['expense_id', 'outlet_id', 'shift_id', 'category', 'amount', 'notes', 'drive_receipt_id', 'created_at']
    }
  },
  CRM_POINT_SHARD: {
    prefix: 'KIZIY_POINT_SHARD',
    tabs: {
      Customer_Point_Ledger: ['point_id', 'customer_id', 'tx_ref_id', 'points_delta', 'balance_after', 'reason', 'created_at']
    }
  },
  AUDIT_SHARD: {
    prefix: 'KIZIY_AUDIT',
    tabs: {
      Audit_Logs: ['log_id', 'outlet_id', 'user_id', 'action', 'target_table', 'target_id', 'detail_json', 'created_at']
    }
  },
  NOTIF_SHARD: {
    prefix: 'KIZIY_NOTIF',
    tabs: {
      Notification_Logs: ['notif_id', 'channel', 'recipient', 'subject_or_type', 'tx_ref_id', 'status', 'created_at']
    }
  }
};
