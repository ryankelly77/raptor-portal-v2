'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import styles from '../inventory.module.css';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose?: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [status, setStatus] = useState<'loading' | 'scanning' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [showTips, setShowTips] = useState(false);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const scannerRef = useRef<any>(null);
  const tipsTimerRef = useRef<NodeJS.Timeout | null>(null);
  const containerId = 'barcode-scanner-view';

  const stopScanner = useCallback(async () => {
    if (tipsTimerRef.current) {
      clearTimeout(tipsTimerRef.current);
      tipsTimerRef.current = null;
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

  useEffect(() => {
    let mounted = true;

    const startScanner = async () => {
      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');

        if (!mounted) return;

        // Get cameras
        const devices = await Html5Qrcode.getCameras();

        if (!devices || devices.length === 0) {
          setErrorMsg('No camera found on this device');
          setStatus('error');
          return;
        }

        // Prefer back camera
        const backCamera = devices.find(
          (d) =>
            d.label.toLowerCase().includes('back') ||
            d.label.toLowerCase().includes('rear') ||
            d.label.toLowerCase().includes('environment')
        );
        const cameraId = backCamera?.id || devices[0].id;

        // Explicitly define all barcode formats to support
        const formatsToSupport = [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.ITF,
        ];

        // Create scanner with explicit formats
        const scanner = new Html5Qrcode(containerId, {
          formatsToSupport,
          verbose: false,
        });
        scannerRef.current = scanner;

        // Calculate dimensions - wide rectangle for barcodes
        const containerEl = document.getElementById(containerId);
        const containerWidth = containerEl?.clientWidth || 320;
        const qrboxWidth = Math.min(Math.floor(containerWidth * 0.85), 300);
        const qrboxHeight = Math.floor(qrboxWidth * 0.35); // Wide rectangle for barcodes

        await scanner.start(
          cameraId,
          {
            fps: 10,
            qrbox: { width: qrboxWidth, height: qrboxHeight },
            aspectRatio: 1.777, // 16:9
            disableFlip: false,
          },
          (decodedText) => {
            // Success! Vibrate and show feedback
            if (navigator.vibrate) {
              navigator.vibrate(200);
            }

            // Try to play a beep sound
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
              // Audio not supported, ignore
            }

            setLastScanned(decodedText);
            stopScanner();
            onScan(decodedText);
          },
          () => {
            // Ignore - no barcode found in frame
          }
        );

        if (mounted) {
          setStatus('scanning');

          // Show tips after 10 seconds of no scan
          tipsTimerRef.current = setTimeout(() => {
            if (mounted) {
              setShowTips(true);
            }
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
  }, [onScan, stopScanner]);

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
        <div id={containerId} style={{ width: '100%' }} />

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

        {/* Scanning overlay with viewfinder hint */}
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
            Scanning... Position barcode in frame
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
          Align barcode within the rectangle
        </div>
      )}

      {/* Tips after 10 seconds */}
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
            <li>Keep barcode flat, not curved</li>
            <li>Try landscape orientation</li>
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

      {/* Manual Entry - always visible */}
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

      {/* CSS for pulse animation */}
      <style jsx global>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
