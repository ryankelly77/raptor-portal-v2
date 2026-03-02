'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from '../inventory.module.css';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose?: () => void;
}

declare global {
  interface BarcodeDetectorOptions {
    formats: string[];
  }
  interface DetectedBarcode {
    rawValue: string;
    format: string;
  }
  class BarcodeDetector {
    constructor(options?: BarcodeDetectorOptions);
    detect(image: ImageBitmapSource): Promise<DetectedBarcode[]>;
    static getSupportedFormats(): Promise<string[]>;
  }
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [status, setStatus] = useState<'loading' | 'scanning' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [showTips, setShowTips] = useState(false);
  const [scannerType, setScannerType] = useState<'native' | 'html5' | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scannerRef = useRef<any>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const animationRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tipsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastScanRef = useRef<string | null>(null);
  const containerId = 'barcode-scanner-view';

  const stopScanner = useCallback(async () => {
    if (tipsTimerRef.current) {
      clearTimeout(tipsTimerRef.current);
      tipsTimerRef.current = null;
    }
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (e) {
        // Ignore
      }
    }
  }, []);

  const handleSuccessfulScan = useCallback((barcode: string) => {
    // Prevent duplicate scans
    if (lastScanRef.current === barcode) return;
    lastScanRef.current = barcode;

    // Vibrate
    if (navigator.vibrate) {
      navigator.vibrate(200);
    }

    // Beep
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      oscillator.frequency.value = 1200;
      oscillator.type = 'sine';
      gainNode.gain.value = 0.3;
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (e) {}

    stopScanner();
    onScan(barcode);
  }, [onScan, stopScanner]);

  // Native BarcodeDetector scanning - very fast, full frame
  const startNativeScanning = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !detectorRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    let scanning = true;

    const scan = async () => {
      if (!scanning || !video.videoWidth || !video.videoHeight) {
        if (scanning) animationRef.current = requestAnimationFrame(scan);
        return;
      }

      // Use full resolution for better detection
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0);

      try {
        const barcodes = await detectorRef.current!.detect(canvas);
        if (barcodes.length > 0) {
          scanning = false;
          handleSuccessfulScan(barcodes[0].rawValue);
          return;
        }
      } catch (e) {}

      if (scanning) {
        animationRef.current = requestAnimationFrame(scan);
      }
    };

    scan();
  }, [handleSuccessfulScan]);

  useEffect(() => {
    let mounted = true;

    const startScanner = async () => {
      // Check for camera API support first
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setErrorMsg('Camera not supported. Please use HTTPS or a different browser.');
        setStatus('error');
        return;
      }

      // Try native BarcodeDetector first (fastest, best orientation support)
      if ('BarcodeDetector' in window) {
        try {
          const formats = await BarcodeDetector.getSupportedFormats();
          const neededFormats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'];
          const supportedFormats = neededFormats.filter(f => formats.includes(f));

          if (supportedFormats.length >= 2) {
            detectorRef.current = new BarcodeDetector({ formats: supportedFormats });

            const stream = await navigator.mediaDevices.getUserMedia({
              video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 1920, min: 640 },
                height: { ideal: 1080, min: 480 },
                frameRate: { ideal: 30, min: 10 },
              },
            });

            if (!mounted) {
              stream.getTracks().forEach(t => t.stop());
              return;
            }

            streamRef.current = stream;

            if (videoRef.current) {
              videoRef.current.srcObject = stream;

              // Wait for video to be ready
              await new Promise<void>((resolve, reject) => {
                const video = videoRef.current!;
                video.onloadedmetadata = () => resolve();
                video.onerror = () => reject(new Error('Video failed to load'));
                // Timeout after 5 seconds
                setTimeout(() => reject(new Error('Video load timeout')), 5000);
              });

              try {
                await videoRef.current.play();
              } catch (playErr: any) {
                console.error('Video play error:', playErr);
                throw new Error('Could not start video preview');
              }

              if (mounted) {
                setScannerType('native');
                setStatus('scanning');
                startNativeScanning();
                tipsTimerRef.current = setTimeout(() => {
                  if (mounted) setShowTips(true);
                }, 8000);
              }
            } else {
              throw new Error('Video element not found');
            }
            return;
          }
        } catch (e: any) {
          console.log('Native BarcodeDetector error:', e?.name, e?.message);
          // If it's a permission error, don't try the fallback - show the error
          if (e?.name === 'NotAllowedError' || e?.message?.includes('Permission')) {
            if (mounted) {
              setErrorMsg('Camera permission denied. Please allow camera access and try again.');
              setStatus('error');
            }
            return;
          }
          // Otherwise fall through to html5-qrcode
        }
      }

      // Fallback to html5-qrcode
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');

        if (!mounted) return;

        let devices;
        try {
          devices = await Html5Qrcode.getCameras();
        } catch (camErr: any) {
          console.error('Camera enumeration error:', camErr);
          if (camErr?.message?.includes('Permission') || camErr?.name === 'NotAllowedError') {
            setErrorMsg('Camera permission denied. Please allow camera access in your browser settings.');
          } else {
            setErrorMsg('Could not access camera. Make sure no other app is using it.');
          }
          setStatus('error');
          return;
        }

        if (!devices || devices.length === 0) {
          setErrorMsg('No camera found on this device.');
          setStatus('error');
          return;
        }

        const backCamera = devices.find(d =>
          d.label.toLowerCase().includes('back') ||
          d.label.toLowerCase().includes('rear') ||
          d.label.toLowerCase().includes('environment')
        );

        const formatsToSupport = [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.ITF,
        ];

        const scanner = new Html5Qrcode(containerId, {
          formatsToSupport,
          verbose: false,
        });
        scannerRef.current = scanner;
        setScannerType('html5');

        // Use higher resolution and NO qrbox restriction for faster scanning
        await scanner.start(
          backCamera?.id || { facingMode: 'environment' },
          {
            fps: 15,
            aspectRatio: 1.777778, // 16:9
            // No qrbox = scan full frame
          },
          (decodedText) => {
            handleSuccessfulScan(decodedText);
          },
          () => {}
        );

        if (mounted) {
          setStatus('scanning');
          tipsTimerRef.current = setTimeout(() => {
            if (mounted) setShowTips(true);
          }, 8000);
        }
      } catch (err: any) {
        console.error('Scanner start error:', err?.name, err?.message, err);
        if (mounted) {
          if (err?.name === 'NotAllowedError' || err?.message?.includes('Permission')) {
            setErrorMsg('Camera permission denied. Please allow camera access and reload the page.');
          } else if (err?.name === 'NotReadableError' || err?.message?.includes('in use') || err?.message?.includes('Could not start')) {
            setErrorMsg('Camera is in use by another app. Close other apps using the camera and try again.');
          } else if (err?.name === 'OverconstrainedError') {
            setErrorMsg('Camera settings not supported. Trying with basic settings...');
            // Could retry with simpler constraints here
          } else {
            setErrorMsg(err?.message || 'Could not start camera. Please try again.');
          }
          setStatus('error');
        }
      }
    };

    startScanner();

    return () => {
      mounted = false;
      stopScanner();
    };
  }, [stopScanner, startNativeScanning, handleSuccessfulScan, retryCount]);

  function handleRetry() {
    setStatus('loading');
    setErrorMsg(null);
    setScannerType(null);
    setRetryCount(c => c + 1);
  }

  function handleManualSubmit() {
    const barcode = manualBarcode.trim();
    if (barcode) {
      stopScanner();
      onScan(barcode);
      setManualBarcode('');
    }
  }

  function handleClose() {
    stopScanner();
    if (onClose) onClose();
  }

  return (
    <div>
      {/* Camera View */}
      <div
        style={{
          background: '#000',
          borderRadius: '12px',
          overflow: 'hidden',
          marginBottom: '16px',
          position: 'relative',
        }}
      >
        {/* Native detector video element - always rendered but hidden when not active */}
        <video
          ref={videoRef}
          style={{
            width: '100%',
            height: '300px',
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
            minHeight: scannerType === 'html5' ? '300px' : '0',
            display: scannerType === 'html5' ? 'block' : 'none',
          }}
        />

        {/* Loading state */}
        {status === 'loading' && !scannerType && (
          <div style={{
            minHeight: '300px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
          }}>
            <div className={styles.spinner} style={{ borderTopColor: '#FF580F', marginBottom: '12px' }} />
            <span>Starting camera...</span>
          </div>
        )}

        {/* Error state overlay */}
        {status === 'error' && !scannerType && (
          <div style={{
            minHeight: '300px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            padding: '20px',
          }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5" style={{ marginBottom: '12px' }}>
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <line x1="9" y1="12" x2="15" y2="12" />
            </svg>
            <span style={{ color: '#ef4444' }}>Camera unavailable</span>
          </div>
        )}

        {/* Scanning indicator */}
        {status === 'scanning' && (
          <div style={{
            position: 'absolute',
            bottom: '12px',
            left: '50%',
            transform: 'translateX(-50%)',
            color: '#fff',
            fontSize: '13px',
            background: 'rgba(0,0,0,0.7)',
            padding: '8px 16px',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <span style={{
              width: '10px',
              height: '10px',
              background: '#22c55e',
              borderRadius: '50%',
              animation: 'pulse 1s infinite',
            }} />
            Point at barcode
          </div>
        )}
      </div>

      {/* Status Messages */}
      {status === 'scanning' && !showTips && (
        <div style={{
          textAlign: 'center',
          padding: '12px',
          background: '#dcfce7',
          color: '#16a34a',
          borderRadius: '8px',
          marginBottom: '16px',
          fontWeight: 500,
          fontSize: '14px',
        }}>
          Scanning full frame - just point and go
        </div>
      )}

      {status === 'scanning' && showTips && (
        <div style={{
          padding: '12px',
          background: '#fef3c7',
          color: '#92400e',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '14px',
        }}>
          <strong>Tips:</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: '20px' }}>
            <li>Hold 6-8 inches away</li>
            <li>Ensure good lighting</li>
            <li>Keep steady</li>
          </ul>
        </div>
      )}

      {status === 'error' && errorMsg && (
        <div style={{
          padding: '12px',
          background: '#fef2f2',
          color: '#dc2626',
          borderRadius: '8px',
          marginBottom: '16px',
        }}>
          <div style={{ marginBottom: '12px' }}>{errorMsg}</div>
          <button
            onClick={handleRetry}
            style={{
              width: '100%',
              padding: '10px',
              background: '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      )}

      {/* Manual Entry */}
      <div className={styles.manualEntry}>
        <input
          type="text"
          inputMode="numeric"
          className={styles.formInput}
          placeholder="Or type barcode manually..."
          value={manualBarcode}
          onChange={(e) => setManualBarcode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleManualSubmit();
          }}
        />
        <button
          className={styles.btnPrimary}
          onClick={handleManualSubmit}
          style={{ flex: '0 0 auto' }}
        >
          Add
        </button>
      </div>

      {/* Close Button */}
      {onClose && (
        <button
          className={styles.btnSecondary}
          onClick={handleClose}
          style={{ width: '100%', marginTop: '12px' }}
        >
          Cancel
        </button>
      )}

      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
