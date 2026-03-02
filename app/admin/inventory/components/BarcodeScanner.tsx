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

// Scanner settings - MORE AGGRESSIVE blocking
const SCAN_INTERVAL_MS = 150; // ~7fps - slower scanning
const COOLDOWN_MS = 2000; // 2 second cooldown after successful scan
const CONSECUTIVE_FRAMES_REQUIRED = 4; // Same barcode must appear 4 times in a row
const SUCCESS_OVERLAY_MS = 1500; // Green overlay duration
const SAME_BARCODE_BLOCK_MS = 10000; // Block same barcode for 10 seconds

export function BarcodeScanner({ onScan, onClose, fullScreen = false }: BarcodeScannerProps) {
  const [status, setStatus] = useState<'initializing' | 'scanning' | 'cooldown' | 'error'>('initializing');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [scannerType, setScannerType] = useState<'native' | 'zxing' | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [cameraHint, setCameraHint] = useState<string | null>(null);
  const [lastScannedDisplay, setLastScannedDisplay] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const scanningRef = useRef<boolean>(false);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const zxingReaderRef = useRef<any>(null);
  const initTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ALL blocking logic uses refs for synchronous access
  const lastScanTimeRef = useRef<number>(0);
  const lastScannedBarcodeRef = useRef<string>('');
  const isProcessingRef = useRef<boolean>(false);
  const consecutiveDetectionsRef = useRef<{ barcode: string; count: number }>({ barcode: '', count: 0 });

  // Cleanup function
  const cleanup = useCallback(() => {
    console.log('[Scanner] Cleaning up...');
    scanningRef.current = false;
    isProcessingRef.current = false;

    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
      initTimeoutRef.current = null;
    }

    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        console.log('[Scanner] Stopping track:', track.kind, track.label);
        track.stop();
      });
      streamRef.current = null;
    }

    if (zxingReaderRef.current) {
      try {
        zxingReaderRef.current.reset();
      } catch (e) {
        // Ignore cleanup errors
      }
      zxingReaderRef.current = null;
    }
  }, []);

  // Handle successful scan with AGGRESSIVE debouncing
  const handleDetection = useCallback((barcode: string) => {
    const now = Date.now();

    // BLOCK 1: If we're currently processing a scan, ignore everything
    if (isProcessingRef.current) {
      return;
    }

    // BLOCK 2: Global cooldown - no scans at all during this period
    if (now - lastScanTimeRef.current < COOLDOWN_MS) {
      return;
    }

    // BLOCK 3: Same barcode block - prevent re-scanning the same item
    if (barcode === lastScannedBarcodeRef.current && now - lastScanTimeRef.current < SAME_BARCODE_BLOCK_MS) {
      // Reset consecutive count if they're still pointing at the same barcode
      consecutiveDetectionsRef.current = { barcode: '', count: 0 };
      return;
    }

    // DEBOUNCE: Require same barcode on consecutive frames
    if (consecutiveDetectionsRef.current.barcode === barcode) {
      consecutiveDetectionsRef.current.count++;
    } else {
      // Different barcode detected - reset counter
      consecutiveDetectionsRef.current = { barcode, count: 1 };
      return; // First detection doesn't count
    }

    // Not enough consecutive detections yet
    if (consecutiveDetectionsRef.current.count < CONSECUTIVE_FRAMES_REQUIRED) {
      return;
    }

    // ========== CONFIRMED SCAN ==========
    console.log('[Scanner] ✓ Confirmed barcode:', barcode, 'after', consecutiveDetectionsRef.current.count, 'frames');

    // IMMEDIATELY block further processing
    isProcessingRef.current = true;
    lastScanTimeRef.current = now;
    lastScannedBarcodeRef.current = barcode;
    consecutiveDetectionsRef.current = { barcode: '', count: 0 };

    // Update UI
    setStatus('cooldown');
    setShowFlash(true);
    setLastScannedDisplay(barcode);

    // Vibrate on success
    if (navigator.vibrate) {
      navigator.vibrate(200);
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

    // Pass barcode to parent
    onScan(barcode);

    // Hide flash and resume scanning after overlay duration
    setTimeout(() => {
      setShowFlash(false);
      setStatus('scanning');
      isProcessingRef.current = false;
    }, SUCCESS_OVERLAY_MS);
  }, [onScan]);

  // Native BarcodeDetector scanning loop
  const startNativeScanning = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !detectorRef.current) {
      console.log('[Scanner] Cannot start native scanning - missing refs');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    scanningRef.current = true;
    console.log('[Scanner] Starting native scanning loop at', Math.round(1000 / SCAN_INTERVAL_MS), 'fps');

    // Use setInterval for controlled rate
    scanIntervalRef.current = setInterval(async () => {
      // Check if we should be scanning
      if (!scanningRef.current || isProcessingRef.current) {
        return;
      }

      // Wait for video to have dimensions
      if (!video.videoWidth || !video.videoHeight) {
        return;
      }

      // Set canvas to video dimensions
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      try {
        const barcodes = await detectorRef.current!.detect(canvas);
        if (barcodes.length > 0 && scanningRef.current) {
          handleDetection(barcodes[0].rawValue);
        }
      } catch (e) {
        // Detection error - continue scanning
      }
    }, SCAN_INTERVAL_MS);
  }, [handleDetection]);

  // Initialize scanner
  useEffect(() => {
    let mounted = true;

    const init = async () => {
      const hasBarcodeDetector = 'BarcodeDetector' in window;
      console.log('[Scanner] BarcodeDetector available:', hasBarcodeDetector);

      if (!navigator.mediaDevices?.getUserMedia) {
        console.error('[Scanner] getUserMedia not available');
        setErrorMsg('Camera not available. Make sure you\'re using HTTPS.');
        setStatus('error');
        return;
      }

      initTimeoutRef.current = setTimeout(() => {
        if (status === 'initializing') {
          setCameraHint('Camera not loading? Try refreshing the page or use manual entry below.');
        }
      }, 3000);

      // Try Native BarcodeDetector first
      if (hasBarcodeDetector) {
        try {
          const supportedFormats = await BarcodeDetector.getSupportedFormats();
          console.log('[Scanner] Supported formats:', supportedFormats);

          const formatsToUse = BARCODE_FORMATS.filter(f => supportedFormats.includes(f));

          if (formatsToUse.length >= 3) {
            console.log('[Scanner] Using Native BarcodeDetector with:', formatsToUse);
            detectorRef.current = new BarcodeDetector({ formats: formatsToUse });

            console.log('[Scanner] Requesting camera stream...');
            const stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: 'environment',
                width: { ideal: 1920, min: 1280 },
                height: { ideal: 1080, min: 720 }
              },
              audio: false
            });

            if (!mounted) {
              stream.getTracks().forEach(t => t.stop());
              return;
            }

            console.log('[Scanner] Got stream:', stream.active, 'tracks:', stream.getTracks().length);
            streamRef.current = stream;

            const video = videoRef.current;
            if (video) {
              video.setAttribute('playsinline', 'true');
              video.setAttribute('autoplay', 'true');
              video.setAttribute('muted', 'true');
              video.srcObject = stream;

              await new Promise<void>((resolve, reject) => {
                const timeout = setTimeout(() => reject(new Error('Video load timeout')), 5000);

                video.onloadedmetadata = async () => {
                  clearTimeout(timeout);
                  console.log('[Scanner] Video metadata loaded, dimensions:', video.videoWidth, 'x', video.videoHeight);
                  try {
                    await video.play();
                    console.log('[Scanner] Video playing:', !video.paused);
                    resolve();
                  } catch (playErr) {
                    console.error('[Scanner] Video play error:', playErr);
                    reject(playErr);
                  }
                };

                video.onerror = () => {
                  clearTimeout(timeout);
                  reject(new Error('Video error'));
                };
              });

              if (mounted) {
                if (initTimeoutRef.current) {
                  clearTimeout(initTimeoutRef.current);
                  initTimeoutRef.current = null;
                }
                setScannerType('native');
                setStatus('scanning');
                startNativeScanning();
                console.log('[Scanner] Native scanner started successfully');
                return;
              }
            }
          } else {
            console.log('[Scanner] Not enough barcode formats supported');
          }
        } catch (e: any) {
          console.error('[Scanner] Native BarcodeDetector error:', e.name, e.message);
          if (e.name === 'NotAllowedError') {
            setErrorMsg('Camera permission denied. Please allow camera access and refresh.');
            setStatus('error');
            return;
          }
        }
      }

      // Fallback to ZXing
      console.log('[Scanner] Falling back to ZXing');
      try {
        const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import('@zxing/library');

        if (!mounted) return;

        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.EAN_8,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.CODE_128,
          BarcodeFormat.CODE_39,
          BarcodeFormat.ITF,
          BarcodeFormat.CODABAR,
        ]);
        hints.set(DecodeHintType.TRY_HARDER, true);

        const reader = new BrowserMultiFormatReader(hints);
        setScannerType('zxing');

        await new Promise(resolve => setTimeout(resolve, 100));

        const video = videoRef.current;
        if (!video || !mounted) return;

        console.log('[Scanner] Starting ZXing with high resolution...');

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        console.log('[Scanner] Available cameras:', videoDevices.length);

        let deviceId: string | null = null;
        for (const device of videoDevices) {
          const label = device.label.toLowerCase();
          if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
            deviceId = device.deviceId;
            break;
          }
        }

        zxingReaderRef.current = reader;

        // Throttle ZXing callbacks
        let lastZxingTime = 0;
        await reader.decodeFromVideoDevice(
          deviceId,
          video,
          (result) => {
            if (result) {
              const now = Date.now();
              if (now - lastZxingTime >= SCAN_INTERVAL_MS) {
                lastZxingTime = now;
                handleDetection(result.getText());
              }
            }
          }
        );

        if (mounted) {
          if (initTimeoutRef.current) {
            clearTimeout(initTimeoutRef.current);
            initTimeoutRef.current = null;
          }
          setStatus('scanning');
          console.log('[Scanner] ZXing started successfully');
        }
      } catch (e: any) {
        console.error('[Scanner] ZXing failed:', e.name, e.message);
        if (e.name === 'NotAllowedError' || e.message?.includes('Permission')) {
          setErrorMsg('Camera permission denied. Please allow camera access and refresh.');
        } else {
          setErrorMsg(e.message || 'Could not start camera');
        }
        setStatus('error');
      }
    };

    init();

    return () => {
      mounted = false;
      cleanup();
    };
  }, [cleanup, handleDetection, startNativeScanning, status]);

  // Manual barcode submission
  const handleManualSubmit = () => {
    const barcode = manualBarcode.trim();
    if (barcode.length >= 6) {
      // Block future scans of this barcode
      lastScannedBarcodeRef.current = barcode;
      lastScanTimeRef.current = Date.now();
      onScan(barcode);
      setManualBarcode('');
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
    // Fill available viewport height minus some padding for header
    minHeight: 'calc(100vh - 280px)',
    maxHeight: 'calc(100vh - 200px)',
    display: 'flex',
    flexDirection: 'column',
  };

  return (
    <div style={containerStyle}>
      {/* Camera View */}
      <div style={{ flex: 1, position: 'relative', minHeight: fullScreen ? 0 : '350px', overflow: 'hidden' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: scannerType ? 'block' : 'none',
          }}
        />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

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
            {cameraHint && (
              <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', maxWidth: '280px', textAlign: 'center', fontSize: '13px' }}>
                {cameraHint}
              </div>
            )}
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
            <div style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '16px' }}>{errorMsg}</div>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '10px 20px',
                background: '#374151',
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              Refresh Page
            </button>
          </div>
        )}

        {/* Success flash overlay - LARGE and obvious */}
        {showFlash && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(34, 197, 94, 0.7)',
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}>
            <div style={{
              background: 'rgba(0, 0, 0, 0.95)',
              color: '#22c55e',
              padding: '32px 56px',
              borderRadius: '20px',
              fontWeight: 700,
              fontSize: '28px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '12px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
              border: '4px solid #22c55e',
            }}>
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>SCANNED!</span>
              {lastScannedDisplay && (
                <span style={{ fontSize: '16px', color: '#9ca3af', fontFamily: 'monospace' }}>
                  {lastScannedDisplay}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Scanning overlay */}
        {(status === 'scanning' || status === 'cooldown') && !showFlash && (
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
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>
                {status === 'cooldown' ? 'Item scanned!' : 'Point at barcode'}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.8 }}>
                Hold steady for best results
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
              background: status === 'cooldown' ? 'rgba(34, 197, 94, 0.9)' : 'rgba(0,0,0,0.7)',
              padding: '12px 24px',
              borderRadius: '24px',
              color: '#fff',
            }}>
              <span style={{
                width: '12px',
                height: '12px',
                background: status === 'cooldown' ? '#fff' : '#22c55e',
                borderRadius: '50%',
                animation: status === 'cooldown' ? 'none' : 'pulse 1s infinite',
              }} />
              <span style={{ fontWeight: 600 }}>
                {status === 'cooldown' ? '✓ Ready for next item' : 'Scanning...'}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Manual Entry Section */}
      <div style={{
        padding: '16px',
        background: fullScreen ? 'rgba(0,0,0,0.9)' : '#1a1a2e',
      }}>
        <div style={{ marginBottom: '8px', color: '#9ca3af', fontSize: '13px', textAlign: 'center' }}>
          Or enter barcode manually:
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Type barcode number..."
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
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
