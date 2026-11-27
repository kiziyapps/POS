/**
 * KIZIY APPS - Thermal Printer Service (58mm/80mm Browser Print + WebBluetooth ESC/POS)
 */

function buildEscPosLines(receipt) {
  const tx = receipt.tx || {};
  const items = receipt.items || [];
  const lines = [
    '        KIZIY APPS POS        ',
    '------------------------------',
    `No   : ${tx.tx_id || tx.offline_receipt_no}`,
    `Tgl  : ${String(tx.created_at || new Date().toISOString()).slice(0, 16).replace('T', ' ')}`,
    '------------------------------'
  ];
  items.forEach((it) => {
    lines.push(String(it.product_name_snapshot || it.name || '').slice(0, 30));
    lines.push(`  ${it.qty} x ${Number(it.unit_price || 0).toLocaleString('id-ID')} = ${Number(it.line_total || 0).toLocaleString('id-ID')}`);
  });
  lines.push('------------------------------');
  lines.push(`TOTAL  : Rp ${Number(tx.grand_total || 0).toLocaleString('id-ID')}`);
  lines.push(`KEMBALI: Rp ${Number(receipt.change || 0).toLocaleString('id-ID')}`);
  lines.push('------------------------------');
  lines.push('   Terima Kasih Berbelanja!   ');
  lines.push('\n\n\n');
  return lines.join('\n');
}

export async function printBluetoothEscPos(receipt) {
  if (!navigator.bluetooth) {
    throw new Error('Browser tidak mendukung WebBluetooth. Gunakan Chrome Android/Desktop atau tombol Cetak 58mm.');
  }

  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
  });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
  const characteristics = await service.getCharacteristics();
  const writable = characteristics.find((c) => c.properties.write || c.properties.writeWithoutResponse);
  if (!writable) throw new Error('Karakteristik tulis printer tidak ditemukan.');

  const encoder = new TextEncoder();
  const initBytes = new Uint8Array([0x1b, 0x40]); // ESC @ Initialize
  const textBytes = encoder.encode(buildEscPosLines(receipt));
  const payload = new Uint8Array(initBytes.length + textBytes.length);
  payload.set(initBytes, 0);
  payload.set(textBytes, initBytes.length);

  // Kirim per chunk 100 byte agar aman untuk BLE MTU
  for (let i = 0; i < payload.length; i += 100) {
    const chunk = payload.slice(i, i + 100);
    await writable.writeValue(chunk);
  }
  return true;
}

export function printBrowserThermal(receipt) {
  const tx = receipt.tx || {};
  const items = receipt.items || [];
  const rowsHtml = items.map((it) => `
    <tr>
      <td colspan="2" style="padding-top:4px;font-weight:600;">${it.product_name_snapshot || it.name}</td>
    </tr>
    <tr>
      <td>${it.qty} x Rp ${Number(it.unit_price || 0).toLocaleString('id-ID')}</td>
      <td style="text-align:right;">Rp ${Number(it.line_total || 0).toLocaleString('id-ID')}</td>
    </tr>
  `).join('');

  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Struk ${tx.tx_id}</title>
    <style>
      @page { size: 58mm auto; margin: 2mm; }
      body { font-family: monospace; font-size: 11px; width: 54mm; margin: 0 auto; color: #000; }
      h3 { text-align: center; margin: 4px 0; font-size: 13px; }
      hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
      table { width: 100%; border-collapse: collapse; }
    </style></head><body>
    <h3>KIZIY APPS POS</h3>
    <div>No: ${tx.tx_id || tx.offline_receipt_no}</div>
    <div>Tgl: ${String(tx.created_at || new Date().toISOString()).slice(0, 16).replace('T', ' ')}</div>
    <hr/>
    <table>${rowsHtml}</table>
    <hr/>
    <table>
      <tr><td><b>TOTAL</b></td><td style="text-align:right;"><b>Rp ${Number(tx.grand_total || 0).toLocaleString('id-ID')}</b></td></tr>
      <tr><td>Kembali</td><td style="text-align:right;">Rp ${Number(receipt.change || 0).toLocaleString('id-ID')}</td></tr>
    </table>
    <hr/>
    <div style="text-align:center;">Terima kasih telah berbelanja!</div>
    <script>window.onload = function(){ window.print(); window.close(); };</script>
  </body></html>`;

  const win = window.open('', '_blank', 'width=300,height=600');
  if (win) {
    win.document.write(html);
    win.document.close();
  } else {
    window.print();
  }
}
