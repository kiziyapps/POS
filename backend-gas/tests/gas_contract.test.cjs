const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadGasRuntime() {
  const store = { props: {}, cache: {}, files: {}, folders: {} };

  const makeSheet = (name) => {
    const rows = [];
    return {
      _rows: rows,
      getName: () => name,
      setName: (n) => { name = n; },
      getLastRow: () => rows.length,
      getLastColumn: () => (rows[0] ? rows[0].length : 0),
      setFrozenRows: () => {},
      appendRow: (r) => rows.push([...r]),
      getRange: (r, c, numR = 1, numC = 1) => ({
        setValues: (vals) => {
          for (let i = 0; i < vals.length; i++) {
            const idx = r - 1 + i;
            while (rows.length <= idx) rows.push([]);
            for (let j = 0; j < vals[i].length; j++) {
              rows[idx][c - 1 + j] = vals[i][j];
            }
          }
        },
        setValue: (v) => {
          const idx = r - 1;
          while (rows.length <= idx) rows.push([]);
          rows[idx][c - 1] = v;
        },
        setFontWeight: () => {},
        getValues: () => {
          const out = [];
          for (let i = 0; i < numR; i++) {
            const row = rows[r - 1 + i] || [];
            out.push(Array.from({ length: numC }, (_, j) => row[c - 1 + j] ?? ''));
          }
          return out;
        }
      })
    };
  };

  let idCounter = 1;
  const makeSpreadsheet = (title) => {
    const id = `SS_${idCounter++}`;
    const sheets = [makeSheet('Sheet1')];
    const ss = {
      getId: () => id,
      getName: () => title,
      getSheets: () => sheets,
      getSheetByName: (n) => sheets.find((s) => s.getName() === n) || null,
      insertSheet: (n) => {
        const s = makeSheet(n);
        sheets.push(s);
        return s;
      }
    };
    store.files[id] = ss;
    return ss;
  };

  const makeFolder = (name) => {
    const id = `FLD_${idCounter++}`;
    const children = [];
    const fld = {
      getId: () => id,
      getName: () => name,
      getFoldersByName: (n) => {
        const found = children.filter((c) => c.getName() === n);
        let idx = 0;
        return { hasNext: () => idx < found.length, next: () => found[idx++] };
      },
      createFolder: (n) => {
        const c = makeFolder(n);
        children.push(c);
        return c;
      },
      createFile: (blob) => ({
        getId: () => `FILE_${idCounter++}`,
        setSharing: () => {}
      })
    };
    store.folders[id] = fld;
    return fld;
  };

  const rootFolder = makeFolder('ROOT');

  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Error,
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => store.props[k] || null,
        setProperty: (k, v) => { store.props[k] = v; },
        setProperties: (obj) => Object.assign(store.props, obj)
      })
    },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => store.cache[k] || null,
        put: (k, v) => { store.cache[k] = v; },
        remove: (k) => { delete store.cache[k]; }
      })
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} })
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'ANYONE' },
      Permission: { VIEW: 'VIEW' },
      getRootFolder: () => rootFolder,
      getFolderById: (id) => store.folders[id] || makeFolder('UNKNOWN'),
      getFileById: (id) => ({ moveTo: () => {} })
    },
    SpreadsheetApp: {
      create: (title) => makeSpreadsheet(title),
      openById: (id) => store.files[id]
    },
    MailApp: {
      getRemainingDailyQuota: () => 95,
      sendEmail: () => {}
    },
    Session: {
      getActiveUser: () => ({ getEmail: () => 'owner@kiziy.test' })
    },
    ScriptApp: {
      getProjectTriggers: () => [],
      deleteTrigger: () => {},
      newTrigger: () => ({
        timeBased: () => ({
          everyDays: () => ({
            atHour: () => ({ create: () => {} })
          })
        })
      })
    },
    Logger: { log: () => {} },
    Utilities: {
      getUuid: () => `uuid-${idCounter++}-1234`,
      formatDate: () => '2026-11-26',
      computeDigest: (_alg, txt) => Array.from(Buffer.from(txt)),
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      base64Decode: (s) => Buffer.from(s, 'base64'),
      newBlob: (d, m, n) => ({ d, m, n })
    },
    ContentService: {
      MimeType: { JSON: 'JSON' },
      createTextOutput: (txt) => ({
        _txt: txt,
        setMimeType: function () { return this; },
        getContent: function () { return this._txt; }
      })
    }
  };

  vm.createContext(sandbox);
  const srcDir = path.resolve(__dirname, '../src');
  const files = fs.readdirSync(srcDir).filter((f) => f.endsWith('.js')).sort();
  for (const file of files) {
    const code = fs.readFileSync(path.join(srcDir, file), 'utf8');
    vm.runInContext(code, sandbox, { filename: file });
  }
  sandbox._eval = (expr) => vm.runInContext(expr, sandbox);
  return sandbox;
}

