'use client';

import { useState } from 'react';
import { AdminShell } from '../../components/AdminShell';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { BarcodeLookup } from '../components/BarcodeLookup';
import styles from '../inventory.module.css';

export default function TestScanPage() {
  const [scannedBarcode, setScannedBarcode] = useState<string | null>(null);
  const [lookupComplete, setLookupComplete] = useState(false);
  const [lastResult, setLastResult] = useState<{ found: boolean; source: string } | null>(null);

  function handleScan(barcode: string) {
    setScannedBarcode(barcode);
    setLookupComplete(false);
    setLastResult(null);
  }

  function handleLookupResult(result: { found: boolean; source: string }) {
    setLookupComplete(true);
    setLastResult(result);
  }

  function handleReset() {
    setScannedBarcode(null);
    setLookupComplete(false);
    setLastResult(null);
  }

  return (
    <AdminShell title="Test Scanner">
      <div className={styles.inventoryPage}>
        <div className={styles.testPage}>
          <div className={styles.testCard}>
            <div className={styles.testHeader}>
              <h2 className={styles.testTitle}>Barcode Scanner Test</h2>
              <p className={styles.testSubtitle}>
                Test the barcode scanner and product lookup
              </p>
            </div>

            <div className={styles.testBody}>
              {!scannedBarcode ? (
                <BarcodeScanner onScan={handleScan} />
              ) : (
                <>
                  {/* Scanned Result */}
                  <div style={{
                    background: '#dcfce7',
                    padding: '16px',
                    borderRadius: '12px',
                    marginBottom: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px'
                  }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <div>
                      <div style={{ fontWeight: 600, color: '#16a34a' }}>Barcode Scanned!</div>
                      <div style={{ fontFamily: 'monospace', fontSize: '18px', color: '#111827' }}>
                        {scannedBarcode}
                      </div>
                    </div>
                  </div>

                  {/* Lookup Component */}
                  <BarcodeLookup
                    barcode={scannedBarcode}
                    onResult={handleLookupResult}
                  />
                </>
              )}
            </div>

            {scannedBarcode && (
              <div className={styles.testFooter}>
                <button className={styles.btnSecondary} onClick={handleReset} style={{ width: '100%' }}>
                  Scan Another Barcode
                </button>
              </div>
            )}
          </div>

          {/* Debug Info */}
          {lastResult && (
            <div style={{
              marginTop: '20px',
              padding: '16px',
              background: '#f3f4f6',
              borderRadius: '12px',
              fontSize: '13px',
              fontFamily: 'monospace'
            }}>
              <div style={{ fontWeight: 600, marginBottom: '8px' }}>Debug Info</div>
              <div>Barcode: {scannedBarcode}</div>
              <div>Found in DB: {lastResult.found ? 'Yes' : 'No'}</div>
              <div>Source: {lastResult.source}</div>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
