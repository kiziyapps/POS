import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, X, Keyboard } from 'lucide-react';

function playScanBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, ctx.currentTime);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  } catch (err) {
    console.debug('Audio beep tidak tersedia:', err.message);
  }
}

export function BarcodeScannerModal({ title, onDetected, onClose }) {
  const containerId = 'kiziy-barcode-reader';
  const scannerRef = useRef(null);
  const [camError, setCamError] = useState('');
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    let mounted = true;
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;

    scanner.start(
      { facingMode: 'environment' },
      { fps: 12, qrbox: { width: 250, height: 140 } },
      (decodedText) => {
        if (!mounted || !decodedText) return;
        mounted = false;
        playScanBeep();
        onDetected(decodedText.trim());
        onClose();
      },
      () => {}
    ).catch((err) => {
      if (mounted) {
        setCamError('Kamera tidak dapat diakses: ' + (err?.message || 'Periksa izin kamera browser.'));
      }
    });

    return () => {
      mounted = false;
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current.stop().catch(() => {}).finally(() => {
              try {
                scannerRef.current.clear();
              } catch (clearErr) {
                console.debug('Clear scanner skipped:', clearErr?.message);
              }
            });
          } else {
            scannerRef.current.clear();
          }
        } catch (cleanupErr) {
          console.debug('Cleanup scanner:', cleanupErr.message);
        }
      }
    };
  }, [onDetected, onClose]);

  const handleManualChange = (e) => setManualCode(e.target.value);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    onDetected(manualCode.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <Camera className="w-4 h-4 text-brand-400" />
            <span>{title || 'Scan Barcode / QR Kamera'}</span>
          </h3>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div id={containerId} className="w-full min-h-[240px] bg-slate-900 rounded-xl overflow-hidden" />

          {camError && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl">
              {camError}
            </div>
          )}

          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Keyboard className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input type="text" value={manualCode} onChange={handleManualChange} placeholder="Atau ketik kode barcode manual..." className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg" />
            </div>
            <button type="submit" className="px-3.5 py-2 bg-brand-600 text-white text-xs font-semibold rounded-lg">
              Pakai
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