test('GAS Installer, doGet health, auth.login & silentRefresh contract', () => {
  const gas = loadGasRuntime();

  // 1. Jalankan Installer
  const installRes = gas.setupKiziyEnvironment();
  assert.equal(installRes.status, 'INSTALLED');
  assert.ok(installRes.masterIndexId);

  // 2. Test doGet healthcheck
  const healthOut = JSON.parse(gas.doGet({ parameter: { action: 'system.health' } }).getContent());
  assert.equal(healthOut.ok, true);
  assert.equal(healthOut.data.status, 'ONLINE');

  // 3. Test doPost auth.login
  const loginRes = JSON.parse(gas.doPost({
    postData: { contents: JSON.stringify({ action: 'auth.login', payload: { username: 'admin', secret: 'admin123' } }) }
  }).getContent());
  assert.equal(loginRes.ok, true);
  assert.ok(loginRes.data.token);

  // 4. Test doPost auth.refresh
  const refreshRes = JSON.parse(gas.doPost({
    postData: { contents: JSON.stringify({ action: 'auth.refresh', token: loginRes.data.token }) }
  }).getContent());
  assert.equal(refreshRes.ok, true);
  assert.notEqual(refreshRes.data.token, loginRes.data.token);

  const token = refreshRes.data.token;

  // 5. Test inventory.save_product (stok awal 2)
  const prodRes = JSON.parse(gas.doPost({
    postData: {
      contents: JSON.stringify({
        action: 'inventory.save_product',
        token,
        payload: { name: 'Kemeja Linen', sku: 'KML-01', cogs: 50000, sell_price: 100000, initial_stock: 2 }
      })
    }
  }).getContent());
  assert.equal(prodRes.ok, true);
  const variantId = prodRes.data.variant.variant_id;

  // 6. Test pos.checkout dengan qty 3 (> stok 2 -> harus masuk dengan NEEDS_STOCK_REVIEW)
  const txPayload = {
    client_tx_uuid: 'uuid-offline-001',
    offline_receipt_no: 'OFF-DEV1-ABC123',
    subtotal: 300000,
    discount_total: 0,
    tax_total: 0,
    grand_total: 300000,
    items: [{
      variant_id: variantId,
      sku: 'KML-01',
      product_name_snapshot: 'Kemeja Linen',
      qty: 3,
      unit_price: 100000,
      cogs_snapshot: 50000,
      line_total: 300000
    }]
  };

  const checkoutRes = JSON.parse(gas.doPost({
    postData: { contents: JSON.stringify({ action: 'pos.checkout', token, payload: txPayload }) }
  }).getContent());
  assert.equal(checkoutRes.ok, true, checkoutRes.error);
  assert.equal(checkoutRes.data.tx.sync_status, 'NEEDS_STOCK_REVIEW');
  assert.equal(checkoutRes.data.tx.offline_receipt_no, 'OFF-DEV1-ABC123');

  // 7. Test idempotency replay (client_tx_uuid sama tidak boleh ganda)
  const replayRes = JSON.parse(gas.doPost({
    postData: { contents: JSON.stringify({ action: 'pos.checkout', token, payload: txPayload }) }
  }).getContent());
  assert.equal(replayRes.ok, true, replayRes.error);
  assert.equal(replayRes.data.idempotent_replay, true);

  // 8. Test pos.void -> harus re-sync Daily_Summary (net_sales kembali 0)
  const voidRes = JSON.parse(gas.doPost({
    postData: {
      contents: JSON.stringify({
        action: 'pos.void',
        token,
        payload: { tx_id: checkoutRes.data.tx.tx_id, reason: 'Salah input' }
      })
    }
  }).getContent());
  assert.equal(voidRes.ok, true, voidRes.error);
  assert.equal(voidRes.data.status, 'VOID');
  assert.equal(voidRes.data.daily_summary.net_sales, 0);

  // 9. Test CRM, PO Create + Receive, Expense, dan Daily Report Trigger
  const custRes = JSON.parse(gas.doPost({
    postData: { contents: JSON.stringify({ action: 'crm.save_customer', token, payload: { name: 'Budi Santoso', phone: '08123456789' } }) }
  }).getContent());
  assert.equal(custRes.ok, true, custRes.error);

  const poCreateRes = JSON.parse(gas.doPost({
    postData: { contents: JSON.stringify({ action: 'po.create', token, payload: { items: [{ variant_id: variantId, qty_ordered: 10, unit_cost: 50000 }] } }) }
  }).getContent());
  assert.equal(poCreateRes.ok, true, poCreateRes.error);

  const poRecvRes = JSON.parse(gas.doPost({
    postData: { contents: JSON.stringify({ action: 'po.receive', token, payload: { po_id: poCreateRes.data.po.po_id } }) }
  }).getContent());
  assert.equal(poRecvRes.ok, true, poRecvRes.error);
  assert.equal(poRecvRes.data.status, 'RECEIVED');

  const expRes = JSON.parse(gas.doPost({
    postData: { contents: JSON.stringify({ action: 'expense.record', token, payload: { category: 'Listrik', amount: 150000 } }) }
  }).getContent());
  assert.equal(expRes.ok, true, expRes.error);

  assert.equal(gas.installDailyReportTrigger().status, 'TRIGGER_INSTALLED');
  assert.equal(gas.runScheduledDailyReport().sent, true);
});

