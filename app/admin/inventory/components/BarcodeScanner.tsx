'use client';

import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import styles from '../inventory.module.css';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose?: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [isStarting, setIsStarting] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const startScanner = async () => {
      try {
        // Create scanner instance
        const scanner = new Html5Qrcode('barcode-reader', {
          formatsToSupport: [
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
          ],
          verbose: false,
        });
        scannerRef.current = scanner;

        // Get cameras
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) {
          throw new Error('No cameras found');
        }

        // Find back camera
        const backCamera = cameras.find(
          (c) =>
            c.label.toLowerCase().includes('back') ||
            c.label.toLowerCase().includes('rear') ||
            c.label.toLowerCase().includes('environment')
        );
        const cameraId = backCamera?.id || cameras[0].id;

        // Start scanning
        await scanner.start(
          cameraId,
          {
            fps: 10,
            qrbox: { width: 280, height: 120 },
          },
          (decodedText) => {
            if (mountedRef.current) {
              // Vibrate on success if available
              if (navigator.vibrate) {
                navigator.vibrate(100);
              }
              onScan(decodedText);
            }
          },
          () => {
            // Ignore errors (no barcode in frame)
          }
        );

        if (mountedRef.current) {
          setIsActive(true);
          setIsStarting(false);
        }
      } catch (err) {
        console.error('Scanner error:', err);
        if (mountedRef.current) {
          setError('Could not start camera. Please allow camera access or use manual entry.');
          setIsStarting(false);
        }
      }
    };

    startScanner();

    return () => {
      mountedRef.current = false;
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [onScan]);

  function handleManualSubmit() {
    const barcode = manualBarcode.trim();
    if (barcode) {
      onScan(barcode);
      setManualBarcode('');
    }
  }

  function handleClose() {
    if (scannerRef.current && isActive) {
      scannerRef.current.stop().catch(() => {});
    }
    if (onClose) {
      onClose();
    }
  }

  return (
    <div>
      {/* Camera Scanner */}
      <div className={styles.scannerContainer}>
        <div id="barcode-reader" style={{ width: '100%' }} />
      </div>

      {/* Error Message */}
      {error && (
        <div style={{ color: '#dc2626', padding: '12px', background: '#fef2f2', borderRadius: '8px', marginBottom: '16px', marginTop: '16px' }}>
          {error}
        </div>
      )}

      {/* Starting Status */}
      {isStarting && !error && (
        <div style={{ textAlign: 'center', padding: '20px', color: '#6b7280' }}>
          <div className={styles.spinner} style={{ margin: '0 auto 12px' }} />
          Starting camera...
        </div>
      )}

      {/* Active Status */}
      {isActive && !error && (
        <div style={{ textAlign: 'center', padding: '12px', color: '#16a34a', background: '#dcfce7', borderRadius: '8px', marginTop: '12px' }}>
          Scanner active - point at barcode
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
        <button className={styles.btnPrimary} onClick={handleManualSubmit} style={{ flex: '0 0 auto' }}>
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
    </div>
  );
}
