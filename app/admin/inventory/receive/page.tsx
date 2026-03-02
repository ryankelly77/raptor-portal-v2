'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '../../components/AdminShell';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { BarcodeLookup } from '../components/BarcodeLookup';
import { adminFetch, ApiError, AuthError } from '@/lib/admin-fetch';
import styles from '../inventory.module.css';

// Build version for debugging
const BUILD_VERSION = 'v2024-MAR01-G';

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
  matchConfidence?: 'high' | 'medium' | 'none';
  matchedOcrIndex?: number;
}

interface OCRItem {
  name: string;
  quantity: number;
  unitPrice: number | null;
  totalPrice: number | null;
  matched?: boolean;
  matchedBarcode?: string;
}

interface OCRData {
  storeName: string | null;
  date: string | null;
  subtotal: number | null;
  tax: number | null;
  total: number | null;
  items: OCRItem[];
}

// Fuzzy matching: calculate word overlap score
function fuzzyMatch(scannedName: string, scannedBrand: string | null, ocrName: string): number {
  const scannedWords = ((scannedBrand || '') + ' ' + scannedName)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2);

  const ocrWords = ocrName
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2);

  if (scannedWords.length === 0 || ocrWords.length === 0) return 0;

  let matchCount = 0;
  for (const sw of scannedWords) {
    for (const ow of ocrWords) {
      // Check for substring match (handles abbreviations like "BLK" vs "BLACK")
      if (sw.includes(ow) || ow.includes(sw) || sw === ow) {
        matchCount++;
        break;
      }
    }
  }

  return matchCount / Math.max(scannedWords.length, ocrWords.length);
}

