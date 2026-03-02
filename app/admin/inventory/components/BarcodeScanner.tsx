'use client';

import { useState, useEffect, useRef } from 'react';
import styles from '../inventory.module.css';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose?: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [isReady, setIsReady] = useState(false);
  const scannerRef = useRef<any>(null);
  const containerIdRef = useRef(`scanner-${Date.now()}`);

  useEffect(() => {
    let mounted = true;

    const initScanner = async () => {
      try {
        // Dynamically import to avoid SSR issues
        const { Html5QrcodeScanner, Html5QrcodeSupportedFormats } = await import('html5-qrcode');

        if (!mounted) return;

        const config = {
          fps: 10,
          qrbox: { width: 250, height: 100 },
          formatsToSupport: [
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
          rememberLastUsedCamera: true,
          showTorchButtonIfSupported: true,
        };

        const scanner = new Html5QrcodeScanner(
          containerIdRef.current,
          config,
          /* verbose= */ false
        );

        scannerRef.current = scanner;

        scanner.render(
          (decodedText: string) => {
            // Success callback
            if (navigator.vibrate) {
              navigator.vibrate(100);
            }
            scanner.clear();
            onScan(decodedText);
          },
          (errorMessage: string) => {
            // Error callback - ignore, these are just "no code found" messages
            console.debug('Scan error:', errorMessage);
          }
        );

        setIsReady(true);
      } catch (err) {
        console.error('Scanner init error:', err);
        if (mounted) {
          setError('Could not initialize scanner. Please use manual entry.');
        }
      }
    };

    // Small delay to ensure DOM is ready
    const timer = setTimeout(initScanner, 100);

    return () => {
      mounted = false;
      clearTimeout(timer);
      if (scannerRef.current) {
        try {
          scannerRef.current.clear();
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    };
  }, [onScan]);

  function handleManualSubmit() {
    const barcode = manualBarcode.trim();
    if (barcode) {
      if (scannerRef.current) {
        try {
          scannerRef.current.clear();
        } catch (e) {
          // Ignore
        }
      }
      onScan(barcode);
      setManualBarcode('');
    }
  }

  function handleClose() {
    if (scannerRef.current) {
      try {
        scannerRef.current.clear();
      } catch (e) {
        // Ignore
      }
    }
    if (onClose) {
      onClose();
    }
  }

  return (
    <div>
      {/* Scanner Container - html5-qrcode will render its UI here */}
      <div
        id={containerIdRef.current}
        style={{
          width: '100%',
          marginBottom: '16px',
        }}
      />

      {/* Error Message */}
      {error && (
        <div style={{
          color: '#dc2626',
          padding: '12px',
          background: '#fef2f2',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          {error}
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
    </div>
  );
}
