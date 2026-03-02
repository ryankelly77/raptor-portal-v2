'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from '../inventory.module.css';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose?: () => void;
}

// Declare BarcodeDetector types for TypeScript
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
  const [useNativeDetector, setUseNativeDetector] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scannerRef = useRef<any>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const animationRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tipsTimerRef = useRef<NodeJS.Timeout | null>(null);
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
        // Ignore stop errors
      }
    }
  }, []);

  // Native BarcodeDetector scanning loop
  const startNativeScanning = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !detectorRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scan = async () => {
      if (!video.videoWidth || !video.videoHeight) {
        animationRef.current = requestAnimationFrame(scan);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      // Draw video frame to canvas
      ctx.drawImage(video, 0, 0);

      try {
        const barcodes = await detectorRef.current!.detect(canvas);
        if (barcodes.length > 0) {
          const barcode = barcodes[0];
          // Success! Vibrate and beep
          if (navigator.vibrate) {
            navigator.vibrate(200);
          }
          playBeep();
          stopScanner();
          onScan(barcode.rawValue);
          return;
        }
      } catch (e) {
        // Detection error, continue scanning
      }

      animationRef.current = requestAnimationFrame(scan);
    };

    scan();
  }, [onScan, stopScanner]);

  // Play beep sound
  function playBeep() {
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
    } catch (e) {
      // Audio not supported
    }
  }

  useEffect(() => {
    let mounted = true;

    const startScanner = async () => {
      // Check if native BarcodeDetector is available
      const hasNativeDetector = 'BarcodeDetector' in window;

      if (hasNativeDetector) {
        try {
          const formats = await BarcodeDetector.getSupportedFormats();
          const neededFormats = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39'];
          const supportedFormats = neededFormats.filter(f => formats.includes(f));

          if (supportedFormats.length > 0) {
            // Use native BarcodeDetector
            setUseNativeDetector(true);

            detectorRef.current = new BarcodeDetector({
              formats: supportedFormats,
            });

            // Get camera stream
            try {
              const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                  facingMode: 'environment',
                  width: { ideal: 1280 },
                  height: { ideal: 720 },
                },
              });

              if (!mounted) {
                stream.getTracks().forEach(track => track.stop());
                return;
              }

              streamRef.current = stream;

              if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();

                if (mounted) {
                  setStatus('scanning');
                  startNativeScanning();

                  // Show tips after 10 seconds
                  tipsTimerRef.current = setTimeout(() => {
                    if (mounted) setShowTips(true);
                  }, 10000);
                }
              }
              return;
            } catch (err: any) {
              console.error('Camera error:', err);
              if (err?.name === 'NotAllowedError') {
                setErrorMsg('Camera permission denied. Please allow camera access.');
                setStatus('error');
                return;
              }
              // Fall through to html5-qrcode
            }
          }
        } catch (e) {
          console.log('Native BarcodeDetector not fully supported, falling back');
        }
      }

      // Fallback to html5-qrcode
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');

        if (!mounted) return;

        const devices = await Html5Qrcode.getCameras();

        if (!devices || devices.length === 0) {
          setErrorMsg('No camera found on this device');
          setStatus('error');
          return;
        }

        const backCamera = devices.find(
          (d) =>
            d.label.toLowerCase().includes('back') ||
            d.label.toLowerCase().includes('rear') ||
            d.label.toLowerCase().includes('environment')
        );
        const cameraId = backCamera?.id || devices[0].id;

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

        // Use square scanning region for better orientation handling
        // Or scan full frame by not restricting qrbox
        await scanner.start(
          cameraId,
          {
            fps: 10,
            aspectRatio: 1.0, // Square aspect for orientation-agnostic scanning
            disableFlip: false, // Allow reading flipped/mirrored codes
          },
          (decodedText) => {
            if (navigator.vibrate) {
              navigator.vibrate(200);
            }
            playBeep();
            stopScanner();
            onScan(decodedText);
          },
          () => {
            // No barcode found in frame
          }
        );

        if (mounted) {
          setStatus('scanning');
          tipsTimerRef.current = setTimeout(() => {
            if (mounted) setShowTips(true);
          }, 10000);
        }
      } catch (err: any) {
        console.error('Scanner error:', err);
        if (mounted) {
          if (err?.message?.includes('Permission')) {
            setErrorMsg('Camera permission denied. Please allow camera access and refresh.');
          } else {
            setErrorMsg(err?.message || 'Could not start camera');
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
  }, [onScan, stopScanner, startNativeScanning]);

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
          minHeight: '280px',
          position: 'relative',
        }}
      >
        {/* Native detector uses video element */}
        {useNativeDetector && (
          <>
            <video
              ref={videoRef}
              style={{
                width: '100%',
                height: '280px',
                objectFit: 'cover',
              }}
              playsInline
              muted
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            {/* Scan region overlay */}
            <div style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <div style={{
                width: '80%',
                height: '100px',
                border: '3px solid #FF580F',
                borderRadius: '8px',
                boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.4)',
              }} />
            </div>
          </>
        )}

        {/* html5-qrcode container */}
        {!useNativeDetector && (
          <div id={containerId} style={{ width: '100%' }} />
        )}

        {status === 'loading' && (
          <div style={{
            position: 'absolute',
            inset: 0,
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

        {status === 'scanning' && (
          <div style={{
            position: 'absolute',
            bottom: '8px',
            left: '50%',
            transform: 'translateX(-50%)',
            color: '#fff',
            fontSize: '12px',
            background: 'rgba(0,0,0,0.6)',
            padding: '6px 12px',
            borderRadius: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              background: '#22c55e',
              borderRadius: '50%',
              animation: 'pulse 1.5s infinite',
            }} />
            Scanning... Any orientation works
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
        }}>
          Point camera at barcode (any direction)
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
          <strong>Having trouble?</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: '20px' }}>
            <li>Hold barcode 6-8 inches from camera</li>
            <li>Keep phone and barcode steady</li>
            <li>Ensure good lighting</li>
            <li>Works upside down too!</li>
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
          {errorMsg}
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
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