test('ShardManager auto-rollover @ 200.000 rows & cross-shard void re-sync', () => {
  const gas = loadGasRuntime();
  const installRes = gas.setupKiziyEnvironment();
  assert.equal(installRes.status, 'INSTALLED');

  const loginRes = JSON.parse(gas.doPost({
    postData: { contents: JSON.stringify({ action: 'auth.login', payload: { username: 'admin', secret: 'admin123' } }) }
  }).getContent());
  const token = loginRes.data.token;

  const prodRes = JSON.parse(gas.doPost({
    postData: {
      contents: JSON.stringify({
        action: 'inventory.save_product',
        token,
        payload: { name: 'Jaket Denim', sku: 'JKD-01', cogs: 100000, sell_price: 200000, initial_stock: 50 }
      })
    }
  }).getContent());
  const variantId = prodRes.data.variant.variant_id;

  // Transaksi 1 masuk ke TX_SHARD_001
  const tx1Res = JSON.parse(gas.doPost({
    postData: {
      contents: JSON.stringify({
        action: 'pos.checkout',
        token,
        payload: {
          client_tx_uuid: 'shard-tx-1',
          subtotal: 200000,
          grand_total: 200000,
          items: [{ variant_id: variantId, sku: 'JKD-01', product_name_snapshot: 'Jaket Denim', qty: 1, unit_price: 200000, cogs_snapshot: 100000, line_total: 200000 }]
        }
      })
    }
  }).getContent());
  assert.equal(tx1Res.ok, true, tx1Res.error);

  // Simulasikan TX_SHARD_001 mencapai batas 200.000 baris
  const activeShard1 = gas._eval("ShardManager.getActiveShardRecord('TX_SHARD', false)");
  const ss1 = gas.SpreadsheetApp.openById(activeShard1.spreadsheet_id);
  const txSheet1 = ss1.getSheetByName('Transactions');
  txSheet1.getRange(200002, 1).setValue('SIMULATED_FULL_ROW');

  // Transaksi 2 harus memicu auto-rollover ke TX_SHARD_002
  const tx2Res = JSON.parse(gas.doPost({
    postData: {
      contents: JSON.stringify({
        action: 'pos.checkout',
        token,
        payload: {
          client_tx_uuid: 'shard-tx-2',
          subtotal: 200000,
          grand_total: 200000,
          items: [{ variant_id: variantId, sku: 'JKD-01', product_name_snapshot: 'Jaket Denim', qty: 1, unit_price: 200000, cogs_snapshot: 100000, line_total: 200000 }]
        }
      })
    }
  }).getContent());
  assert.equal(tx2Res.ok, true, tx2Res.error);

  const activeShard2 = gas._eval("ShardManager.getActiveShardRecord('TX_SHARD', false)");
  assert.equal(activeShard2.sequence_no, 2);
  assert.notEqual(activeShard2.spreadsheet_id, activeShard1.spreadsheet_id);

  // Void transaksi 1 yang berada di shard ARCHIVED (TX_SHARD_001) -> Daily_Summary harus tetap akurat (net_sales = 200000)
  const voidRes = JSON.parse(gas.doPost({
    postData: {
      contents: JSON.stringify({
        action: 'pos.void',
        token,
        payload: { tx_id: tx1Res.data.tx.tx_id, reason: 'Uji Void Cross-Shard' }
      })
    }
  }).getContent());
  assert.equal(voidRes.ok, true, voidRes.error);
  assert.equal(voidRes.data.daily_summary.net_sales, 200000);
});

