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
  const [scannerType, setScannerType] = useState<'native' | 'zxing' | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [cameraHint, setCameraHint] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const scanningRef = useRef<boolean>(false);
  const animationRef = useRef<number | null>(null);
  const zxingReaderRef = useRef<any>(null);
  const lastScanTimeRef = useRef<number>(0);
  const initTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    console.log('[Scanner] Cleaning up...');
    scanningRef.current = false;

    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
      initTimeoutRef.current = null;
    }

    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
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

  // Handle successful scan
  const handleDetection = useCallback((barcode: string) => {
    // Debounce - prevent duplicate scans within 1 second
    const now = Date.now();
    if (now - lastScanTimeRef.current < 1000) return;
    if (barcode === lastScanned) return;

    console.log('[Scanner] Detected barcode:', barcode);
    lastScanTimeRef.current = now;
    setLastScanned(barcode);
    setStatus('success');
    setShowFlash(true);

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

    // Hide flash after animation
    setTimeout(() => setShowFlash(false), 300);

    // Pass barcode to parent
    cleanup();
    onScan(barcode);
  }, [lastScanned, cleanup, onScan]);

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
    console.log('[Scanner] Starting native scanning loop');

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
      // Check BarcodeDetector availability
      const hasBarcodeDetector = 'BarcodeDetector' in window;
      console.log('[Scanner] BarcodeDetector available:', hasBarcodeDetector);

      // Check if camera is available
      if (!navigator.mediaDevices?.getUserMedia) {
        console.error('[Scanner] getUserMedia not available');
        setErrorMsg('Camera not available. Make sure you\'re using HTTPS.');
        setStatus('error');
        return;
      }

      // Set a timeout to show hint if camera takes too long
      initTimeoutRef.current = setTimeout(() => {
        if (status === 'initializing') {
          setCameraHint('Camera not loading? Try refreshing the page or use manual entry below.');
        }
      }, 3000);

      // Try Native BarcodeDetector first (Chrome Android, Safari 17.2+)
      if (hasBarcodeDetector) {
        try {
          const supportedFormats = await BarcodeDetector.getSupportedFormats();
          console.log('[Scanner] Supported formats:', supportedFormats);

          const formatsToUse = BARCODE_FORMATS.filter(f => supportedFormats.includes(f));

          if (formatsToUse.length >= 3) {
            console.log('[Scanner] Using Native BarcodeDetector with:', formatsToUse);
            detectorRef.current = new BarcodeDetector({ formats: formatsToUse });

            // Request high resolution camera
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
              // Safari-specific: set attributes explicitly
              video.setAttribute('playsinline', 'true');
              video.setAttribute('autoplay', 'true');
              video.setAttribute('muted', 'true');

              // Set the stream
              video.srcObject = stream;

              // Wait for metadata then play
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
          // Fall through to ZXing
        }
      }

      // Fallback to ZXing
      console.log('[Scanner] Falling back to ZXing');
      try {
        const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import('@zxing/library');

        if (!mounted) return;

        // Configure for product barcodes with TRY_HARDER mode
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

        // Set scanner type so video element renders
        setScannerType('zxing');

        // Wait for React to render
        await new Promise(resolve => setTimeout(resolve, 100));

        const video = videoRef.current;
        if (!video || !mounted) return;

        console.log('[Scanner] Starting ZXing with high resolution...');

        // Get list of video devices and select back camera
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        console.log('[Scanner] Available cameras:', videoDevices.length);

        // Prefer back camera - look for 'back', 'rear', or 'environment'
        let deviceId: string | null = null;
        for (const device of videoDevices) {
          const label = device.label.toLowerCase();
          if (label.includes('back') || label.includes('rear') || label.includes('environment')) {
            deviceId = device.deviceId;
            break;
          }
        }

        // Store reader reference for cleanup
        zxingReaderRef.current = reader;

        // Start continuous scanning
        await reader.decodeFromVideoDevice(
          deviceId, // null = default camera (usually back on mobile)
          video,
          (result, error) => {
            if (result) {
              handleDetection(result.getText());
            }
            // Errors are normal when no barcode is visible - ignore them
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
        {/* Video element - used by both native and ZXing */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
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
              <div style={{ fontSize: '12px', opacity: 0.8 }}>
                Using: {scannerType === 'native' ? 'Native BarcodeDetector' : 'ZXing Scanner'}
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
      `}</style>
    </div>
  );
}
