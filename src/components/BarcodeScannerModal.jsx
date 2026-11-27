import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, X, Keyboard, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';

const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.QR_CODE
];

function playScanBeep() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1400, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  } catch (err) {
    console.debug('Audio beep tidak tersedia:', err.message);
  }
}

export function BarcodeScannerModal({ title, onDetected, onClose }) {
  const containerId = 'kiziy-barcode-reader';
  const scannerRef = useRef(null);
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);
  onDetectedRef.current = onDetected;
  onCloseRef.current = onClose;

  const [scanStatus, setScanStatus] = useState('STARTING'); // STARTING | SCANNING | SLOW_HINT | SUCCESS | ERROR
  const [statusMessage, setStatusMessage] = useState('Mengaktifkan kamera...');
  const [detectedCode, setDetectedCode] = useState('');
  const [manualCode, setManualCode] = useState('');

  useEffect(() => {
    let mounted = true;
    let closeTimer = null;
    let hintTimer = null;

    const scanner = new Html5Qrcode(containerId, {
      formatsToSupport: SUPPORTED_FORMATS,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      verbose: false
    });
    scannerRef.current = scanner;

    const scanConfig = {
      fps: 15,
      qrbox: (viewW, viewH) => ({
        width: Math.min(320, Math.floor(viewW * 0.85)),
        height: Math.min(180, Math.floor(viewH * 0.55))
      }),
      aspectRatio: 1.777778
    };

    const handleSuccess = (decodedText) => {
      if (!mounted || !decodedText) return;
      mounted = false;
      clearTimeout(hintTimer);
      const cleanCode = decodedText.trim();
      setDetectedCode(cleanCode);
      setScanStatus('SUCCESS');
      setStatusMessage('Barcode berhasil terbaca: ' + cleanCode);
      playScanBeep();
      if (navigator.vibrate) navigator.vibrate(80);

      if (scanner.isScanning) {
        scanner.stop().catch((stopErr) => {
          console.debug('Stop scanner:', stopErr?.message);
        });
      }

      closeTimer = setTimeout(() => {
        onDetectedRef.current(cleanCode);
        onCloseRef.current();
      }, 650);
    };

    async function startCamera() {
      try {
        await scanner.start({ facingMode: 'environment' }, scanConfig, handleSuccess, () => {});
      } catch (envErr) {
        console.debug('Environment camera fallback:', envErr?.message);
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) {
          throw new Error('Tidak ada kamera terdeteksi di perangkat ini.');
        }
        await scanner.start(cameras[0].id, scanConfig, handleSuccess, () => {});
      }

      if (mounted) {
        setScanStatus('SCANNING');
        setStatusMessage('Kamera aktif — Arahkan barcode ke dalam kotak.');
        hintTimer = setTimeout(() => {
          if (mounted) {
            setScanStatus('SLOW_HINT');
            setStatusMessage('Belum terbaca. Pastikan cahaya cukup, tidak buram, dan jarak 10–20 cm.');
          }
        }, 10000);
      }
    }

    startCamera().catch((err) => {
      if (mounted) {
        setScanStatus('ERROR');
        setStatusMessage('Gagal mengakses kamera: ' + (err?.message || 'Izinkan akses kamera pada browser (HTTPS).'));
      }
    });

    return () => {
      mounted = false;
      clearTimeout(closeTimer);
      clearTimeout(hintTimer);
      if (scannerRef.current) {
        try {
          if (scannerRef.current.isScanning) {
            scannerRef.current.stop().catch((stopErr) => {
              console.debug('Cleanup stop:', stopErr?.message);
            }).finally(() => {
              try {
                scannerRef.current.clear();
              } catch (clearErr) {
                console.debug('Cleanup clear:', clearErr?.message);
              }
            });
          } else {
            scannerRef.current.clear();
          }
        } catch (cleanupErr) {
          console.debug('Cleanup scanner:', cleanupErr?.message);
        }
      }
    };
  }, []);

  const handleManualChange = (e) => setManualCode(e.target.value);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    onDetectedRef.current(manualCode.trim());
    onCloseRef.current();
  };

  const statusBoxClass = scanStatus === 'SUCCESS'
    ? 'p-3 rounded-xl text-xs font-semibold flex items-center gap-2 bg-emerald-50 border border-emerald-300 text-emerald-800'
    : scanStatus === 'ERROR'
      ? 'p-3 rounded-xl text-xs font-semibold flex items-center gap-2 bg-rose-50 border border-rose-300 text-rose-800'
      : scanStatus === 'SLOW_HINT'
        ? 'p-3 rounded-xl text-xs font-medium flex items-center gap-2 bg-amber-50 border border-amber-300 text-amber-800'
        : 'p-3 rounded-xl text-xs font-medium flex items-center gap-2 bg-slate-100 border border-slate-200 text-slate-700';

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

        <div className="p-4 space-y-3">
          <div id={containerId} className="w-full min-h-[240px] bg-slate-900 rounded-xl overflow-hidden" />

          <div className={statusBoxClass}>
            {scanStatus === 'SUCCESS' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {(scanStatus === 'ERROR' || scanStatus === 'SLOW_HINT') && <AlertTriangle className="w-4 h-4 shrink-0" />}
            {(scanStatus === 'STARTING' || scanStatus === 'SCANNING') && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
            <span>{detectedCode ? `Berhasil! Kode: ${detectedCode}` : statusMessage}</span>
          </div>

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