test('Fase 6 P0: pos.checkout_batch, shift Blind Close & pos.partial_return', () => {
  const gas = loadGasRuntime();
  gas.setupKiziyEnvironment();

  const loginRes = JSON.parse(gas.doPost({
    postData: { contents: JSON.stringify({ action: 'auth.login', payload: { username: 'admin', secret: 'admin123' } }) }
  }).getContent());
  const token = loginRes.data.token;

  const prodRes = JSON.parse(gas.doPost({
    postData: {
      contents: JSON.stringify({
        action: 'inventory.save_product',
        token,
        payload: { name: 'Kaos Polos', sku: 'KP-01', cogs: 30000, sell_price: 60000, initial_stock: 20 }
      })
    }
  }).getContent());
  const variantId = prodRes.data.variant.variant_id;

  // 1. Open Shift (opening_cash: 500000) & Petty Cash Out (50000)
  const shiftOpen = JSON.parse(gas.doPost({
    postData: { contents: JSON.stringify({ action: 'shift.open', token, payload: { shift_id: 'SHF-TEST-1', opening_cash: 500000 } }) }
  }).getContent());
  assert.equal(shiftOpen.ok, true, shiftOpen.error);

  const cashOut = JSON.parse(gas.doPost({
    postData: { contents: JSON.stringify({ action: 'shift.cash_movement', token, payload: { shift_id: 'SHF-TEST-1', type: 'OUT', amount: 50000, reason: 'Plastik' } }) }
  }).getContent());
  assert.equal(cashOut.ok, true, cashOut.error);

  // 2. Batch Checkout 2 transaksi tunai (masing-masing 60000 = 120000)
  const batchRes = JSON.parse(gas.doPost({
    postData: {
      contents: JSON.stringify({
        action: 'pos.checkout_batch',
        token,
        payload: {
          transactions: [
            {
              client_tx_uuid: 'batch-1',
              shift_id: 'SHF-TEST-1',
              subtotal: 60000,
              grand_total: 60000,
              items: [{ variant_id: variantId, sku: 'KP-01', product_name_snapshot: 'Kaos Polos', qty: 1, unit_price: 60000, cogs_snapshot: 30000, line_total: 60000 }]
            },
            {
              client_tx_uuid: 'batch-2',
              shift_id: 'SHF-TEST-1',
              subtotal: 60000,
              grand_total: 60000,
              items: [{ variant_id: variantId, sku: 'KP-01', product_name_snapshot: 'Kaos Polos', qty: 1, unit_price: 60000, cogs_snapshot: 30000, line_total: 60000 }]
            }
          ]
        }
      })
    }
  }).getContent());
  assert.equal(batchRes.ok, true, batchRes.error);
  assert.equal(batchRes.data.synced, 2);

  // 3. Blind Close Shift (expected = 500000 + 120000 - 50000 = 570000; actual = 565000 -> variance = -5000)
  const closeRes = JSON.parse(gas.doPost({
    postData: { contents: JSON.stringify({ action: 'shift.close', token, payload: { shift_id: 'SHF-TEST-1', actual_cash: 565000 } }) }
  }).getContent());
  assert.equal(closeRes.ok, true, closeRes.error);
  assert.equal(closeRes.data.expected_cash, 570000);
  assert.equal(closeRes.data.variance, -5000);

  // 4. Partial Return pada transaksi pertama -> restock 1 & re-sync Daily_Summary
  const tx1Id = batchRes.data.results[0].tx.tx_id;
  const retRes = JSON.parse(gas.doPost({
    postData: {
      contents: JSON.stringify({
        action: 'pos.partial_return',
        token,
        payload: {
          tx_id: tx1Id,
          reason: 'Salah warna',
          items: [{ variant_id: variantId, qty_returned: 1, refund_amount: 60000, restock_flag: true }]
        }
      })
    }
  }).getContent());
  assert.equal(retRes.ok, true, retRes.error);
  assert.equal(retRes.data.refund_total, 60000);
});

