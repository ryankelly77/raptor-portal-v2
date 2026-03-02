'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from '../inventory.module.css';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose?: () => void;
  fullScreen?: boolean;
}

// TypeScript declarations for BarcodeDetector API
declare global {
  interface BarcodeDetectorOptions {
    formats: string[];
  }
  interface DetectedBarcode {
    rawValue: string;
    format: string;
    boundingBox: DOMRectReadOnly;
  }
  class BarcodeDetector {
    constructor(options?: BarcodeDetectorOptions);
    detect(image: ImageBitmapSource): Promise<DetectedBarcode[]>;
    static getSupportedFormats(): Promise<string[]>;
  }
}

// All barcode formats we want to support
const BARCODE_FORMATS = [
  'ean_13', 'ean_8', 'upc_a', 'upc_e',
  'code_128', 'code_39', 'code_93',
  'itf', 'codabar', 'data_matrix', 'qr_code'
];

export function BarcodeScanner({ onScan, onClose, fullScreen = false }: BarcodeScannerProps) {
  const [status, setStatus] = useState<'initializing' | 'scanning' | 'error' | 'success'>('initializing');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [scannerType, setScannerType] = useState<'native' | 'html5' | null>(null);
  const [showFlash, setShowFlash] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const scanningRef = useRef<boolean>(false);
  const animationRef = useRef<number | null>(null);
  const html5ScannerRef = useRef<any>(null);
  const lastScanTimeRef = useRef<number>(0);

  const containerId = 'html5-scanner-container';

  // Cleanup function
  const cleanup = useCallback(() => {
    scanningRef.current = false;

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (html5ScannerRef.current) {
      try {
        html5ScannerRef.current.stop();
      } catch (e) {
        // Ignore cleanup errors
      }
      html5ScannerRef.current = null;
    }
  }, []);

  // Handle successful scan
  const handleDetection = useCallback((barcode: string) => {
    // Debounce - prevent duplicate scans within 1 second
    const now = Date.now();
    if (now - lastScanTimeRef.current < 1000) return;
    if (barcode === lastScanned) return;

    lastScanTimeRef.current = now;
    setLastScanned(barcode);
    setStatus('success');
    setShowFlash(true);

    // Vibrate on success
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }

    // Play beep sound
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 1800;
      osc.type = 'sine';
      gain.gain.value = 0.3;
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      // Audio not available
    }

    // Hide flash after animation
    setTimeout(() => setShowFlash(false), 300);

    // Pass barcode to parent
    cleanup();
    onScan(barcode);
  }, [lastScanned, cleanup, onScan]);

  // Native BarcodeDetector scanning loop
  const startNativeScanning = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !detectorRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    scanningRef.current = true;

    const scan = async () => {
      if (!scanningRef.current) return;

      // Wait for video to have dimensions
      if (!video.videoWidth || !video.videoHeight) {
        animationRef.current = requestAnimationFrame(scan);
        return;
      }

      // Set canvas to video dimensions for full resolution scanning
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      try {
        const barcodes = await detectorRef.current!.detect(canvas);
        if (barcodes.length > 0) {
          handleDetection(barcodes[0].rawValue);
          return;
        }
      } catch (e) {
        // Detection error - continue scanning
      }

      // Continue scanning
      if (scanningRef.current) {
        animationRef.current = requestAnimationFrame(scan);
      }
    };

    scan();
  }, [handleDetection]);

  // Initialize scanner
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      console.log('[Scanner] Initializing...');

      // Check if camera is available
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorMsg('Camera not available. Make sure you\'re using HTTPS.');
        setStatus('error');
        return;
      }

      // Try Native BarcodeDetector first
      if ('BarcodeDetector' in window) {
        try {
          const supportedFormats = await BarcodeDetector.getSupportedFormats();
          console.log('[Scanner] Native BarcodeDetector formats:', supportedFormats);

          const formatsToUse = BARCODE_FORMATS.filter(f => supportedFormats.includes(f));

          if (formatsToUse.length >= 3) {
            console.log('[Scanner] Using Native BarcodeDetector with formats:', formatsToUse);
            detectorRef.current = new BarcodeDetector({ formats: formatsToUse });

            // Request high resolution camera
            const stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: 'environment',
                width: { ideal: 1920, min: 1280 },
                height: { ideal: 1080, min: 720 },
              },
              audio: false,
            });

            if (!mounted) {
              stream.getTracks().forEach(t => t.stop());
              return;
            }

            streamRef.current = stream;

            if (videoRef.current) {
              videoRef.current.srcObject = stream;

              // Wait for video to be ready
              await new Promise<void>((resolve) => {
                const video = videoRef.current!;
                if (video.readyState >= 2) {
                  resolve();
                } else {
                  video.onloadeddata = () => resolve();
                }
              });

              await videoRef.current.play();
              setScannerType('native');
              setStatus('scanning');
              startNativeScanning();
              console.log('[Scanner] Native scanner started successfully');
              return;
            }
          }
        } catch (e: any) {
          console.warn('[Scanner] Native BarcodeDetector failed:', e.message);
          if (e.name === 'NotAllowedError') {
            setErrorMsg('Camera permission denied. Please allow camera access.');
            setStatus('error');
            return;
          }
          // Fall through to html5-qrcode
        }
      }

      // Fallback to html5-qrcode
      console.log('[Scanner] Falling back to html5-qrcode');
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');

        if (!mounted) return;

        const formats = [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR,
        ];

        const scanner = new Html5Qrcode(containerId, { formatsToSupport: formats, verbose: false });
        html5ScannerRef.current = scanner;

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, aspectRatio: 16/9 },
          (text) => handleDetection(text),
          () => {}
        );

        setScannerType('html5');
        setStatus('scanning');
        console.log('[Scanner] html5-qrcode started successfully');
      } catch (e: any) {
        console.error('[Scanner] html5-qrcode failed:', e);
        setErrorMsg(e.message || 'Could not start camera');
        setStatus('error');
      }
    };

    init();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [cleanup, handleDetection, startNativeScanning]);

  // Manual barcode submission
  const handleManualSubmit = () => {
    const barcode = manualBarcode.trim();
    if (barcode.length >= 6) {
      cleanup();
      onScan(barcode);
    }
  };

  const handleClose = () => {
    cleanup();
    onClose?.();
  };

  const containerStyle: React.CSSProperties = fullScreen ? {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: '#000',
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'column',
  } : {
    background: '#000',
    borderRadius: '12px',
    overflow: 'hidden',
  };

  return (
    <div style={containerStyle}>
      {/* Camera View */}
      <div style={{ flex: 1, position: 'relative', minHeight: fullScreen ? 0 : '300px' }}>
        {/* Native scanner video */}
        <video
          ref={videoRef}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: scannerType === 'native' ? 'block' : 'none',
          }}
          playsInline
          muted
          autoPlay
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* html5-qrcode container */}
        <div
          id={containerId}
          style={{
            width: '100%',
            height: '100%',
            display: scannerType === 'html5' ? 'block' : 'none',
          }}
        />

        {/* Initializing state */}
        {status === 'initializing' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000',
            color: '#fff',
          }}>
            <div className={styles.spinner} style={{ borderTopColor: '#FF580F', marginBottom: '16px' }} />
            <span>Starting camera...</span>
          </div>
        )}

        {/* Error state */}
        {status === 'error' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: '#000',
            color: '#fff',
            padding: '20px',
            textAlign: 'center',
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" style={{ marginBottom: '16px' }}>
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <div style={{ color: '#ef4444', marginBottom: '8px', fontWeight: 600 }}>Camera Error</div>
            <div style={{ color: '#9ca3af', fontSize: '14px' }}>{errorMsg}</div>
          </div>
        )}

        {/* Success flash overlay */}
        {showFlash && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(34, 197, 94, 0.3)',
            pointerEvents: 'none',
          }} />
        )}

        {/* Scanning overlay */}
        {status === 'scanning' && (
          <>
            {/* Top instruction bar */}
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              padding: '16px',
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.7), transparent)',
              color: '#fff',
              textAlign: 'center',
            }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>Point at barcode</div>
              <div style={{ fontSize: '13px', opacity: 0.8 }}>
                Any angle works {scannerType === 'native' ? '(Native API)' : '(html5-qrcode)'}
              </div>
            </div>

            {/* Close button */}
            {onClose && (
              <button
                onClick={handleClose}
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  width: '40px',
                  height: '40px',
                  borderRadius: '50%',
                  background: 'rgba(0,0,0,0.5)',
                  border: 'none',
                  color: '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}

            {/* Scanning indicator */}
            <div style={{
              position: 'absolute',
              bottom: fullScreen ? '120px' : '16px',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(0,0,0,0.7)',
              padding: '10px 20px',
              borderRadius: '24px',
              color: '#fff',
            }}>
              <span style={{
                width: '12px',
                height: '12px',
                background: '#22c55e',
                borderRadius: '50%',
                animation: 'pulse 1s infinite',
              }} />
              <span>Scanning...</span>
            </div>
          </>
        )}
      </div>

      {/* Manual Entry Section */}
      <div style={{
        padding: '16px',
        background: fullScreen ? 'rgba(0,0,0,0.9)' : '#1a1a2e',
      }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Enter barcode manually..."
            value={manualBarcode}
            onChange={(e) => setManualBarcode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
            style={{
              flex: 1,
              padding: '14px 16px',
              fontSize: '16px',
              border: '2px solid #374151',
              borderRadius: '10px',
              background: '#1f2937',
              color: '#fff',
              outline: 'none',
            }}
          />
          <button
            onClick={handleManualSubmit}
            disabled={manualBarcode.trim().length < 6}
            style={{
              padding: '14px 24px',
              background: manualBarcode.trim().length >= 6 ? '#FF580F' : '#374151',
              color: '#fff',
              border: 'none',
              borderRadius: '10px',
              fontWeight: 600,
              cursor: manualBarcode.trim().length >= 6 ? 'pointer' : 'not-allowed',
            }}
          >
            Add
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.9); }
        }
      `}</style>
    </div>
  );
}
