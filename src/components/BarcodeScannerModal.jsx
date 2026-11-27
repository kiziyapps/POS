import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { Camera, X, Keyboard, CheckCircle2, AlertTriangle, Loader2, Aperture, ImagePlus, Flashlight, Focus, ZoomIn } from 'lucide-react';

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
  const trackRef = useRef(null);
  const mountedRef = useRef(true);
  const onDetectedRef = useRef(onDetected);
  const onCloseRef = useRef(onClose);
  onDetectedRef.current = onDetected;
  onCloseRef.current = onClose;

  const [scanStatus, setScanStatus] = useState('STARTING');
  const [statusMessage, setStatusMessage] = useState('Mengaktifkan kamera & autofokus...');
  const [detectedCode, setDetectedCode] = useState('');
  const [manualCode, setManualCode] = useState('');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomCaps, setZoomCaps] = useState(null);
  const [zoomVal, setZoomVal] = useState(1);

  const completeScan = (rawCode) => {
    if (!mountedRef.current || !rawCode) return;
    mountedRef.current = false;
    const cleanCode = String(rawCode).trim();
    setDetectedCode(cleanCode);
    setScanStatus('SUCCESS');
    setStatusMessage('Barcode berhasil terbaca: ' + cleanCode);
    playScanBeep();
    if (navigator.vibrate) navigator.vibrate(80);

    if (scannerRef.current && scannerRef.current.isScanning) {
      scannerRef.current.stop().catch((stopErr) => {
        console.debug('Stop scanner:', stopErr?.message);
      });
    }

    setTimeout(() => {
      onDetectedRef.current(cleanCode);
      onCloseRef.current();
    }, 550);
  };

  const applyCameraFocusAndCapabilities = async () => {
    try {
      const videoEl = document.querySelector(`#${containerId} video`);
      if (!videoEl || !videoEl.srcObject) return;
      const tracks = videoEl.srcObject.getVideoTracks();
      if (!tracks || tracks.length === 0) return;

      const track = tracks[0];
      trackRef.current = track;
      const caps = track.getCapabilities ? track.getCapabilities() : {};

      // Aktifkan continuous autofocus jika didukung hardware kamera
      if (caps.focusMode && caps.focusMode.includes('continuous')) {
        await track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      }
      if (caps.torch) {
        setTorchSupported(true);
      }
      if (caps.zoom && caps.zoom.max > caps.zoom.min) {
        const defaultZoom = Math.min(caps.zoom.max, Math.max(caps.zoom.min, 1.5));
        setZoomCaps({ min: caps.zoom.min, max: caps.zoom.max });
        setZoomVal(defaultZoom);
        await track.applyConstraints({ advanced: [{ zoom: defaultZoom }] });
      }
    } catch (capErr) {
      console.debug('Camera capability constraint skipped:', capErr?.message);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    let hintTimer = null;
    let nativeLoop = null;

    const scanner = new Html5Qrcode(containerId, {
      formatsToSupport: SUPPORTED_FORMATS,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      verbose: false
    });
    scannerRef.current = scanner;

    // Area scan lebar (92% lebar) agar quiet-zone barcode 1D tidak terpotong
    const scanConfig = {
      fps: 24,
      qrbox: (viewW, viewH) => ({
        width: Math.floor(viewW * 0.92),
        height: Math.min(200, Math.floor(viewH * 0.62))
      }),
      aspectRatio: 1.777778
    };

    async function startCamera() {
      try {
        await scanner.start({ facingMode: 'environment' }, scanConfig, completeScan, () => {});
      } catch (envErr) {
        console.debug('Environment camera fallback:', envErr?.message);
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) {
          throw new Error('Tidak ada kamera terdeteksi.');
        }
        const backCam = cameras.find((c) => /back|rear|environment/i.test(c.label)) || cameras[0];
        await scanner.start(backCam.id, scanConfig, completeScan, () => {});
      }

      if (!mountedRef.current) return;
      await applyCameraFocusAndCapabilities();

      setScanStatus('SCANNING');
      setStatusMessage('Autofokus aktif — Sejajarkan barcode secara mendatar di kotak.');

      // Parallel native BarcodeDetector pass (jika browser mendukung) untuk deteksi 1D super cepat
      if ('BarcodeDetector' in window) {
        try {
          const detector = new window.BarcodeDetector({
            formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'qr_code']
          });
          nativeLoop = setInterval(async () => {
            if (!mountedRef.current) return;
            const videoEl = document.querySelector(`#${containerId} video`);
            if (!videoEl || videoEl.readyState < 2) return;
            try {
              const codes = await detector.detect(videoEl);
              if (codes && codes.length > 0 && codes[0].rawValue) {
                completeScan(codes[0].rawValue);
              }
            } catch (detErr) {
              console.debug('Native detector tick:', detErr?.message);
            }
          }, 250);
        } catch (initDetErr) {
          console.debug('BarcodeDetector init skipped:', initDetErr?.message);
        }
      }

      hintTimer = setTimeout(() => {
        if (mountedRef.current) {
          setScanStatus('SLOW_HINT');
          setStatusMessage('Tips: Ketuk layar kamera untuk fokus ulang, nyalakan Flash, atau tekan "Tangkap Foto".');
        }
      }, 8000);
    }

    startCamera().catch((err) => {
      if (mountedRef.current) {
        setScanStatus('ERROR');
        setStatusMessage('Kamera live gagal: ' + (err?.message || 'Gunakan tombol "Kamera HP (HD)" di bawah.'));
      }
    });

    return () => {
      mountedRef.current = false;
      clearTimeout(hintTimer);
      clearInterval(nativeLoop);
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

  const handleRefocus = async () => {
    if (!trackRef.current) return;
    try {
      const caps = trackRef.current.getCapabilities ? trackRef.current.getCapabilities() : {};
      if (caps.focusMode && caps.focusMode.includes('single-shot')) {
        await trackRef.current.applyConstraints({ advanced: [{ focusMode: 'single-shot' }] });
      } else if (caps.focusMode && caps.focusMode.includes('continuous')) {
        await trackRef.current.applyConstraints({ advanced: [{ focusMode: 'continuous' }] });
      }
      setStatusMessage('Memfokuskan ulang kamera...');
    } catch (err) {
      console.debug('Refocus tidak didukung:', err?.message);
    }
  };

  const handleToggleTorch = async () => {
    if (!trackRef.current || !torchSupported) return;
    try {
      const next = !torchOn;
      await trackRef.current.applyConstraints({ advanced: [{ torch: next }] });
      setTorchOn(next);
    } catch (err) {
      console.debug('Torch toggle error:', err?.message);
    }
  };

  const handleZoomCycle = async () => {
    if (!trackRef.current || !zoomCaps) return;
    try {
      const steps = [1, 1.5, 2].filter((z) => z >= zoomCaps.min && z <= zoomCaps.max);
      if (steps.length === 0) return;
      const currentIdx = steps.findIndex((s) => Math.abs(s - zoomVal) < 0.2);
      const nextZoom = steps[(currentIdx + 1) % steps.length];
      await trackRef.current.applyConstraints({ advanced: [{ zoom: nextZoom }] });
      setZoomVal(nextZoom);
    } catch (err) {
      console.debug('Zoom error:', err?.message);
    }
  };

  const handleCaptureFrame = async () => {
    const videoEl = document.querySelector(`#${containerId} video`);
    if (!videoEl || videoEl.readyState < 2) {
      setScanStatus('ERROR');
      setStatusMessage('Video kamera belum siap. Gunakan "Kamera HP (HD)" atau ketik manual.');
      return;
    }

    setScanStatus('DECODING');
    setStatusMessage('Membaca barcode dari tangkapan gambar...');

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoEl.videoWidth || 1280;
      canvas.height = videoEl.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      ctx.filter = 'contrast(1.4) grayscale(1)';
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Gagal mengambil gambar.');
      const file = new File([blob], 'capture.png', { type: 'image/png' });

      if (scannerRef.current && scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }
      const result = await scannerRef.current.scanFile(file, false);
      completeScan(result);
    } catch (err) {
      setScanStatus('SLOW_HINT');
      setStatusMessage('Barcode tidak terbaca dari tangkapan gambar. Coba "Kamera HP (HD)".');
      console.debug('Capture decode failed:', err?.message);
    }
  };

  const handlePhotoFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanStatus('DECODING');
    setStatusMessage('Memproses gambar barcode...');
    try {
      if (scannerRef.current && scannerRef.current.isScanning) {
        await scannerRef.current.stop();
      }
      const fileScanner = new Html5Qrcode(containerId, {
        formatsToSupport: SUPPORTED_FORMATS,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        verbose: false
      });
      const result = await fileScanner.scanFile(file, false);
      completeScan(result);
    } catch (err) {
      setScanStatus('ERROR');
      setStatusMessage('Barcode tidak ditemukan di foto tersebut. Pastikan garis barcode terlihat jelas.');
      console.debug('File decode failed:', err?.message);
    }
  };

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
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4 z-50">
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="px-4 py-3.5 bg-slate-900 text-white flex items-center justify-between">
          <h3 className="font-bold text-sm flex items-center gap-2">
            <Camera className="w-4 h-4 text-brand-400" />
            <span>{title || 'Scan Barcode / QR Kamera'}</span>
          </h3>
          <button type="button" onClick={onClose} className="p-1 text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="relative">
            <div id={containerId} onClick={handleRefocus} className="w-full min-h-[220px] bg-slate-900 rounded-xl overflow-hidden cursor-pointer" />
            <div className="absolute top-2 right-2 flex gap-1.5 z-10">
              <button type="button" onClick={handleRefocus} className="p-2 rounded-lg bg-slate-900/75 text-white hover:bg-slate-800 text-xs flex items-center gap-1" title="Fokus Ulang">
                <Focus className="w-3.5 h-3.5" />
              </button>
              {zoomCaps && (
                <button type="button" onClick={handleZoomCycle} className="px-2 py-1.5 rounded-lg bg-slate-900/75 text-white hover:bg-slate-800 text-[11px] font-bold flex items-center gap-1" title="Zoom Kamera">
                  <ZoomIn className="w-3.5 h-3.5" />
                  <span>{zoomVal}x</span>
                </button>
              )}
              {torchSupported && (
                <button type="button" onClick={handleToggleTorch} className={torchOn ? 'p-2 rounded-lg bg-amber-500 text-slate-950' : 'p-2 rounded-lg bg-slate-900/75 text-white'} title="Lampu Flash">
                  <Flashlight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          <div className={statusBoxClass}>
            {scanStatus === 'SUCCESS' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {(scanStatus === 'ERROR' || scanStatus === 'SLOW_HINT') && <AlertTriangle className="w-4 h-4 shrink-0" />}
            {(scanStatus === 'STARTING' || scanStatus === 'SCANNING' || scanStatus === 'DECODING') && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
            <span>{detectedCode ? `Berhasil! Kode: ${detectedCode}` : statusMessage}</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={handleCaptureFrame} className="py-2.5 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5">
              <Aperture className="w-4 h-4" />
              <span>Tangkap Foto</span>
            </button>
            <label className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer">
              <ImagePlus className="w-4 h-4" />
              <span>Kamera HP (HD)</span>
              <input type="file" accept="image/*" capture="environment" onChange={handlePhotoFileChange} className="hidden" />
            </label>
          </div>

          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <Keyboard className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input type="text" value={manualCode} onChange={handleManualChange} placeholder="Atau ketik kode barcode manual..." className="w-full pl-9 pr-3 py-2.5 text-xs border border-slate-300 rounded-xl" />
            </div>
            <button type="submit" className="px-4 py-2.5 bg-brand-600 text-white text-xs font-semibold rounded-xl">
              Pakai
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