test('Fase 6 P1 & P2: Rate-Limit Login, Loyalty Points, Transfer Stok & Admin User', () => {
  const gas = loadGasRuntime();
  gas.setupKiziyEnvironment();

  // 1. Test Rate-Limit Login (5x gagal -> diblokir)
  for (let i = 0; i < 5; i++) {
    const failRes = JSON.parse(gas.doPost({
      postData: { contents: JSON.stringify({ action: 'auth.login', payload: { username: 'admin', secret: 'wrongpw' } }) }
    }).getContent());
    assert.equal(failRes.ok, false);
  }
  const blockedRes = JSON.parse(gas.doPost({
    postData: { contents: JSON.stringify({ action: 'auth.login', payload: { username: 'admin', secret: 'admin123' } }) }
  }).getContent());
  assert.equal(blockedRes.ok, false);
  assert.ok(blockedRes.error.includes('RATE_LIMITED'));

  // 2. Buat user baru via admin.save_user dan login
  const custSetup = JSON.parse(gas.doPost({
    postData: { contents: JSON.stringify({ action: 'auth.login', payload: { username: 'kasir_baru', secret: '123456' } }) }
  }).getContent());
  assert.equal(custSetup.ok, false);

  // Gunakan admin2 untuk test admin & loyalty
  gas._eval("AdminService.saveUser({ username: 'owner2', full_name: 'Owner 2', password: 'pw2', role_id: 'ROLE_OWNER', outlet_id: 'ALL' })");
  const owner2Login = JSON.parse(gas.doPost({
    postData: { contents: JSON.stringify({ action: 'auth.login', payload: { username: 'owner2', secret: 'pw2' } }) }
  }).getContent());
  assert.equal(owner2Login.ok, true, owner2Login.error);
  const token = owner2Login.data.token;

  // 3. Buat customer + produk, checkout Rp 50.000 -> dapat 5 poin loyalty
  const custRes = JSON.parse(gas.doPost({
    postData: { contents: JSON.stringify({ action: 'crm.save_customer', token, payload: { name: 'Siti', member_tier: 'GOLD' } }) }
  }).getContent());
  const customerId = custRes.data.customer_id;

  const prodRes = JSON.parse(gas.doPost({
    postData: { contents: JSON.stringify({ action: 'inventory.save_product', token, payload: { name: 'Tas', sku: 'TAS-1', cogs: 25000, sell_price: 50000, initial_stock: 10 } }) }
  }).getContent());
  const variantId = prodRes.data.variant.variant_id;

  const coRes = JSON.parse(gas.doPost({
    postData: {
      contents: JSON.stringify({
        action: 'pos.checkout',
        token,
        payload: {
          client_tx_uuid: 'loyalty-tx-1',
          customer_id: customerId,
          subtotal: 50000,
          grand_total: 50000,
          items: [{ variant_id: variantId, sku: 'TAS-1', product_name_snapshot: 'Tas', qty: 1, unit_price: 50000, cogs_snapshot: 25000, line_total: 50000 }]
        }
      })
    }
  }).getContent());
  assert.equal(coRes.ok, true, coRes.error);

  const custList = JSON.parse(gas.doPost({
    postData: { contents: JSON.stringify({ action: 'crm.list_customers', token }) }
  }).getContent());
  const siti = custList.data.find((c) => c.customer_id === customerId);
  assert.equal(siti.points_balance, 5);

  // 4. Test Transfer Stok antar outlet
  const trfRes = JSON.parse(gas.doPost({
    postData: {
      contents: JSON.stringify({
        action: 'inventory.transfer_stock',
        token,
        payload: { from_outlet_id: 'OUTLET_MAIN', to_outlet_id: 'OUTLET_CABANG', variant_id: variantId, qty: 3 }
      })
    }
  }).getContent());
  assert.equal(trfRes.ok, true, trfRes.error);
  assert.equal(trfRes.data.from_after, 6);
  assert.equal(trfRes.data.to_after, 3);
});
