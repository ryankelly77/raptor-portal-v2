'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '../../components/AdminShell';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { BarcodeLookup } from '../components/BarcodeLookup';
import { adminFetch, ApiError, AuthError } from '@/lib/admin-fetch';
import styles from '../inventory.module.css';

// Build version for debugging
const BUILD_VERSION = 'v2024-MAR01-F';

interface ErrorInfo {
  message: string;
  endpoint: string;
  status: number;
}

interface ScannedItem {
  barcode: string;
  name: string;
  brand: string | null;
  category: string;
  quantity: number;
  unitCost: string;
  productId?: string;
  isNew?: boolean;
  image_url?: string | null;
}

interface OCRItem {
  text: string;
  price: number | null;
}

export default function ReceiveItemsPage() {
  const router = useRouter();

  // Flow state
  const [step, setStep] = useState<'scan' | 'receipt' | 'review'>('scan');

  // Scanned items
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [currentBarcode, setCurrentBarcode] = useState<string | null>(null);

  // Receipt data
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrItems, setOcrItems] = useState<OCRItem[]>([]);
  const [storeName, setStoreName] = useState("Sam's");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [purchasedBy, setPurchasedBy] = useState('Cristian Kelly');

  // Final state
  const [receiptTotal, setReceiptTotal] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle barcode scan
  const handleScan = (barcode: string) => {
    console.log('[Receive] Scanned barcode:', barcode);

    // Check if already in list
    const existing = items.find(i => i.barcode === barcode);
    if (existing) {
      setItems(items.map(i =>
        i.barcode === barcode ? { ...i, quantity: i.quantity + 1 } : i
      ));
      // Don't show lookup - just increment
    } else {
      // Show lookup for new barcode
      setCurrentBarcode(barcode);
    }
  };

  // Handle lookup result
  const handleLookupResult = (result: any) => {
    console.log('[Receive] Lookup result:', result);
    const newItem: ScannedItem = {
      barcode: result.product.barcode,
      name: result.product.name,
      brand: result.product.brand,
      category: result.product.category,
      quantity: 1,
      unitCost: '',
      productId: result.existingProduct?.id,
      isNew: !result.found,
      image_url: result.product.image_url,
    };
    setItems([...items, newItem]);
    setCurrentBarcode(null); // Back to scanning
  };

  // Update item quantity
  const updateQuantity = (barcode: string, delta: number) => {
    setItems(items.map(item => {
      if (item.barcode === barcode) {
        const newQty = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  // Update item price
  const updatePrice = (barcode: string, price: string) => {
    setItems(items.map(item =>
      item.barcode === barcode ? { ...item, unitCost: price } : item
    ));
  };

  // Remove item
  const removeItem = (barcode: string) => {
    setItems(items.filter(i => i.barcode !== barcode));
  };

  // Handle receipt photo capture
  const handleReceiptCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setReceiptUploading(true);
    setError(null);

    try {
      // Create preview immediately
      const reader = new FileReader();
      reader.onload = (ev) => {
        setReceiptImage(ev.target?.result as string);
      };
      reader.readAsDataURL(file);

      // Upload to Supabase via admin API
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'receipts');

      console.log('[Receive] Uploading receipt...');

      const uploadRes = await adminFetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
      });
      const uploadData = await uploadRes.json();

      console.log('[Receive] Upload response:', uploadRes.status, uploadData);

      if (!uploadRes.ok) {
        throw new Error(uploadData.error || `Upload failed (${uploadRes.status})`);
      }

      if (!uploadData.url) {
        throw new Error(uploadData.error || 'Upload failed - no URL returned');
      }

      console.log('[Receive] Receipt uploaded:', uploadData.url);
      setReceiptImage(uploadData.url);

      // Run OCR with Tesseract
      setOcrProcessing(true);
      try {
        const Tesseract = (await import('tesseract.js')).default;
        const result = await Tesseract.recognize(file, 'eng', {
          logger: (m) => console.log('[OCR]', m.status, m.progress),
        });

        console.log('[OCR] Result:', result.data.text);

        // Parse OCR text for prices
        const lines = result.data.text.split('\n');
        const parsedItems: OCRItem[] = [];

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          // Look for price patterns ($X.XX or X.XX at end of line)
          const priceMatch = trimmed.match(/\$?(\d+\.\d{2})\s*$/);
          if (priceMatch) {
            const price = parseFloat(priceMatch[1]);
            const text = trimmed.replace(priceMatch[0], '').trim();
            if (text && price > 0 && price < 1000) {
              parsedItems.push({ text, price });
            }
          }
        }

        setOcrItems(parsedItems);
        console.log('[OCR] Parsed items:', parsedItems);

        // Try to match OCR items to scanned items
        const updatedItems = items.map(item => {
          const itemWords = (item.name + ' ' + (item.brand || '')).toLowerCase().split(/\s+/);

          for (const ocrItem of parsedItems) {
            const ocrWords = ocrItem.text.toLowerCase().split(/\s+/);
            // Check if any significant word matches
            const matches = itemWords.filter(w => w.length > 3 && ocrWords.some(ow => ow.includes(w) || w.includes(ow)));
            if (matches.length > 0 && ocrItem.price) {
              return { ...item, unitCost: ocrItem.price.toFixed(2) };
            }
          }
          return item;
        });
        setItems(updatedItems);

        // Extract total if found
        const totalMatch = result.data.text.match(/total[:\s]*\$?(\d+\.\d{2})/i);
        if (totalMatch) {
          setReceiptTotal(totalMatch[1]);
        }

      } catch (ocrErr) {
        console.error('[OCR] Error:', ocrErr);
        // OCR failed but upload succeeded - continue anyway
      } finally {
        setOcrProcessing(false);
      }

    } catch (err: unknown) {
      console.error('[Receive] Receipt error:', err);
      // Show ALL errors visibly - DO NOT REDIRECT
      if (err instanceof ApiError || err instanceof AuthError) {
        setError({
          message: err.message,
          endpoint: err.endpoint,
          status: err.status,
        });
      } else if (err instanceof Error) {
        setError({
          message: err.message,
          endpoint: '/api/admin/upload',
          status: 0,
        });
      } else {
        setError({
          message: 'Unknown error during receipt upload',
          endpoint: '/api/admin/upload',
          status: 0,
        });
      }
    } finally {
      setReceiptUploading(false);
    }
  };

  // Calculate total from items
  const calculatedTotal = items.reduce((sum, item) => {
    const price = parseFloat(item.unitCost) || 0;
    return sum + (price * item.quantity);
  }, 0);

  // Save everything
  const handleSave = async () => {
    if (items.length === 0) {
      setError({ message: 'No items to save', endpoint: 'validation', status: 0 });
      return;
    }

    setSaving(true);
    setError(null);

    try {
      console.log('[Save] Creating purchase record...');

      // 1. Create purchase record
      const purchaseRes = await adminFetch('/api/admin/crud', {
        method: 'POST',
        body: JSON.stringify({
          table: 'inventory_purchases',
          action: 'create',
          data: {
            purchased_by: purchasedBy,
            store_name: storeName,
            purchase_date: purchaseDate,
            receipt_image_url: receiptImage,
            receipt_total: parseFloat(receiptTotal) || calculatedTotal,
            status: 'verified',
          },
        }),
      });

      const purchaseData = await purchaseRes.json();
      console.log('[Save] Purchase response:', purchaseRes.status, purchaseData);

      if (!purchaseRes.ok || !purchaseData.data?.id) {
        throw new Error(purchaseData.error || 'Failed to create purchase record');
      }

      const purchaseId = purchaseData.data.id;
      console.log('[Receive] Created purchase:', purchaseId);

      // 2. Process each item
      for (const item of items) {
        let productId = item.productId;

        // Create new product if needed
        if (!productId) {
          const prodRes = await adminFetch('/api/admin/crud', {
            method: 'POST',
            body: JSON.stringify({
              table: 'products',
              action: 'create',
              data: {
                barcode: item.barcode,
                name: item.name,
                brand: item.brand,
                category: item.category,
                default_price: item.unitCost ? parseFloat(item.unitCost) : null,
                image_url: item.image_url,
              },
            }),
          });
          const prodData = await prodRes.json();
          productId = prodData.data?.id;

          if (!productId) {
            console.error('[Receive] Failed to create product:', item.barcode);
            continue;
          }
        }

        // Create purchase item
        await adminFetch('/api/admin/crud', {
          method: 'POST',
          body: JSON.stringify({
            table: 'inventory_purchase_items',
            action: 'create',
            data: {
              purchase_id: purchaseId,
              product_id: productId,
              quantity: item.quantity,
              unit_cost: item.unitCost ? parseFloat(item.unitCost) : null,
            },
          }),
        });

        // Create inventory movement
        await adminFetch('/api/admin/crud', {
          method: 'POST',
          body: JSON.stringify({
            table: 'inventory_movements',
            action: 'create',
            data: {
              product_id: productId,
              quantity: item.quantity,
              movement_type: 'purchase_in',
              moved_by: purchasedBy,
              notes: `Received from ${storeName}`,
            },
          }),
        });
      }

      console.log('[Receive] All items saved successfully');
      alert('Purchase saved successfully!');
      router.push('/admin/inventory');

    } catch (err: unknown) {
      console.error('[Receive] Save error:', err);
      // Show ALL errors visibly - DO NOT REDIRECT, DO NOT CLEAR STATE
      if (err instanceof ApiError || err instanceof AuthError) {
        setError({
          message: err.message,
          endpoint: err.endpoint,
          status: err.status,
        });
      } else if (err instanceof Error) {
        setError({
          message: err.message,
          endpoint: '/api/admin/crud',
          status: 0,
        });
      } else {
        setError({
          message: 'Unknown error during save',
          endpoint: '/api/admin/crud',
          status: 0,
        });
      }
      // Items remain in state - nothing is lost
    } finally {
      setSaving(false);
    }
  };

  const totalItemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <AdminShell title="Receive Items">
      <div className={styles.inventoryPage}>
        {/* Build version */}
        <div style={{ background: '#dbeafe', color: '#1e40af', padding: '6px 12px', borderRadius: '6px', marginBottom: '12px', fontSize: '11px', fontFamily: 'monospace' }}>
          {BUILD_VERSION} | Step: {step} | Items: {totalItemCount}
        </div>

        {/* Error display - VISIBLE BANNER */}
        {error && (
          <div style={{
            background: '#fef2f2',
            border: '2px solid #dc2626',
            color: '#dc2626',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '16px',
            fontFamily: 'monospace',
            fontSize: '13px',
          }}>
            <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '8px' }}>
              ERROR
            </div>
            <div><strong>Message:</strong> {error.message}</div>
            <div><strong>Endpoint:</strong> {error.endpoint}</div>
            <div><strong>Status:</strong> {error.status}</div>
            <button
              onClick={() => setError(null)}
              style={{
                marginTop: '12px',
                padding: '8px 16px',
                background: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          </div>
        )}

        {/* STEP 1: SCAN ITEMS */}
        {step === 'scan' && (
          <div>
            {currentBarcode ? (
              // Show lookup for current barcode
              <BarcodeLookup barcode={currentBarcode} onResult={handleLookupResult} />
            ) : (
              // Show scanner
              <BarcodeScanner onScan={handleScan} />
            )}

            {/* Scanned items list */}
            {items.length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>
                  Scanned Items ({totalItemCount})
                </h3>
                {items.map((item) => (
                  <div key={item.barcode} style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    background: item.isNew ? '#fefce8' : '#f9fafb',
                    borderRadius: '10px',
                    marginBottom: '8px',
                    border: item.isNew ? '1px solid #facc15' : '1px solid #e5e7eb',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {item.brand && (
                        <div style={{ fontWeight: 700, fontSize: '11px', color: '#FF580F', textTransform: 'uppercase' }}>{item.brand}</div>
                      )}
                      <div style={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>{item.barcode}</div>
                    </div>

                    {/* Quantity controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button onClick={() => updateQuantity(item.barcode, -1)} style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: '18px' }}>-</button>
                      <span style={{ fontWeight: 600, minWidth: '24px', textAlign: 'center' }}>{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.barcode, 1)} style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: '18px' }}>+</button>
                    </div>

                    {/* Remove button */}
                    <button onClick={() => removeItem(item.barcode)} style={{ color: '#dc2626', background: 'none', border: 'none', padding: '8px', cursor: 'pointer' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}

                {/* Continue button */}
                <button
                  onClick={() => setStep('receipt')}
                  style={{
                    width: '100%',
                    marginTop: '16px',
                    padding: '16px',
                    background: '#FF580F',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '16px',
                    cursor: 'pointer',
                  }}
                >
                  Continue to Receipt ({totalItemCount} items)
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: CAPTURE RECEIPT */}
        {step === 'receipt' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>Capture Receipt</h2>

            {/* Receipt image or capture button */}
            {receiptImage ? (
              <div style={{ marginBottom: '16px' }}>
                <img src={receiptImage} alt="Receipt" style={{ width: '100%', maxHeight: '300px', objectFit: 'contain', borderRadius: '12px', border: '1px solid #e5e7eb' }} />
                <button onClick={() => { setReceiptImage(null); fileInputRef.current?.click(); }} style={{ width: '100%', marginTop: '8px', padding: '10px', background: '#f3f4f6', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                  Retake Photo
                </button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', background: '#f9fafb', borderRadius: '12px', border: '2px dashed #d1d5db', marginBottom: '16px' }}>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleReceiptCapture}
                  style={{ display: 'none' }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={receiptUploading}
                  style={{
                    padding: '16px 32px',
                    background: '#FF580F',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '16px',
                    cursor: receiptUploading ? 'wait' : 'pointer',
                  }}
                >
                  {receiptUploading ? 'Uploading...' : 'Take Receipt Photo'}
                </button>
              </div>
            )}

            {/* OCR status */}
            {ocrProcessing && (
              <div style={{ padding: '16px', background: '#dbeafe', borderRadius: '8px', marginBottom: '16px', textAlign: 'center' }}>
                <div className={styles.spinner} style={{ margin: '0 auto 8px' }} />
                Reading receipt...
              </div>
            )}

            {/* Store info */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>Store</label>
              <select
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                className={styles.formSelect}
              >
                <option value="Sam's">Sam&apos;s Club</option>
                <option value="Costco">Costco</option>
                <option value="Walmart">Walmart</option>
                <option value="Amazon">Amazon</option>
                <option value="HEB">HEB</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>Purchase Date</label>
              <input
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
                className={styles.formInput}
              />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>Purchased By</label>
              <select
                value={purchasedBy}
                onChange={(e) => setPurchasedBy(e.target.value)}
                className={styles.formSelect}
              >
                <option value="Cristian Kelly">Cristian Kelly</option>
                <option value="Ryan Kelly">Ryan Kelly</option>
              </select>
            </div>

            {/* Navigation */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setStep('scan')} style={{ flex: 1, padding: '14px', background: '#f3f4f6', border: 'none', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' }}>
                Back
              </button>
              <button onClick={() => setStep('review')} style={{ flex: 1, padding: '14px', background: '#FF580F', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>
                Review & Submit
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: REVIEW & SUBMIT */}
        {step === 'review' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>Review Purchase</h2>

            {/* Summary */}
            <div style={{ padding: '12px', background: '#f3f4f6', borderRadius: '8px', marginBottom: '16px' }}>
              <div><strong>Store:</strong> {storeName}</div>
              <div><strong>Date:</strong> {purchaseDate}</div>
              <div><strong>By:</strong> {purchasedBy}</div>
            </div>

            {/* Items with editable prices */}
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Items ({totalItemCount})</h3>
            {items.map((item) => (
              <div key={item.barcode} style={{
                padding: '12px',
                background: '#f9fafb',
                borderRadius: '10px',
                marginBottom: '8px',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <div>
                    {item.brand && <div style={{ fontWeight: 700, fontSize: '11px', color: '#FF580F', textTransform: 'uppercase' }}>{item.brand}</div>}
                    <div style={{ fontWeight: 600 }}>{item.name}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>Qty: {item.quantity}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span>$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={item.unitCost}
                    onChange={(e) => updatePrice(item.barcode, e.target.value)}
                    placeholder="0.00"
                    className={styles.formInput}
                    style={{ flex: 1 }}
                  />
                  <span style={{ color: '#6b7280', fontSize: '13px' }}>each</span>
                </div>
              </div>
            ))}

            {/* Receipt total */}
            <div style={{ marginTop: '16px', marginBottom: '16px' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>Receipt Total</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>$</span>
                <input
                  type="number"
                  step="0.01"
                  value={receiptTotal}
                  onChange={(e) => setReceiptTotal(e.target.value)}
                  placeholder={calculatedTotal.toFixed(2)}
                  className={styles.formInput}
                  style={{ fontSize: '24px', fontWeight: 700, textAlign: 'right' }}
                />
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                Calculated from items: ${calculatedTotal.toFixed(2)}
              </div>
            </div>

            {/* Receipt thumbnail */}
            {receiptImage && (
              <div style={{ marginBottom: '16px' }}>
                <img src={receiptImage} alt="Receipt" style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e5e7eb' }} />
              </div>
            )}

            {/* Navigation */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setStep('receipt')} style={{ flex: 1, padding: '14px', background: '#f3f4f6', border: 'none', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' }}>
                Back
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  flex: 2,
                  padding: '16px',
                  background: saving ? '#d1d5db' : '#22c55e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '16px',
                  cursor: saving ? 'wait' : 'pointer',
                }}
              >
                {saving ? 'Saving...' : 'Submit Purchase'}
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
