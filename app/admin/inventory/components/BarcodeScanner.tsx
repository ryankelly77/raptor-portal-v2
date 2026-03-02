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

// Scanner settings
const SCAN_INTERVAL_MS = 150; // ~7fps
const COOLDOWN_MS = 2000; // 2 second cooldown after successful scan
const CONSECUTIVE_FRAMES_REQUIRED = 3; // Reduced for harder barcodes
const SUCCESS_OVERLAY_MS = 1500; // Green overlay duration
const SAME_BARCODE_BLOCK_MS = 10000; // Block same barcode for 10 seconds
const FALLBACK_SHOW_DELAY_MS = 6000; // Show fallback options after 6 seconds

export function BarcodeScanner({ onScan, onClose, fullScreen = false }: BarcodeScannerProps) {
  const [status, setStatus] = useState<'initializing' | 'scanning' | 'cooldown' | 'error'>('initializing');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [manualBarcode, setManualBarcode] = useState('');
  const [scannerType, setScannerType] = useState<'native' | 'zxing' | null>(null);
  const [showFlash, setShowFlash] = useState(false);
  const [cameraHint, setCameraHint] = useState<string | null>(null);
  const [lastScannedDisplay, setLastScannedDisplay] = useState<string | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [showFallback, setShowFallback] = useState(false);
  const [photoProcessing, setPhotoProcessing] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const processCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);
  const scanningRef = useRef<boolean>(false);
  const scanIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const zxingReaderRef = useRef<any>(null);
  const initTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  // ALL blocking logic uses refs for synchronous access
  const lastScanTimeRef = useRef<number>(0);
  const lastScannedBarcodeRef = useRef<string>('');
  const isProcessingRef = useRef<boolean>(false);
  const consecutiveDetectionsRef = useRef<{ barcode: string; count: number }>({ barcode: '', count: 0 });
  const scanStartTimeRef = useRef<number>(Date.now());

  // Apply contrast enhancement to canvas for difficult barcodes
  const enhanceContrast = useCallback((canvas: HTMLCanvasElement): void => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;

    // Convert to high-contrast grayscale
    for (let i = 0; i < data.length; i += 4) {
      // Grayscale using luminance formula
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

      // Apply threshold to create high-contrast black/white
      const bw = gray < 140 ? 0 : 255;

      data[i] = bw;     // R
      data[i + 1] = bw; // G
      data[i + 2] = bw; // B
    }

    ctx.putImageData(imageData, 0, 0);
  }, []);

  // Cleanup function
  const cleanup = useCallback(() => {
    console.log('[Scanner] Cleaning up...');
    scanningRef.current = false;
    isProcessingRef.current = false;

    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
      initTimeoutRef.current = null;
    }

    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = null;
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

  // Handle successful scan with debouncing
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
      consecutiveDetectionsRef.current = { barcode: '', count: 0 };
      return;
    }

    // DEBOUNCE: Require same barcode on consecutive frames
    if (consecutiveDetectionsRef.current.barcode === barcode) {
      consecutiveDetectionsRef.current.count++;
    } else {
      consecutiveDetectionsRef.current = { barcode, count: 1 };
      return;
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

    // Hide fallback options on successful scan
    setShowFallback(false);
    if (fallbackTimeoutRef.current) {
      clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = null;
    }

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
      // Reset fallback timer
      scanStartTimeRef.current = Date.now();
      fallbackTimeoutRef.current = setTimeout(() => setShowFallback(true), FALLBACK_SHOW_DELAY_MS);
    }, SUCCESS_OVERLAY_MS);
  }, [onScan]);

  // Toggle flashlight/torch
  const toggleTorch = useCallback(async () => {
    if (!streamRef.current) return;

    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;

    try {
      const capabilities = track.getCapabilities() as any;
      if (capabilities.torch) {
        await track.applyConstraints({ advanced: [{ torch: !torchOn } as any] });
        setTorchOn(!torchOn);
        console.log('[Scanner] Torch:', !torchOn ? 'ON' : 'OFF');
      }
    } catch (e) {
      console.error('[Scanner] Torch error:', e);
    }
  }, [torchOn]);

  // Read barcode from photo file
  const handlePhotoCapture = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !zxingReaderRef.current) return;

    setPhotoProcessing(true);
    console.log('[Scanner] Processing photo...');

    try {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      // Create canvas for processing
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Cannot get canvas context');

      // Helper to decode from image element
      const decodePhoto = async (): Promise<string | null> => {
        try {
          const result = await zxingReaderRef.current.decodeFromImageElement(img);
          return result ? result.getText() : null;
        } catch {
          return null;
        }
      };

      // Try raw image first
      let rawResult = await decodePhoto();
      if (rawResult) {
        console.log('[Scanner] Photo decode success (raw):', rawResult);
        isProcessingRef.current = true;
        lastScanTimeRef.current = Date.now();
        lastScannedBarcodeRef.current = rawResult;
        setStatus('cooldown');
        setShowFlash(true);
        setLastScannedDisplay(rawResult);
        onScan(rawResult);
        setTimeout(() => {
          setShowFlash(false);
          setStatus('scanning');
          isProcessingRef.current = false;
        }, SUCCESS_OVERLAY_MS);
        URL.revokeObjectURL(img.src);
        setPhotoProcessing(false);
        return;
      }

      console.log('[Scanner] Raw photo decode failed, trying enhanced...');

      // Try with contrast enhancement - draw to canvas, enhance, convert back to image
      ctx.drawImage(img, 0, 0);
      enhanceContrast(canvas);

      // Convert enhanced canvas to image
      const enhancedBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (enhancedBlob) {
        const enhancedUrl = URL.createObjectURL(enhancedBlob);
        const enhancedImg = new Image();
        enhancedImg.src = enhancedUrl;
        await new Promise((resolve) => { enhancedImg.onload = resolve; });

        try {
          const result = await zxingReaderRef.current.decodeFromImageElement(enhancedImg);
          if (result) {
            console.log('[Scanner] Photo decode success (enhanced):', result.getText());
            isProcessingRef.current = true;
            lastScanTimeRef.current = Date.now();
            lastScannedBarcodeRef.current = result.getText();
            setStatus('cooldown');
            setShowFlash(true);
            setLastScannedDisplay(result.getText());
            onScan(result.getText());
            setTimeout(() => {
              setShowFlash(false);
              setStatus('scanning');
              isProcessingRef.current = false;
            }, SUCCESS_OVERLAY_MS);
            URL.revokeObjectURL(enhancedUrl);
            URL.revokeObjectURL(img.src);
            setPhotoProcessing(false);
            return;
          }
        } catch (e) {
          console.log('[Scanner] Enhanced photo decode failed');
        }
        URL.revokeObjectURL(enhancedUrl);
      }

      // Both failed
      alert('Could not read barcode from photo. Try taking a clearer picture or enter the barcode manually.');
      URL.revokeObjectURL(img.src);
    } catch (err) {
      console.error('[Scanner] Photo processing error:', err);
      alert('Error processing photo. Please try again.');
    } finally {
      setPhotoProcessing(false);
      // Reset file input
      if (photoInputRef.current) {
        photoInputRef.current.value = '';
      }
    }
  }, [enhanceContrast, handleDetection, onScan]);

  // Native BarcodeDetector scanning loop with dual detection
  const startNativeScanning = useCallback(() => {
    if (!videoRef.current || !canvasRef.current || !processCanvasRef.current || !detectorRef.current) {
      console.log('[Scanner] Cannot start native scanning - missing refs');
      return;
    }

    const video = videoRef.current;
    const rawCanvas = canvasRef.current;
    const processCanvas = processCanvasRef.current;
    const rawCtx = rawCanvas.getContext('2d', { willReadFrequently: true });
    const processCtx = processCanvas.getContext('2d', { willReadFrequently: true });
    if (!rawCtx || !processCtx) return;

    scanningRef.current = true;
    console.log('[Scanner] Starting native scanning loop with dual detection');

    scanIntervalRef.current = setInterval(async () => {
      if (!scanningRef.current || isProcessingRef.current) return;
      if (!video.videoWidth || !video.videoHeight) return;

      // Set canvas dimensions
      rawCanvas.width = video.videoWidth;
      rawCanvas.height = video.videoHeight;
      processCanvas.width = video.videoWidth;
      processCanvas.height = video.videoHeight;

      // Draw raw frame
      rawCtx.drawImage(video, 0, 0);

      // Try 1: Raw detection (fast, works for good barcodes)
      try {
        const barcodes = await detectorRef.current!.detect(rawCanvas);
        if (barcodes.length > 0 && scanningRef.current) {
          handleDetection(barcodes[0].rawValue);
          return;
        }
      } catch (e) {
        // Continue to enhanced
      }

      // Try 2: Enhanced detection (slower, works for difficult barcodes)
      processCtx.drawImage(video, 0, 0);
      enhanceContrast(processCanvas);

      try {
        const barcodes = await detectorRef.current!.detect(processCanvas);
        if (barcodes.length > 0 && scanningRef.current) {
          console.log('[Scanner] Detected via enhanced processing');
          handleDetection(barcodes[0].rawValue);
        }
      } catch (e) {
        // Detection error - continue scanning
      }
    }, SCAN_INTERVAL_MS);
  }, [handleDetection, enhanceContrast]);

  // Initialize scanner
  useEffect(() => {
    let mounted = true;
    scanStartTimeRef.current = Date.now();

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

      // Start fallback timer
      fallbackTimeoutRef.current = setTimeout(() => {
        if (mounted) setShowFallback(true);
      }, FALLBACK_SHOW_DELAY_MS);

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

            // Check for torch capability
            const track = stream.getVideoTracks()[0];
            if (track) {
              const capabilities = track.getCapabilities() as any;
              if (capabilities.torch) {
                setTorchAvailable(true);
                console.log('[Scanner] Torch available');
              }
            }

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

      // Fallback to ZXing with enhanced settings
      console.log('[Scanner] Falling back to ZXing with enhanced settings');
      try {
        const { BrowserMultiFormatReader, DecodeHintType, BarcodeFormat } = await import('@zxing/library');

        if (!mounted) return;

        // Enhanced hints for difficult barcodes
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
        hints.set(DecodeHintType.CHARACTER_SET, 'UTF-8');
        // Note: ALSO_INVERTED not available in this version, using contrast enhancement instead

        const reader = new BrowserMultiFormatReader(hints);
        zxingReaderRef.current = reader;
        setScannerType('zxing');

        await new Promise(resolve => setTimeout(resolve, 100));

        const video = videoRef.current;
        if (!video || !mounted) return;

        console.log('[Scanner] Starting ZXing with enhanced detection...');

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

        // Use custom scanning with dual detection
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: deviceId ? { exact: deviceId } : undefined,
            facingMode: deviceId ? undefined : 'environment',
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 }
          },
          audio: false
        });

        if (!mounted) {
          stream.getTracks().forEach(t => t.stop());
          return;
        }

        streamRef.current = stream;

        // Check for torch capability
        const track = stream.getVideoTracks()[0];
        if (track) {
          const capabilities = track.getCapabilities() as any;
          if (capabilities.torch) {
            setTorchAvailable(true);
            console.log('[Scanner] Torch available');
          }
        }

        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('autoplay', 'true');
        video.setAttribute('muted', 'true');

        await new Promise<void>((resolve) => {
          video.onloadedmetadata = async () => {
            try {
              await video.play();
              resolve();
            } catch (e) {
              console.error('[Scanner] Video play error:', e);
              resolve();
            }
          };
        });

        // Start custom scanning loop with dual detection using luminance source
        const rawCanvas = canvasRef.current;
        const processCanvas = processCanvasRef.current;
        if (!rawCanvas || !processCanvas) return;

        scanningRef.current = true;

        // Helper to decode from canvas using HTMLCanvasElementLuminanceSource
        const decodeFromCanvasElement = async (canvas: HTMLCanvasElement) => {
          // Convert canvas to image element for decoding
          return new Promise<string | null>((resolve) => {
            canvas.toBlob(async (blob) => {
              if (!blob) { resolve(null); return; }
              const url = URL.createObjectURL(blob);
              const img = new Image();
              img.onload = async () => {
                try {
                  const result = await reader.decodeFromImageElement(img);
                  URL.revokeObjectURL(url);
                  resolve(result ? result.getText() : null);
                } catch {
                  URL.revokeObjectURL(url);
                  resolve(null);
                }
              };
              img.onerror = () => {
                URL.revokeObjectURL(url);
                resolve(null);
              };
              img.src = url;
            }, 'image/jpeg', 0.9);
          });
        };

        scanIntervalRef.current = setInterval(async () => {
          if (!scanningRef.current || isProcessingRef.current) return;
          if (!video.videoWidth || !video.videoHeight) return;

          rawCanvas.width = video.videoWidth;
          rawCanvas.height = video.videoHeight;

          const rawCtx = rawCanvas.getContext('2d', { willReadFrequently: true });
          if (!rawCtx) return;

          // Draw raw frame
          rawCtx.drawImage(video, 0, 0);

          // Try 1: Raw detection
          const rawResult = await decodeFromCanvasElement(rawCanvas);
          if (rawResult && scanningRef.current) {
            handleDetection(rawResult);
            return;
          }

          // Try 2: Enhanced detection with contrast
          processCanvas.width = video.videoWidth;
          processCanvas.height = video.videoHeight;
          const processCtx = processCanvas.getContext('2d', { willReadFrequently: true });
          if (!processCtx) return;

          processCtx.drawImage(video, 0, 0);
          enhanceContrast(processCanvas);

          const enhancedResult = await decodeFromCanvasElement(processCanvas);
          if (enhancedResult && scanningRef.current) {
            console.log('[Scanner] ZXing detected via enhanced processing');
            handleDetection(enhancedResult);
          }
        }, SCAN_INTERVAL_MS);

        if (mounted) {
          if (initTimeoutRef.current) {
            clearTimeout(initTimeoutRef.current);
            initTimeoutRef.current = null;
          }
          setStatus('scanning');
          console.log('[Scanner] ZXing started with dual detection');
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
  }, [cleanup, handleDetection, startNativeScanning, enhanceContrast, status]);

  // Manual barcode submission
  const handleManualSubmit = () => {
    const barcode = manualBarcode.trim();
    if (barcode.length >= 6) {
      lastScannedBarcodeRef.current = barcode;
      lastScanTimeRef.current = Date.now();
      setShowFallback(false);
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
    minHeight: 'calc(100vh - 280px)',
    maxHeight: 'calc(100vh - 200px)',
    display: 'flex',
    flexDirection: 'column',
  };

  return (
    <div style={containerStyle}>
      {/* Camera View */}
      <div style={{ flex: 1, position: 'relative', minHeight: fullScreen ? 0 : '300px', overflow: 'hidden' }}>
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
        <canvas ref={processCanvasRef} style={{ display: 'none' }} />

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

        {/* Scanning overlay with controls */}
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
                Hold steady • Works with difficult barcodes
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

            {/* Torch button */}
            {torchAvailable && (
              <button
                onClick={toggleTorch}
                style={{
                  position: 'absolute',
                  top: '16px',
                  left: '16px',
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  background: torchOn ? '#fbbf24' : 'rgba(0,0,0,0.5)',
                  border: 'none',
                  color: torchOn ? '#000' : '#fff',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18h6" />
                  <path d="M10 22h4" />
                  <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
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

      {/* Fallback Options (shown after 6 seconds) */}
      {showFallback && !showFlash && (status === 'scanning' || status === 'cooldown') && (
        <div style={{
          padding: '12px 16px',
          background: '#fef3c7',
          borderTop: '1px solid #f59e0b',
        }}>
          <div style={{ fontSize: '14px', fontWeight: 600, color: '#92400e', marginBottom: '8px', textAlign: 'center' }}>
            Having trouble? Try these options:
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoCapture}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => photoInputRef.current?.click()}
              disabled={photoProcessing}
              style={{
                flex: 1,
                padding: '12px',
                background: '#f59e0b',
                color: '#000',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: photoProcessing ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              {photoProcessing ? 'Processing...' : 'Take Photo'}
            </button>
            {torchAvailable && !torchOn && (
              <button
                onClick={toggleTorch}
                style={{
                  padding: '12px 16px',
                  background: '#374151',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18h6" />
                  <path d="M10 22h4" />
                  <path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
                </svg>
                Light
              </button>
            )}
          </div>
        </div>
      )}

      {/* Manual Entry Section - More prominent */}
      <div style={{
        padding: '16px',
        background: fullScreen ? 'rgba(0,0,0,0.9)' : '#1a1a2e',
      }}>
        <div style={{ marginBottom: '10px', color: '#fff', fontSize: '14px', fontWeight: 600, textAlign: 'center' }}>
          Enter barcode manually
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            placeholder="Type numbers from barcode..."
            value={manualBarcode}
            onChange={(e) => setManualBarcode(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleManualSubmit()}
            style={{
              flex: 1,
              padding: '16px 18px',
              fontSize: '18px',
              border: '2px solid #4b5563',
              borderRadius: '12px',
              background: '#1f2937',
              color: '#fff',
              outline: 'none',
              fontFamily: 'monospace',
            }}
          />
          <button
            onClick={handleManualSubmit}
            disabled={manualBarcode.trim().length < 6}
            style={{
              padding: '16px 28px',
              background: manualBarcode.trim().length >= 6 ? '#FF580F' : '#374151',
              color: '#fff',
              border: 'none',
              borderRadius: '12px',
              fontWeight: 700,
              fontSize: '16px',
              cursor: manualBarcode.trim().length >= 6 ? 'pointer' : 'not-allowed',
            }}
          >
            Add
          </button>
        </div>
        <div style={{ marginTop: '8px', color: '#6b7280', fontSize: '12px', textAlign: 'center' }}>
          Look for numbers below the barcode lines (e.g., 071817040282)
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
