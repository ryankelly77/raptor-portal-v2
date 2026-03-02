'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import styles from '../inventory.module.css';

interface BarcodeScannerProps {
  onScan: (barcode: string) => void;
  onClose?: () => void;
}

export function BarcodeScanner({ onScan, onClose }: BarcodeScannerProps) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state === 2) { // SCANNING
          await scannerRef.current.stop();
        }
      } catch (err) {
        console.error('Error stopping scanner:', err);
      }
    }
    setScanning(false);
  }, []);

  const startScanner = useCallback(async (deviceId: string) => {
    if (!containerRef.current) return;

    setError(null);
    setScanning(true);

    try {
      // Create new instance if needed
      if (!scannerRef.current) {
        scannerRef.current = new Html5Qrcode('barcode-scanner');
      }

      await scannerRef.current.start(
        deviceId,
        {
          fps: 10,
          qrbox: { width: 250, height: 100 },
          aspectRatio: 1.333,
        },
        (decodedText) => {
          // Success callback
          onScan(decodedText);
          stopScanner();
        },
        () => {
          // Ignore scan failures (no code found in frame)
        }
      );
    } catch (err) {
      console.error('Scanner error:', err);
      setError('Could not start camera. Please check permissions or use manual entry.');
      setScanning(false);
    }
  }, [onScan, stopScanner]);

  // Get available cameras
  useEffect(() => {
    Html5Qrcode.getCameras()
      .then((devices) => {
        if (devices && devices.length > 0) {
          setCameras(devices);
          // Prefer back camera
          const backCamera = devices.find(
            (d) =>
              d.label.toLowerCase().includes('back') ||
              d.label.toLowerCase().includes('rear') ||
              d.label.toLowerCase().includes('environment')
          );
          setCameraId(backCamera?.id || devices[0].id);
        }
      })
      .catch((err) => {
        console.error('Error getting cameras:', err);
        setError('Could not access camera. Please use manual entry.');
      });

    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  // Auto-start when camera is selected
  useEffect(() => {
    if (cameraId && !scanning && !error) {
      startScanner(cameraId);
    }
  }, [cameraId, scanning, error, startScanner]);

  function handleManualSubmit() {
    const barcode = manualBarcode.trim();
    if (barcode) {
      onScan(barcode);
      setManualBarcode('');
    }
  }

  function handleCameraChange(newCameraId: string) {
    stopScanner().then(() => {
      setCameraId(newCameraId);
    });
  }

  return (
    <div>
      {/* Camera Scanner */}
      <div className={styles.scannerContainer} ref={containerRef}>
        <div id="barcode-scanner" className={styles.scannerPreview} />
      </div>

      {/* Camera Selection */}
      {cameras.length > 1 && (
        <div className={styles.scannerControls}>
          <select
            className={styles.formSelect}
            value={cameraId || ''}
            onChange={(e) => handleCameraChange(e.target.value)}
          >
            {cameras.map((cam) => (
              <option key={cam.id} value={cam.id}>
                {cam.label || `Camera ${cam.id}`}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{ color: '#dc2626', padding: '12px', background: '#fef2f2', borderRadius: '8px', marginBottom: '16px' }}>
          {error}
        </div>
      )}

      {/* Scanning Status */}
      {scanning && !error && (
        <div style={{ textAlign: 'center', padding: '12px', color: '#6b7280' }}>
          <div className={styles.spinner} style={{ margin: '0 auto 8px' }} />
          Point camera at barcode...
        </div>
      )}

      {/* Manual Entry */}
      <div className={styles.manualEntry}>
        <input
          type="text"
          className={styles.formInput}
          placeholder="Or enter barcode manually..."
          value={manualBarcode}
          onChange={(e) => setManualBarcode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleManualSubmit();
          }}
        />
        <button className={styles.btnPrimary} onClick={handleManualSubmit} style={{ flex: '0 0 auto' }}>
          Submit
        </button>
      </div>

      {/* Close Button */}
      {onClose && (
        <button
          className={styles.btnSecondary}
          onClick={() => {
            stopScanner();
            onClose();
          }}
          style={{ width: '100%', marginTop: '12px' }}
        >
          Cancel
        </button>
      )}
    </div>
  );
}