export default function ReceiveItemsPage() {
  const router = useRouter();

  // Flow state: scan → receipt → reconcile → submit
  const [step, setStep] = useState<'scan' | 'receipt' | 'reconcile' | 'submit'>('scan');

  // Scanned items
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [currentBarcode, setCurrentBarcode] = useState<string | null>(null);

  // Receipt data
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [ocrProcessing, setOcrProcessing] = useState(false);
  const [ocrData, setOcrData] = useState<OCRData | null>(null);
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

    const existing = items.find(i => i.barcode === barcode);
    if (existing) {
      setItems(items.map(i =>
        i.barcode === barcode ? { ...i, quantity: i.quantity + 1 } : i
      ));
    } else {
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
      matchConfidence: 'none',
    };
    setItems([...items, newItem]);
    setCurrentBarcode(null);
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

  // Handle receipt photo capture and OCR
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

      // Upload to Supabase
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'receipts');

      console.log('[Receive] Uploading receipt...');

      const uploadRes = await adminFetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
      });
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok || !uploadData.url) {
        throw new Error(uploadData.error || 'Upload failed');
      }

      const imageUrl = uploadData.url;
      console.log('[Receive] Receipt uploaded:', imageUrl);
      setReceiptImage(imageUrl);

      // Run server-side OCR with GPT-4o
      setOcrProcessing(true);
      setReceiptUploading(false);

      console.log('[Receive] Running OCR...');
      const ocrRes = await adminFetch('/api/admin/receipt-ocr', {
        method: 'POST',
        body: JSON.stringify({ imageUrl }),
      });
      const ocrResult = await ocrRes.json();

      if (!ocrRes.ok) {
        console.error('[OCR] Failed:', ocrResult);
        // Continue without OCR data
        setOcrData(null);
      } else if (ocrResult.data) {
        console.log('[OCR] Success:', ocrResult.data);
        setOcrData(ocrResult.data);

        // Auto-fill store name and date if extracted
        if (ocrResult.data.storeName) {
          const storeNameLower = ocrResult.data.storeName.toLowerCase();
          if (storeNameLower.includes('sam')) setStoreName("Sam's");
          else if (storeNameLower.includes('costco')) setStoreName('Costco');
          else if (storeNameLower.includes('walmart')) setStoreName('Walmart');
          else if (storeNameLower.includes('amazon')) setStoreName('Amazon');
          else if (storeNameLower.includes('heb') || storeNameLower.includes('h-e-b')) setStoreName('HEB');
        }
        if (ocrResult.data.date) {
          setPurchaseDate(ocrResult.data.date);
        }
        if (ocrResult.data.total) {
          setReceiptTotal(ocrResult.data.total.toFixed(2));
        }
      }

    } catch (err: unknown) {
      console.error('[Receive] Receipt error:', err);
      if (err instanceof ApiError || err instanceof AuthError) {
        setError({ message: err.message, endpoint: err.endpoint, status: err.status });
      } else if (err instanceof Error) {
        setError({ message: err.message, endpoint: '/api/admin/upload', status: 0 });
      } else {
        setError({ message: 'Unknown error', endpoint: '/api/admin/upload', status: 0 });
      }
    } finally {
      setReceiptUploading(false);
      setOcrProcessing(false);
    }
  };

  // Run reconciliation: match OCR items to scanned items
  const runReconciliation = () => {
    if (!ocrData || !ocrData.items.length) {
      // No OCR data, go directly to submit
      setStep('submit');
      return;
    }

    const ocrItems = [...ocrData.items].map(item => ({ ...item, matched: false }));
    const updatedItems: ScannedItem[] = items.map(item => ({ ...item, matchConfidence: 'none', matchedOcrIndex: undefined }));

    // For each scanned item, find best matching OCR item
    for (let i = 0; i < updatedItems.length; i++) {
      const scannedItem = updatedItems[i];
      let bestMatch = -1;
      let bestScore = 0;

      for (let j = 0; j < ocrItems.length; j++) {
        if (ocrItems[j].matched) continue;

        const score = fuzzyMatch(scannedItem.name, scannedItem.brand, ocrItems[j].name);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = j;
        }
      }

      if (bestMatch >= 0 && bestScore > 0.3) {
        const ocrItem = ocrItems[bestMatch];
        ocrItem.matched = true;
        ocrItem.matchedBarcode = scannedItem.barcode;

        updatedItems[i] = {
          ...scannedItem,
          unitCost: ocrItem.unitPrice?.toFixed(2) || ocrItem.totalPrice?.toFixed(2) || '',
          matchConfidence: (bestScore > 0.6 ? 'high' : 'medium') as 'high' | 'medium' | 'none',
          matchedOcrIndex: bestMatch,
        };
      }
    }

    setItems(updatedItems);
    setOcrData({ ...ocrData, items: ocrItems });
    setStep('reconcile');
  };

  // Calculate totals
  const calculatedTotal = items.reduce((sum, item) => {
    const price = parseFloat(item.unitCost) || 0;
    return sum + (price * item.quantity);
  }, 0);

  const receiptTotalNum = parseFloat(receiptTotal) || 0;
  const difference = Math.abs(receiptTotalNum - calculatedTotal);

  // Get unmatched OCR items
  const unmatchedOcrItems = ocrData?.items.filter(item => !item.matched) || [];

  // Get unpriced scanned items
  const unpricedItems = items.filter(item => !item.unitCost);

  // Save everything
  const handleSave = async () => {
    if (items.length === 0) {
      setError({ message: 'No items to save', endpoint: 'validation', status: 0 });
      return;
    }

    setSaving(true);
    setError(null);

    try {
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
            receipt_total: receiptTotalNum || calculatedTotal,
            status: 'verified',
          },
        }),
      });

      const purchaseData = await purchaseRes.json();
      if (!purchaseRes.ok || !purchaseData.data?.id) {
        throw new Error(purchaseData.error || 'Failed to create purchase record');
      }

      const purchaseId = purchaseData.data.id;

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
          if (!productId) continue;
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

      alert('Purchase saved successfully!');
      router.push('/admin/inventory');

    } catch (err: unknown) {
      console.error('[Receive] Save error:', err);
      if (err instanceof ApiError || err instanceof AuthError) {
        setError({ message: err.message, endpoint: err.endpoint, status: err.status });
      } else if (err instanceof Error) {
        setError({ message: err.message, endpoint: '/api/admin/crud', status: 0 });
      } else {
        setError({ message: 'Unknown error', endpoint: '/api/admin/crud', status: 0 });
      }
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

        {/* Error display */}
        {error && (
          <div style={{ background: '#fef2f2', border: '2px solid #dc2626', color: '#dc2626', padding: '16px', borderRadius: '8px', marginBottom: '16px', fontFamily: 'monospace', fontSize: '13px' }}>
            <div style={{ fontWeight: 700, fontSize: '16px', marginBottom: '8px' }}>ERROR</div>
            <div><strong>Message:</strong> {error.message}</div>
            <div><strong>Endpoint:</strong> {error.endpoint}</div>
            <div><strong>Status:</strong> {error.status}</div>
            <button onClick={() => setError(null)} style={{ marginTop: '12px', padding: '8px 16px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>Dismiss</button>
          </div>
        )}

        {/* STEP 1: SCAN ITEMS */}
        {step === 'scan' && (
          <div>
            {currentBarcode ? (
              <BarcodeLookup barcode={currentBarcode} onResult={handleLookupResult} />
            ) : (
              <BarcodeScanner onScan={handleScan} />
            )}

            {items.length > 0 && (
              <div style={{ marginTop: '20px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Scanned Items ({totalItemCount})</h3>
                {items.map((item) => (
                  <div key={item.barcode} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', background: item.isNew ? '#fefce8' : '#f9fafb', borderRadius: '10px', marginBottom: '8px', border: item.isNew ? '1px solid #facc15' : '1px solid #e5e7eb' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {item.brand && <div style={{ fontWeight: 700, fontSize: '11px', color: '#FF580F', textTransform: 'uppercase' }}>{item.brand}</div>}
                      <div style={{ fontWeight: 600, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                      <div style={{ fontSize: '11px', color: '#6b7280' }}>{item.barcode}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <button onClick={() => updateQuantity(item.barcode, -1)} style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: '18px' }}>-</button>
                      <span style={{ fontWeight: 600, minWidth: '24px', textAlign: 'center' }}>{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.barcode, 1)} style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: '18px' }}>+</button>
                    </div>
                    <button onClick={() => removeItem(item.barcode)} style={{ color: '#dc2626', background: 'none', border: 'none', padding: '8px', cursor: 'pointer' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                ))}
                <button onClick={() => setStep('receipt')} style={{ width: '100%', marginTop: '16px', padding: '16px', background: '#FF580F', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '16px', cursor: 'pointer' }}>
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

            {receiptImage ? (
              <div style={{ marginBottom: '16px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={receiptImage} alt="Receipt" style={{ width: '100%', maxHeight: '300px', objectFit: 'contain', borderRadius: '12px', border: '1px solid #e5e7eb' }} />
                <button onClick={() => { setReceiptImage(null); setOcrData(null); fileInputRef.current?.click(); }} style={{ width: '100%', marginTop: '8px', padding: '10px', background: '#f3f4f6', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                  Retake Photo
                </button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', background: '#f9fafb', borderRadius: '12px', border: '2px dashed #d1d5db', marginBottom: '16px' }}>
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleReceiptCapture} style={{ display: 'none' }} />
                <button onClick={() => fileInputRef.current?.click()} disabled={receiptUploading || ocrProcessing} style={{ padding: '16px 32px', background: '#FF580F', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '16px', cursor: (receiptUploading || ocrProcessing) ? 'wait' : 'pointer' }}>
                  {receiptUploading ? 'Uploading...' : ocrProcessing ? 'Processing...' : 'Take Receipt Photo'}
                </button>
              </div>
            )}

            {ocrProcessing && (
              <div style={{ padding: '16px', background: '#dbeafe', borderRadius: '8px', marginBottom: '16px', textAlign: 'center' }}>
                <div className={styles.spinner} style={{ margin: '0 auto 8px' }} />
                Reading receipt with AI...
              </div>
            )}

            {/* OCR Results Preview */}
            {ocrData && (
              <div style={{ padding: '12px', background: '#f0fdf4', border: '1px solid #22c55e', borderRadius: '8px', marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, color: '#16a34a', marginBottom: '8px' }}>✓ Receipt Parsed</div>
                <div style={{ fontSize: '13px', color: '#374151' }}>
                  Found {ocrData.items.length} items
                  {ocrData.total && ` • Total: $${ocrData.total.toFixed(2)}`}
                </div>
              </div>
            )}

            {/* Store info */}
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>Store</label>
              <select value={storeName} onChange={(e) => setStoreName(e.target.value)} className={styles.formSelect}>
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
              <input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} className={styles.formInput} />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>Purchased By</label>
              <select value={purchasedBy} onChange={(e) => setPurchasedBy(e.target.value)} className={styles.formSelect}>
                <option value="Cristian Kelly">Cristian Kelly</option>
                <option value="Ryan Kelly">Ryan Kelly</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setStep('scan')} style={{ flex: 1, padding: '14px', background: '#f3f4f6', border: 'none', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' }}>Back</button>
              <button onClick={runReconciliation} style={{ flex: 1, padding: '14px', background: '#FF580F', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>
                {ocrData ? 'Match Prices' : 'Continue'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: RECONCILIATION */}
        {step === 'reconcile' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>Reconcile Prices</h2>

            {/* Section 1: Matched Items */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#22c55e' }}>✓</span> Matched Items ({items.filter(i => i.matchConfidence !== 'none').length})
              </h3>
              {items.filter(i => i.matchConfidence !== 'none').map((item) => (
                <div key={item.barcode} style={{ padding: '12px', background: item.matchConfidence === 'high' ? '#f0fdf4' : '#fefce8', border: `1px solid ${item.matchConfidence === 'high' ? '#22c55e' : '#facc15'}`, borderRadius: '10px', marginBottom: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div>
                      {item.brand && <div style={{ fontWeight: 700, fontSize: '11px', color: '#FF580F', textTransform: 'uppercase' }}>{item.brand}</div>}
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>Qty: {item.quantity}</div>
                    </div>
                    <span style={{ fontSize: '12px', color: item.matchConfidence === 'high' ? '#16a34a' : '#ca8a04' }}>
                      {item.matchConfidence === 'high' ? '✓ Confident' : '⚠ Check'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span>$</span>
                    <input type="number" step="0.01" value={item.unitCost} onChange={(e) => updatePrice(item.barcode, e.target.value)} className={styles.formInput} style={{ flex: 1 }} />
                    <span style={{ color: '#6b7280', fontSize: '13px' }}>each</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Section 2: Unmatched Receipt Lines */}
            {unmatchedOcrItems.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#f59e0b' }}>?</span> On Receipt But Not Scanned ({unmatchedOcrItems.length})
                </h3>
                {unmatchedOcrItems.map((ocrItem, idx) => (
                  <div key={idx} style={{ padding: '12px', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '10px', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>{ocrItem.name}</div>
                    <div style={{ fontSize: '13px', color: '#92400e' }}>
                      ${ocrItem.unitPrice?.toFixed(2) || ocrItem.totalPrice?.toFixed(2) || '?.??'}
                      {ocrItem.quantity > 1 && ` × ${ocrItem.quantity}`}
                    </div>
                    <div style={{ fontSize: '12px', color: '#78716c', marginTop: '4px' }}>
                      Scan this item to add it, or ignore if not needed
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Section 3: Unpriced Scanned Items */}
            {unpricedItems.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#dc2626' }}>!</span> No Price Found ({unpricedItems.length})
                </h3>
                {unpricedItems.map((item) => (
                  <div key={item.barcode} style={{ padding: '12px', background: '#fef2f2', border: '1px solid #dc2626', borderRadius: '10px', marginBottom: '8px' }}>
                    <div style={{ marginBottom: '8px' }}>
                      {item.brand && <div style={{ fontWeight: 700, fontSize: '11px', color: '#FF580F', textTransform: 'uppercase' }}>{item.brand}</div>}
                      <div style={{ fontWeight: 600 }}>{item.name}</div>
                      <div style={{ fontSize: '12px', color: '#6b7280' }}>Qty: {item.quantity}</div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>$</span>
                      <input type="number" step="0.01" value={item.unitCost} onChange={(e) => updatePrice(item.barcode, e.target.value)} placeholder="Enter price" className={styles.formInput} style={{ flex: 1, borderColor: '#dc2626' }} />
                      <span style={{ color: '#6b7280', fontSize: '13px' }}>each</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Section 4: Totals Check */}
            <div style={{ padding: '16px', background: difference < 1 ? '#f0fdf4' : '#fef3c7', border: `1px solid ${difference < 1 ? '#22c55e' : '#f59e0b'}`, borderRadius: '10px', marginBottom: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Totals Check</h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Receipt Total:</span>
                <span style={{ fontWeight: 600 }}>${receiptTotalNum.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Items Total:</span>
                <span style={{ fontWeight: 600 }}>${calculatedTotal.toFixed(2)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid #e5e7eb' }}>
                <span>Difference:</span>
                <span style={{ fontWeight: 600, color: difference < 1 ? '#16a34a' : '#f59e0b' }}>${difference.toFixed(2)}</span>
              </div>
              {difference >= 1 && (
                <div style={{ fontSize: '12px', color: '#92400e', marginTop: '8px' }}>
                  ⚠ Totals don&apos;t match. Check for unscanned items or incorrect prices.
                </div>
              )}
              {difference > 0 && difference < 1 && (
                <div style={{ fontSize: '12px', color: '#16a34a', marginTop: '8px' }}>
                  ✓ Difference is likely tax
                </div>
              )}
            </div>

            {/* Receipt Total Input */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>Receipt Total (edit if needed)</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>$</span>
                <input type="number" step="0.01" value={receiptTotal} onChange={(e) => setReceiptTotal(e.target.value)} className={styles.formInput} style={{ fontSize: '20px', fontWeight: 700 }} />
              </div>
            </div>

            {/* Navigation */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setStep('receipt')} style={{ flex: 1, padding: '14px', background: '#f3f4f6', border: 'none', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' }}>Back</button>
              <button onClick={() => setStep('scan')} style={{ flex: 1, padding: '14px', background: '#dbeafe', color: '#1e40af', border: 'none', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' }}>Scan More</button>
              <button onClick={() => setStep('submit')} style={{ flex: 1, padding: '14px', background: '#FF580F', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: 'pointer' }}>Continue</button>
            </div>
          </div>
        )}

        {/* STEP 4: FINAL SUBMIT */}
        {step === 'submit' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>Confirm & Submit</h2>

            {/* Summary */}
            <div style={{ padding: '12px', background: '#f3f4f6', borderRadius: '8px', marginBottom: '16px' }}>
              <div><strong>Store:</strong> {storeName}</div>
              <div><strong>Date:</strong> {purchaseDate}</div>
              <div><strong>By:</strong> {purchasedBy}</div>
              <div><strong>Items:</strong> {totalItemCount}</div>
              <div><strong>Total:</strong> ${(receiptTotalNum || calculatedTotal).toFixed(2)}</div>
            </div>

            {/* Items List */}
            <h3 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '12px' }}>Items</h3>
            {items.map((item) => (
              <div key={item.barcode} style={{ padding: '12px', background: '#f9fafb', borderRadius: '10px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  {item.brand && <div style={{ fontWeight: 700, fontSize: '11px', color: '#FF580F', textTransform: 'uppercase' }}>{item.brand}</div>}
                  <div style={{ fontWeight: 600 }}>{item.name}</div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>Qty: {item.quantity}</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: '16px' }}>
                  {item.unitCost ? `$${parseFloat(item.unitCost).toFixed(2)}` : '—'}
                </div>
              </div>
            ))}

            {/* Receipt thumbnail */}
            {receiptImage && (
              <div style={{ marginTop: '16px', marginBottom: '16px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={receiptImage} alt="Receipt" style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e5e7eb' }} />
              </div>
            )}

            {/* Navigation */}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setStep(ocrData ? 'reconcile' : 'receipt')} style={{ flex: 1, padding: '14px', background: '#f3f4f6', border: 'none', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' }}>Back</button>
              <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '16px', background: saving ? '#d1d5db' : '#22c55e', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '16px', cursor: saving ? 'wait' : 'pointer' }}>
                {saving ? 'Saving...' : 'Submit Purchase'}
              </button>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
