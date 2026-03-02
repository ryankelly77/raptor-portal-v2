'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '../../components/AdminShell';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { BarcodeLookup } from '../components/BarcodeLookup';
import { adminFetch, ApiError, AuthError } from '@/lib/admin-fetch';
import styles from '../inventory.module.css';

// Build version for debugging
const BUILD_VERSION = 'v2024-MAR01-K';

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
  matchConfidence?: 'alias' | 'ai-high' | 'ai-medium' | 'ai-low' | 'high' | 'medium' | 'none';
  matchedOcrLine?: string;
  aiReasoning?: string;
}

interface ParsedOCRItem {
  description: string;
  price: number;
  matched?: boolean;
  matchedProductId?: string;
  aiReasoning?: string;
}

interface ReceiptAlias {
  id: string;
  store_name: string | null;
  receipt_text: string;
  product_id: string;
}

interface AIMatchResult {
  receipt_index: number;
  product_id: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  reasoning: string;
}

// Fuzzy matching: calculate word overlap score
function fuzzyMatch(scannedName: string, scannedBrand: string | null, ocrDescription: string): number {
  const scannedWords = ((scannedBrand || '') + ' ' + scannedName)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 2);

  const ocrWords = ocrDescription
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1); // Allow shorter words for abbreviations

  if (scannedWords.length === 0 || ocrWords.length === 0) return 0;

  let matchCount = 0;
  for (const sw of scannedWords) {
    for (const ow of ocrWords) {
      // Check for substring match (handles abbreviations like "BLK" vs "BLACK", "MNSTR" vs "MONSTER")
      if (sw.includes(ow) || ow.includes(sw) || sw === ow) {
        matchCount++;
        break;
      }
      // Check for first 3 chars match (BLK vs BLACK)
      if (sw.length >= 3 && ow.length >= 3 && sw.substring(0, 3) === ow.substring(0, 3)) {
        matchCount += 0.5;
        break;
      }
    }
  }

  return matchCount / Math.max(scannedWords.length, 1);
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
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptUploading, setReceiptUploading] = useState(false);

  // OCR state
  const [ocrStatus, setOcrStatus] = useState<string>('');
  const [ocrProgress, setOcrProgress] = useState<number>(0);
  const [ocrRawText, setOcrRawText] = useState<string>('');
  const [ocrItems, setOcrItems] = useState<ParsedOCRItem[]>([]);
  const [showDebugText, setShowDebugText] = useState(false);

  // Purchase info
  const [storeName, setStoreName] = useState("Sam's");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().split('T')[0]);
  const [purchasedBy, setPurchasedBy] = useState('Cristian Kelly');

  // Final state
  const [receiptTotal, setReceiptTotal] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);

  // Alias system
  const [aliases, setAliases] = useState<ReceiptAlias[]>([]);
  const [aliasesLoaded, setAliasesLoaded] = useState(false);
  const [savingAlias, setSavingAlias] = useState<string | null>(null);

  // AI matching
  const [aiMatching, setAiMatching] = useState(false);
  const [aiMatchStatus, setAiMatchStatus] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load aliases on mount
  const loadAliases = useCallback(async () => {
    try {
      const res = await adminFetch('/api/admin/crud', {
        method: 'POST',
        body: JSON.stringify({ table: 'receipt_aliases', action: 'read' }),
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setAliases(data.data);
        console.log('[Aliases] Loaded', data.data.length, 'aliases');
      }
    } catch (err) {
      console.error('[Aliases] Load error:', err);
    } finally {
      setAliasesLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadAliases();
  }, [loadAliases]);

  // Save a new alias
  const saveAlias = async (receiptText: string, productId: string) => {
    setSavingAlias(receiptText);
    try {
      const res = await adminFetch('/api/admin/crud', {
        method: 'POST',
        body: JSON.stringify({
          table: 'receipt_aliases',
          action: 'create',
          data: {
            store_name: storeName,
            receipt_text: receiptText.trim().toUpperCase(),
            product_id: productId,
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setAliases([...aliases, data.data]);
        console.log('[Alias] Saved:', receiptText, '->', productId);
      }
    } catch (err) {
      console.error('[Alias] Save error:', err);
    } finally {
      setSavingAlias(null);
    }
  };

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

  // Run CLIENT-SIDE OCR with Tesseract.js
  const runOCR = async (imageFile: File) => {
    setOcrStatus('Loading OCR engine...');
    setOcrProgress(0);
    setOcrRawText('');
    setOcrItems([]);

    try {
      console.log('[OCR] Starting Tesseract...');
      const Tesseract = (await import('tesseract.js')).default;

      const result = await Tesseract.recognize(imageFile, 'eng', {
        logger: (info: { status: string; progress: number }) => {
          console.log('[OCR]', info.status, info.progress);
          if (info.status === 'recognizing text') {
            const pct = Math.round(info.progress * 100);
            setOcrProgress(pct);
            setOcrStatus(`Reading receipt... ${pct}%`);
          } else if (info.status === 'loading language traineddata') {
            setOcrStatus('Loading language data...');
          }
        },
      });

      const rawText = result.data.text;
      console.log('[OCR] RAW TEXT:', rawText);
      setOcrRawText(rawText);
      setOcrStatus('Parsing prices...');

      // Parse the text for prices - handles Walmart format (no $, tax codes like F/T/X)
      const lines = rawText.split('\n').filter(l => l.trim());
      const parsedItems: ParsedOCRItem[] = [];
      let foundTotal: number | null = null;

      console.log('[OCR] Parsing', lines.length, 'lines');

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.length < 3) continue;

        console.log('[OCR] Line:', trimmed);

        // Check for multi-quantity format: "2 @ 2.99" or "2 @ 2.99    5.98"
        const multiQtyMatch = trimmed.match(/(\d+)\s*[@xX]\s*(\d+\.\d{2})/);
        if (multiQtyMatch) {
          const qty = parseInt(multiQtyMatch[1]);
          const unitPrice = parseFloat(multiQtyMatch[2]);
          const description = trimmed.replace(/\d+\s*[@xX]\s*\d+\.\d{2}.*$/, '').trim();
          if (description && unitPrice > 0) {
            parsedItems.push({ description, price: unitPrice });
            console.log('[OCR] Multi-qty item:', description, qty, 'x $' + unitPrice);
            continue;
          }
        }

        // Pattern: price with optional $ and optional tax code letter at end
        // Handles: $4.98, 4.98, 4.98 F, 4.98F, $ 4.98
        const priceMatch = trimmed.match(/\$?\s?(\d{1,3}\.\d{2})\s*[A-Z]?\s*$/);
        if (priceMatch) {
          const price = parseFloat(priceMatch[1]);
          const description = trimmed.replace(priceMatch[0], '').trim();

          // Skip totals, tax, payment lines
          if (/total|subtotal|tax|change|cash|credit|debit|visa|master|card|payment|balance|savings|tend/i.test(description)) {
            if (/total/i.test(description) && !/sub/i.test(description)) {
              foundTotal = price;
              console.log('[OCR] Found total:', price);
            }
            continue;
          }

          // Skip very small amounts that are likely tax/fees
          if (price < 0.50 && description.length < 5) continue;

          // Skip empty descriptions
          if (!description) continue;

          // Skip lines that look like dates, times, phone numbers
          if (/^\d{1,2}[\/\-]\d{1,2}|^\d{3}[\-\s]\d{3}|manager|cashier|store|#\d+/i.test(description)) continue;

          if (price > 0 && price < 500) {
            parsedItems.push({ description, price });
            console.log('[OCR] Parsed item:', description, '$' + price);
          }
        }
      }

      console.log('[OCR] Total parsed items:', parsedItems.length);
      setOcrItems(parsedItems);

      if (foundTotal) {
        setReceiptTotal(foundTotal.toFixed(2));
      }

      setOcrStatus(`Found ${parsedItems.length} items`);
      return { rawText, items: parsedItems, total: foundTotal };

    } catch (err) {
      console.error('[OCR] FAILED:', err);
      setOcrStatus('OCR failed. Enter prices manually.');
      return { rawText: '', items: [], total: null };
    }
  };

  // Match OCR items to scanned products - uses ALIAS first, then AI
  const matchOcrToProducts = async () => {
    const ocrItemsCopy: ParsedOCRItem[] = ocrItems.map(item => ({ ...item, matched: false }));
    const updatedItems: ScannedItem[] = items.map(item => ({
      ...item,
      matchConfidence: 'none' as const,
      matchedOcrLine: undefined,
      aiReasoning: undefined,
    }));

    // PHASE 1: Match via aliases (highest priority - free & instant)
    const storeAliases = aliases.filter(a => !a.store_name || a.store_name === storeName);
    console.log(`[Match] Checking ${storeAliases.length} aliases for store "${storeName}"`);

    for (let j = 0; j < ocrItemsCopy.length; j++) {
      if (ocrItemsCopy[j].matched) continue;

      const ocrText = ocrItemsCopy[j].description.toUpperCase().trim();

      for (const alias of storeAliases) {
        const aliasText = alias.receipt_text.toUpperCase().trim();

        if (ocrText.includes(aliasText) || aliasText.includes(ocrText)) {
          const scannedIdx = updatedItems.findIndex(
            si => si.productId === alias.product_id && si.matchConfidence === 'none'
          );

          if (scannedIdx >= 0) {
            ocrItemsCopy[j].matched = true;
            ocrItemsCopy[j].matchedProductId = alias.product_id;

            updatedItems[scannedIdx] = {
              ...updatedItems[scannedIdx],
              unitCost: ocrItemsCopy[j].price.toFixed(2),
              matchConfidence: 'alias',
              matchedOcrLine: ocrItemsCopy[j].description,
            };
            console.log(`[Match] ALIAS MATCH: "${updatedItems[scannedIdx].name}" <- "${ocrItemsCopy[j].description}" @ $${ocrItemsCopy[j].price}`);
            break;
          }
        }
      }
    }

    // PHASE 2: AI matching for remaining unmatched items
    const unmatchedOcr = ocrItemsCopy.filter(o => !o.matched);
    const unmatchedProducts = updatedItems.filter(i => i.matchConfidence === 'none' && i.productId);

    if (unmatchedOcr.length > 0 && unmatchedProducts.length > 0) {
      setAiMatching(true);
      setAiMatchStatus('Matching items with AI...');

      try {
        // Prepare data for AI
        const ocrLines = unmatchedOcr.map(o => ({
          description: o.description,
          price: o.price
        }));

        const products = unmatchedProducts.map(p => ({
          id: p.productId!,
          brand: p.brand,
          name: p.name,
          category: p.category
        }));

        console.log(`[AI Match] Sending ${ocrLines.length} OCR lines and ${products.length} products`);

        const res = await adminFetch('/api/admin/inventory/match-receipt', {
          method: 'POST',
          body: JSON.stringify({
            ocrLines,
            products,
            storeName
          }),
        });

        const data = await res.json();

        if (res.ok && data.matches) {
          console.log('[AI Match] Received', data.matches.length, 'matches');

          // Apply AI matches
          for (const match of data.matches as AIMatchResult[]) {
            if (!match.product_id || match.confidence === 'none') continue;

            const ocrItem = unmatchedOcr[match.receipt_index];
            if (!ocrItem || ocrItem.matched) continue;

            // Find the scanned item with this product_id
            const scannedIdx = updatedItems.findIndex(
              si => si.productId === match.product_id && si.matchConfidence === 'none'
            );

            if (scannedIdx >= 0) {
              // Find original OCR index
              const origOcrIdx = ocrItemsCopy.findIndex(o => o.description === ocrItem.description && !o.matched);
              if (origOcrIdx >= 0) {
                ocrItemsCopy[origOcrIdx].matched = true;
                ocrItemsCopy[origOcrIdx].matchedProductId = match.product_id;
                ocrItemsCopy[origOcrIdx].aiReasoning = match.reasoning;
              }

              const confidenceMap: Record<string, 'ai-high' | 'ai-medium' | 'ai-low'> = {
                high: 'ai-high',
                medium: 'ai-medium',
                low: 'ai-low'
              };

              updatedItems[scannedIdx] = {
                ...updatedItems[scannedIdx],
                unitCost: ocrItem.price.toFixed(2),
                matchConfidence: confidenceMap[match.confidence] || 'ai-low',
                matchedOcrLine: ocrItem.description,
                aiReasoning: match.reasoning,
              };

              console.log(`[AI Match] ${match.confidence.toUpperCase()}: "${updatedItems[scannedIdx].name}" <- "${ocrItem.description}" (${match.reasoning})`);
            }
          }

          setAiMatchStatus(`AI matched ${data.matches.filter((m: AIMatchResult) => m.product_id && m.confidence !== 'none').length} items`);
        } else {
          console.error('[AI Match] Failed:', data.error);
          setAiMatchStatus('AI matching failed - using manual mode');
        }
      } catch (err) {
        console.error('[AI Match] Error:', err);
        setAiMatchStatus('AI matching error - using manual mode');
      } finally {
        setAiMatching(false);
      }
    }

    setItems(updatedItems);
    setOcrItems(ocrItemsCopy);
  };

  // Handle receipt photo capture
  const handleReceiptCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setReceiptFile(file);
    setError(null);

    // Create preview immediately
    const reader = new FileReader();
    reader.onload = (ev) => {
      setReceiptImage(ev.target?.result as string);
    };
    reader.readAsDataURL(file);

    // Run OCR immediately
    await runOCR(file);
  };

  // Upload receipt and proceed to reconciliation
  const handleProceedToReconcile = async () => {
    if (!receiptFile) {
      // No receipt, skip to submit
      setStep('reconcile');
      return;
    }

    setReceiptUploading(true);
    setError(null);

    try {
      // Upload to Supabase
      const formData = new FormData();
      formData.append('file', receiptFile);
      formData.append('folder', 'receipts');

      const uploadRes = await adminFetch('/api/admin/upload', {
        method: 'POST',
        body: formData,
      });
      const uploadData = await uploadRes.json();

      if (!uploadRes.ok || !uploadData.url) {
        throw new Error(uploadData.error || 'Upload failed');
      }

      setReceiptImage(uploadData.url);

      // Match OCR items to products (alias + AI)
      await matchOcrToProducts();

      setStep('reconcile');

    } catch (err: unknown) {
      console.error('[Receive] Upload error:', err);
      if (err instanceof ApiError || err instanceof AuthError) {
        setError({ message: err.message, endpoint: err.endpoint, status: err.status });
      } else if (err instanceof Error) {
        setError({ message: err.message, endpoint: '/api/admin/upload', status: 0 });
      }
    } finally {
      setReceiptUploading(false);
    }
  };

  // Calculate totals
  const calculatedTotal = items.reduce((sum, item) => {
    const price = parseFloat(item.unitCost) || 0;
    return sum + (price * item.quantity);
  }, 0);

  const receiptTotalNum = parseFloat(receiptTotal) || 0;
  const difference = Math.abs(receiptTotalNum - calculatedTotal);

  // Get unmatched OCR items
  const unmatchedOcrItems = ocrItems.filter(item => !item.matched);

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
          {BUILD_VERSION} | Step: {step} | Items: {totalItemCount} | OCR: {ocrItems.length} lines
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
                <button onClick={() => { setReceiptImage(null); setReceiptFile(null); setOcrRawText(''); setOcrItems([]); setOcrStatus(''); fileInputRef.current?.click(); }} style={{ width: '100%', marginTop: '8px', padding: '10px', background: '#f3f4f6', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
                  Retake Photo
                </button>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '40px', background: '#f9fafb', borderRadius: '12px', border: '2px dashed #d1d5db', marginBottom: '16px' }}>
                <input ref={fileInputRef} type="file" accept="image/*" capture="environment" onChange={handleReceiptCapture} style={{ display: 'none' }} />
                <button onClick={() => fileInputRef.current?.click()} style={{ padding: '16px 32px', background: '#FF580F', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, fontSize: '16px', cursor: 'pointer' }}>
                  Take Receipt Photo
                </button>
              </div>
            )}

            {/* OCR Progress */}
            {ocrStatus && (
              <div style={{ padding: '16px', background: '#dbeafe', borderRadius: '8px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                  {ocrProgress > 0 && ocrProgress < 100 && <div className={styles.spinner} />}
                  <span style={{ fontWeight: 600 }}>{ocrStatus}</span>
                </div>
                {ocrProgress > 0 && ocrProgress < 100 && (
                  <div style={{ height: '8px', background: '#bfdbfe', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${ocrProgress}%`, background: '#3b82f6', transition: 'width 0.3s' }} />
                  </div>
                )}
              </div>
            )}

            {/* OCR Results Preview */}
            {ocrItems.length > 0 && (
              <div style={{ padding: '12px', background: '#f0fdf4', border: '1px solid #22c55e', borderRadius: '8px', marginBottom: '16px' }}>
                <div style={{ fontWeight: 600, color: '#16a34a', marginBottom: '8px' }}>✓ Found {ocrItems.length} items on receipt</div>
                {receiptTotal && <div style={{ fontSize: '13px', color: '#374151' }}>Total: ${receiptTotal}</div>}
              </div>
            )}

            {/* DEBUG: Always visible OCR output */}
            {(ocrRawText || ocrItems.length > 0 || ocrStatus) && (
              <div style={{ background: '#f5f5f5', padding: '16px', marginBottom: '16px', borderRadius: '8px', border: '1px solid #d1d5db' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 700, color: '#374151' }}>DEBUG: OCR Output</h4>

                <div style={{ marginBottom: '12px' }}>
                  <strong style={{ fontSize: '12px' }}>Status:</strong>
                  <span style={{ fontSize: '12px', marginLeft: '8px' }}>{ocrStatus || 'Not started'}</span>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  <strong style={{ fontSize: '12px' }}>Raw Text ({ocrRawText.length} chars):</strong>
                  <pre style={{
                    marginTop: '8px',
                    padding: '12px',
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    maxHeight: '200px',
                    overflow: 'auto',
                    margin: 0
                  }}>
                    {ocrRawText || '(no text detected)'}
                  </pre>
                </div>

                <div>
                  <strong style={{ fontSize: '12px' }}>Parsed Items ({ocrItems.length}):</strong>
                  <pre style={{
                    marginTop: '8px',
                    padding: '12px',
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '6px',
                    fontSize: '11px',
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    maxHeight: '150px',
                    overflow: 'auto',
                    margin: 0
                  }}>
                    {ocrItems.length > 0 ? JSON.stringify(ocrItems, null, 2) : '(no items parsed)'}
                  </pre>
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
              <button onClick={handleProceedToReconcile} disabled={receiptUploading || aiMatching} style={{ flex: 1, padding: '14px', background: '#FF580F', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: (receiptUploading || aiMatching) ? 'wait' : 'pointer' }}>
                {receiptUploading ? 'Uploading...' : aiMatching ? 'AI Matching...' : 'Match with AI'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: RECONCILIATION */}
        {step === 'reconcile' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>Reconcile Prices</h2>

            {/* AI Matching Status */}
            {(aiMatching || aiMatchStatus) && (
              <div style={{ padding: '12px 16px', background: aiMatching ? '#dbeafe' : '#f0fdf4', border: `1px solid ${aiMatching ? '#3b82f6' : '#22c55e'}`, borderRadius: '8px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                {aiMatching && <div className={styles.spinner} />}
                <span style={{ fontWeight: 500, color: aiMatching ? '#1d4ed8' : '#16a34a' }}>
                  {aiMatchStatus || 'Matching with AI...'}
                </span>
              </div>
            )}

            {/* Section 1: Matched Items */}
            <div style={{ marginBottom: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#22c55e' }}>✓</span> Matched Items ({items.filter(i => i.matchConfidence !== 'none').length})
              </h3>
              {items.filter(i => i.matchConfidence !== 'none').map((item) => {
                // Determine colors and labels based on match confidence
                let bgColor = '#fefce8';
                let borderColor = '#facc15';
                let labelColor = '#ca8a04';
                let label = '⚠ Check';

                if (item.matchConfidence === 'alias') {
                  bgColor = '#dbeafe'; borderColor = '#3b82f6'; labelColor = '#1d4ed8'; label = '✓ Alias';
                } else if (item.matchConfidence === 'ai-high') {
                  bgColor = '#f0fdf4'; borderColor = '#22c55e'; labelColor = '#16a34a'; label = '✓ AI High';
                } else if (item.matchConfidence === 'ai-medium') {
                  bgColor = '#fefce8'; borderColor = '#facc15'; labelColor = '#ca8a04'; label = '⚠ AI Medium';
                } else if (item.matchConfidence === 'ai-low') {
                  bgColor = '#fef2f2'; borderColor = '#f87171'; labelColor = '#dc2626'; label = '? AI Low';
                } else if (item.matchConfidence === 'high') {
                  bgColor = '#f0fdf4'; borderColor = '#22c55e'; labelColor = '#16a34a'; label = '✓ Confident';
                }

                // Check if alias already exists for this match
                const aliasExists = item.matchedOcrLine && item.productId && aliases.some(
                  a => a.receipt_text.toUpperCase() === item.matchedOcrLine?.toUpperCase() && a.product_id === item.productId
                );

                // Should offer to save alias for AI matches
                const shouldOfferAlias = (item.matchConfidence === 'ai-high' || item.matchConfidence === 'ai-medium' || item.matchConfidence === 'ai-low' || item.matchConfidence === 'medium')
                  && item.matchedOcrLine && item.productId && !aliasExists;

                return (
                  <div key={item.barcode} style={{ padding: '12px', background: bgColor, border: `1px solid ${borderColor}`, borderRadius: '10px', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                      <div>
                        {item.brand && <div style={{ fontWeight: 700, fontSize: '11px', color: '#FF580F', textTransform: 'uppercase' }}>{item.brand}</div>}
                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Qty: {item.quantity}</div>
                        {item.matchedOcrLine && <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '4px' }}>Receipt: &quot;{item.matchedOcrLine}&quot;</div>}
                        {item.aiReasoning && (
                          <div style={{ fontSize: '11px', color: '#6366f1', marginTop: '2px', fontStyle: 'italic' }}>
                            AI: {item.aiReasoning}
                          </div>
                        )}
                      </div>
                      <span style={{ fontSize: '12px', color: labelColor, fontWeight: 600 }}>{label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>$</span>
                      <input type="number" step="0.01" value={item.unitCost} onChange={(e) => updatePrice(item.barcode, e.target.value)} className={styles.formInput} style={{ flex: 1 }} />
                      <span style={{ color: '#6b7280', fontSize: '13px' }}>each</span>
                    </div>

                    {/* Offer to save alias for AI/fuzzy matches */}
                    {shouldOfferAlias && (
                      <div style={{ marginTop: '8px' }}>
                        <button
                          onClick={() => item.matchedOcrLine && item.productId && saveAlias(item.matchedOcrLine, item.productId)}
                          disabled={savingAlias === item.matchedOcrLine}
                          style={{ fontSize: '11px', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                        >
                          {savingAlias === item.matchedOcrLine ? 'Saving...' : '+ Remember this match'}
                        </button>
                      </div>
                    )}
                    {aliasExists && item.matchConfidence !== 'alias' && (
                      <div style={{ marginTop: '8px' }}>
                        <span style={{ fontSize: '11px', color: '#16a34a' }}>✓ Alias saved</span>
                      </div>
                    )}
                  </div>
                );
              })}
              {items.filter(i => i.matchConfidence !== 'none').length === 0 && (
                <div style={{ padding: '16px', background: '#f9fafb', borderRadius: '8px', color: '#6b7280', textAlign: 'center' }}>
                  No automatic matches found
                </div>
              )}
            </div>

            {/* Section 2: Unmatched Receipt Lines */}
            {unmatchedOcrItems.length > 0 && (
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ color: '#f59e0b' }}>?</span> On Receipt But Not Scanned ({unmatchedOcrItems.length})
                </h3>
                {unmatchedOcrItems.map((ocrItem, idx) => (
                  <div key={idx} style={{ padding: '12px', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '10px', marginBottom: '8px' }}>
                    <div style={{ fontWeight: 600, marginBottom: '4px' }}>{ocrItem.description}</div>
                    <div style={{ fontSize: '13px', color: '#92400e' }}>${ocrItem.price.toFixed(2)}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Section 3: Unpriced Scanned Items - Can manually match */}
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

                    {/* Manual OCR line selection */}
                    {unmatchedOcrItems.length > 0 && (
                      <div style={{ marginBottom: '8px' }}>
                        <select
                          className={styles.formSelect}
                          style={{ fontSize: '12px', padding: '8px' }}
                          onChange={(e) => {
                            const idx = parseInt(e.target.value);
                            if (idx >= 0 && unmatchedOcrItems[idx]) {
                              const ocrItem = unmatchedOcrItems[idx];
                              updatePrice(item.barcode, ocrItem.price.toFixed(2));
                              // Update match info
                              setItems(prev => prev.map(i =>
                                i.barcode === item.barcode
                                  ? { ...i, matchedOcrLine: ocrItem.description, matchConfidence: 'medium' as const, unitCost: ocrItem.price.toFixed(2) }
                                  : i
                              ));
                              // Mark OCR item as matched
                              setOcrItems(prev => prev.map((o, i) =>
                                o.description === ocrItem.description ? { ...o, matched: true } : o
                              ));
                            }
                          }}
                          defaultValue=""
                        >
                          <option value="" disabled>Match to receipt line...</option>
                          {unmatchedOcrItems.map((ocr, idx) => (
                            <option key={idx} value={idx}>
                              {ocr.description} — ${ocr.price.toFixed(2)}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span>$</span>
                      <input type="number" step="0.01" value={item.unitCost} onChange={(e) => updatePrice(item.barcode, e.target.value)} placeholder="Enter price" className={styles.formInput} style={{ flex: 1, borderColor: '#dc2626' }} />
                      <span style={{ color: '#6b7280', fontSize: '13px' }}>each</span>
                    </div>

                    {/* Remember this match button - appears after user manually matches */}
                    {item.matchedOcrLine && item.productId && (
                      <div style={{ marginTop: '8px' }}>
                        {aliases.some(a => a.receipt_text.toUpperCase() === item.matchedOcrLine?.toUpperCase() && a.product_id === item.productId) ? (
                          <span style={{ fontSize: '11px', color: '#16a34a' }}>✓ Alias saved</span>
                        ) : (
                          <button
                            onClick={() => item.matchedOcrLine && item.productId && saveAlias(item.matchedOcrLine, item.productId)}
                            disabled={savingAlias === item.matchedOcrLine}
                            style={{ fontSize: '11px', color: '#3b82f6', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', padding: 0 }}
                          >
                            {savingAlias === item.matchedOcrLine ? 'Saving...' : 'Remember this match'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Section 4: Totals Check */}
            {receiptTotalNum > 0 && (
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
              </div>
            )}

            {/* Receipt Total Input */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>Receipt Total</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '20px' }}>$</span>
                <input type="number" step="0.01" value={receiptTotal} onChange={(e) => setReceiptTotal(e.target.value)} placeholder="0.00" className={styles.formInput} style={{ fontSize: '20px', fontWeight: 700 }} />
              </div>
            </div>

            {/* Debug: Raw OCR Text */}
            {ocrRawText && (
              <div style={{ marginBottom: '16px' }}>
                <button onClick={() => setShowDebugText(!showDebugText)} style={{ fontSize: '12px', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
                  {showDebugText ? 'Hide' : 'Show'} Raw OCR Text
                </button>
                {showDebugText && (
                  <pre style={{ marginTop: '8px', padding: '12px', background: '#f3f4f6', borderRadius: '8px', fontSize: '11px', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '200px', overflow: 'auto' }}>
                    {ocrRawText}
                  </pre>
                )}
              </div>
            )}

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

            {/* Navigation */}
            <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
              <button onClick={() => setStep('reconcile')} style={{ flex: 1, padding: '14px', background: '#f3f4f6', border: 'none', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' }}>Back</button>
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
