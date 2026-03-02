'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '../../components/AdminShell';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { BarcodeLookup } from '../components/BarcodeLookup';
import { adminFetch, ApiError, AuthError } from '@/lib/admin-fetch';
import styles from '../inventory.module.css';

// Build version for debugging
const BUILD_VERSION = 'v2024-MAR01-N';

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
  matchConfidence?: 'alias' | 'ai-high' | 'ai-medium' | 'ai-low' | 'none';
  matchedOcrLine?: string;
  aiReasoning?: string;
}

// AI-parsed receipt item (from Vision API)
interface AIParsedItem {
  receipt_text: string;
  parsed_name: string;
  barcode: string | null;
  price: number;
  quantity: number;
  product_id: string | null;
  confidence: 'high' | 'medium' | 'low';
  is_new_product: boolean;
  suggested_brand: string | null;
  suggested_category: string | null;
  reasoning: string;
  // UI state
  accepted?: boolean;
  skipped?: boolean;
  editingNewProduct?: boolean;
  changingMatch?: boolean;
}

interface ReceiptAlias {
  id: string;
  store_name: string | null;
  receipt_text: string;
  product_id: string;
}

interface Product {
  id: string;
  name: string;
  brand: string | null;
  barcode: string;
  category: string;
}

// Category options for new products
const CATEGORY_OPTIONS = ['Beverage', 'Snack', 'Meal', 'Candy', 'Other'];

export default function ReceiveItemsPage() {
  const router = useRouter();

  // Flow state: scan → receipt → reconcile → submit
  const [step, setStep] = useState<'scan' | 'receipt' | 'reconcile' | 'submit'>('scan');

  // Scanned items
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [currentBarcode, setCurrentBarcode] = useState<string | null>(null);

  // All products from catalog (for product picker)
  const [allProducts, setAllProducts] = useState<Product[]>([]);

  // Receipt data
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null);

  // AI Vision state
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiStatus, setAiStatus] = useState<string>('');
  const [aiParsedItems, setAiParsedItems] = useState<AIParsedItem[]>([]);
  const [aiTotal, setAiTotal] = useState<number | null>(null);
  const [aiSubtotal, setAiSubtotal] = useState<number | null>(null);
  const [aiNotes, setAiNotes] = useState<string>('');

  // AI-detected store info (editable)
  const [storeName, setStoreName] = useState<string>('');
  const [storeNumber, setStoreNumber] = useState<string>('');
  const [purchaseDate, setPurchaseDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [purchasedBy, setPurchasedBy] = useState('Cristian Kelly');

  // Final state
  const [receiptTotal, setReceiptTotal] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);

  // Alias system
  const [aliases, setAliases] = useState<ReceiptAlias[]>([]);
  const [aliasesLoaded, setAliasesLoaded] = useState(false);

  // Toast notifications
  const [toast, setToast] = useState<string | null>(null);

  // New product form state
  const [newProductForm, setNewProductForm] = useState<{
    brand: string;
    name: string;
    category: string;
    barcode: string;
    price: string;
  }>({ brand: '', name: '', category: '', barcode: '', price: '' });

  // Product search for "Change Match"
  const [productSearchQuery, setProductSearchQuery] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Show toast message
  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

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
  const saveAlias = async (receiptText: string, productId: string, productName: string) => {
    try {
      const res = await adminFetch('/api/admin/crud', {
        method: 'POST',
        body: JSON.stringify({
          table: 'receipt_aliases',
          action: 'create',
          data: {
            store_name: storeName || null,
            receipt_text: receiptText.trim().toUpperCase(),
            product_id: productId,
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setAliases([...aliases, data.data]);
        console.log('[Alias] Saved:', receiptText, '->', productId);
        showToast(`Learned: "${receiptText}" = ${productName} at ${storeName || 'any store'}`);
      }
    } catch (err) {
      console.error('[Alias] Save error:', err);
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

  // Handle receipt photo capture - just create preview, no OCR
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
  };

  // Upload receipt and send to AI Vision for parsing
  const handleProceedToReconcile = async () => {
    if (!receiptFile) {
      // No receipt, skip to reconcile with empty AI results
      setStep('reconcile');
      return;
    }

    setAiProcessing(true);
    setAiStatus('Uploading receipt...');
    setError(null);

    try {
      // 1. Upload to Supabase
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

      const imageUrl = uploadData.url;
      setReceiptImageUrl(imageUrl);
      setReceiptImage(imageUrl);
      console.log('[AI Vision] Receipt uploaded:', imageUrl);

      // 2. Fetch all products for the catalog
      setAiStatus('AI is reading your receipt...');

      const productsRes = await adminFetch('/api/admin/crud', {
        method: 'POST',
        body: JSON.stringify({ table: 'products', action: 'read' }),
      });
      const productsData = await productsRes.json();
      const fetchedProducts: Product[] = productsData.data || [];
      setAllProducts(fetchedProducts);

      const products = fetchedProducts.map((p: Product) => ({
        id: p.id,
        brand: p.brand,
        name: p.name,
        barcode: p.barcode,
        category: p.category,
      }));

      console.log('[AI Vision] Sending image with', products.length, 'products in catalog');

      // 3. Send to AI Vision endpoint
      const res = await adminFetch('/api/admin/inventory/match-receipt', {
        method: 'POST',
        body: JSON.stringify({
          imageUrl,
          products,
        }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        console.log('[AI Vision] Success:', data.items?.length, 'items parsed');

        // Set AI-detected store info
        if (data.store_name) setStoreName(data.store_name);
        if (data.store_number) setStoreNumber(data.store_number);
        if (data.purchase_date) setPurchaseDate(data.purchase_date);

        // Apply alias overrides
        const storeAliases = aliases.filter(a => !a.store_name || a.store_name === data.store_name);
        const parsedItems: AIParsedItem[] = (data.items || []).map((item: AIParsedItem) => {
          // Check aliases first
          for (const alias of storeAliases) {
            if (item.receipt_text.toUpperCase().includes(alias.receipt_text.toUpperCase())) {
              // Found alias match - override AI's product_id
              const aliasProduct = fetchedProducts.find((p: Product) => p.id === alias.product_id);
              if (aliasProduct) {
                return {
                  ...item,
                  product_id: alias.product_id,
                  is_new_product: false,
                  confidence: 'high' as const,
                  reasoning: `Alias match: "${alias.receipt_text}"`
                };
              }
            }
          }
          return item;
        });

        setAiParsedItems(parsedItems);
        setAiTotal(data.total);
        setAiSubtotal(data.subtotal);
        setAiNotes(data.notes || '');

        if (data.total) {
          setReceiptTotal(data.total.toFixed(2));
        }

        const matchedCount = parsedItems.filter((i: AIParsedItem) => i.product_id).length;
        const newCount = parsedItems.filter((i: AIParsedItem) => i.is_new_product).length;
        setAiStatus(`Found ${parsedItems.length} items: ${matchedCount} matched, ${newCount} new`);

      } else {
        console.error('[AI Vision] Failed:', data.error);
        setAiStatus(`AI parsing failed: ${data.error || 'Unknown error'}`);
      }

      setStep('reconcile');

    } catch (err: unknown) {
      console.error('[Receive] Error:', err);
      if (err instanceof ApiError || err instanceof AuthError) {
        setError({ message: err.message, endpoint: err.endpoint, status: err.status });
      } else if (err instanceof Error) {
        setError({ message: err.message, endpoint: '/api/admin/inventory/match-receipt', status: 0 });
      }
    } finally {
      setAiProcessing(false);
    }
  };

  // Calculate totals with proper decimal handling (avoid floating point issues)
  const calculatedTotal = Math.round(items.reduce((sum, item) => {
    const price = parseFloat(item.unitCost) || 0;
    return sum + (price * item.quantity * 100);
  }, 0)) / 100;

  const receiptTotalNum = parseFloat(receiptTotal) || 0;
  const difference = Math.abs(Math.round((receiptTotalNum - calculatedTotal) * 100) / 100);

  // Create new product and add to items
  const handleCreateNewProduct = async (aiItem: AIParsedItem) => {
    try {
      // Create product
      const prodRes = await adminFetch('/api/admin/crud', {
        method: 'POST',
        body: JSON.stringify({
          table: 'products',
          action: 'create',
          data: {
            barcode: newProductForm.barcode || `NEW-${Date.now()}`,
            name: newProductForm.name,
            brand: newProductForm.brand || null,
            category: newProductForm.category || 'Other',
            default_price: parseFloat(newProductForm.price) || null,
          },
        }),
      });
      const prodData = await prodRes.json();

      if (!prodRes.ok || !prodData.data?.id) {
        throw new Error(prodData.error || 'Failed to create product');
      }

      const newProductId = prodData.data.id;
      const newProduct: Product = prodData.data;

      // Add to allProducts
      setAllProducts(prev => [...prev, newProduct]);

      // Add to scanned items
      const newItem: ScannedItem = {
        barcode: newProduct.barcode,
        name: newProduct.name,
        brand: newProduct.brand,
        category: newProduct.category,
        quantity: aiItem.quantity,
        unitCost: newProductForm.price,
        productId: newProductId,
        isNew: false,
        matchConfidence: 'ai-high',
        matchedOcrLine: aiItem.receipt_text,
      };
      setItems(prev => [...prev, newItem]);

      // Save alias
      await saveAlias(aiItem.receipt_text, newProductId, newProduct.name);

      // Update AI item as accepted
      setAiParsedItems(prev => prev.map(item =>
        item === aiItem ? { ...item, accepted: true, editingNewProduct: false, product_id: newProductId } : item
      ));

      // Reset form
      setNewProductForm({ brand: '', name: '', category: '', barcode: '', price: '' });

      showToast(`Created: ${newProduct.name}`);

    } catch (err) {
      console.error('[CreateProduct] Error:', err);
      showToast('Failed to create product');
    }
  };

  // Change match for an AI item
  const handleChangeMatch = async (aiItem: AIParsedItem, newProduct: Product) => {
    const oldProductId = aiItem.product_id;

    // Update the AI item
    setAiParsedItems(prev => prev.map(item =>
      item === aiItem ? {
        ...item,
        product_id: newProduct.id,
        is_new_product: false,
        confidence: 'high' as const,
        reasoning: `Manually matched to ${newProduct.name}`,
        changingMatch: false,
        accepted: true,
      } : item
    ));

    // Update or add to scanned items
    const existingItem = items.find(i => i.productId === newProduct.id);
    if (existingItem) {
      // Update quantity
      setItems(prev => prev.map(i =>
        i.productId === newProduct.id
          ? { ...i, quantity: i.quantity + aiItem.quantity, unitCost: aiItem.price.toFixed(2) }
          : i
      ));
    } else {
      // Add new item
      const newItem: ScannedItem = {
        barcode: newProduct.barcode,
        name: newProduct.name,
        brand: newProduct.brand,
        category: newProduct.category,
        quantity: aiItem.quantity,
        unitCost: aiItem.price.toFixed(2),
        productId: newProduct.id,
        isNew: false,
        matchConfidence: 'ai-high',
        matchedOcrLine: aiItem.receipt_text,
      };
      setItems(prev => [...prev, newItem]);
    }

    // Remove from old product if it was matched
    if (oldProductId && oldProductId !== newProduct.id) {
      setItems(prev => prev.filter(i => i.productId !== oldProductId || i.matchedOcrLine !== aiItem.receipt_text));
    }

    // Save alias for the correction
    await saveAlias(aiItem.receipt_text, newProduct.id, newProduct.name);

    setProductSearchQuery('');
  };

  // Filter products for search
  const filteredProducts = productSearchQuery.length >= 2
    ? allProducts.filter(p =>
        p.name.toLowerCase().includes(productSearchQuery.toLowerCase()) ||
        (p.brand && p.brand.toLowerCase().includes(productSearchQuery.toLowerCase())) ||
        p.barcode.includes(productSearchQuery)
      ).slice(0, 10)
    : [];

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
            store_name: storeName + (storeNumber ? ` ${storeNumber}` : ''),
            purchase_date: purchaseDate,
            receipt_image_url: receiptImageUrl || receiptImage,
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
          {BUILD_VERSION} | Step: {step} | Items: {totalItemCount}
        </div>

        {/* Toast notification */}
        {toast && (
          <div style={{
            position: 'fixed',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#1f2937',
            color: '#fff',
            padding: '12px 24px',
            borderRadius: '8px',
            zIndex: 9999,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            fontSize: '14px',
            maxWidth: '90%',
            textAlign: 'center',
          }}>
            {toast}
          </div>
        )}

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

        {/* STEP 2: CAPTURE RECEIPT - Simplified, no store selector */}
        {step === 'receipt' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>Capture Receipt</h2>

            {receiptImage ? (
              <div style={{ marginBottom: '16px' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={receiptImage} alt="Receipt" style={{ width: '100%', maxHeight: '300px', objectFit: 'contain', borderRadius: '12px', border: '1px solid #e5e7eb' }} />
                <button onClick={() => { setReceiptImage(null); setReceiptFile(null); fileInputRef.current?.click(); }} style={{ width: '100%', marginTop: '8px', padding: '10px', background: '#f3f4f6', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>
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

            {/* AI Processing Status */}
            {aiProcessing && (
              <div style={{ padding: '16px', background: '#dbeafe', borderRadius: '8px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div className={styles.spinner} />
                  <span style={{ fontWeight: 600 }}>{aiStatus}</span>
                </div>
              </div>
            )}

            {/* Purchased By - keep this since AI can't detect it */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>Purchased By</label>
              <select value={purchasedBy} onChange={(e) => setPurchasedBy(e.target.value)} className={styles.formSelect}>
                <option value="Cristian Kelly">Cristian Kelly</option>
                <option value="Ryan Kelly">Ryan Kelly</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setStep('scan')} style={{ flex: 1, padding: '14px', background: '#f3f4f6', border: 'none', borderRadius: '10px', fontWeight: 600, cursor: 'pointer' }}>Back</button>
              <button onClick={handleProceedToReconcile} disabled={aiProcessing} style={{ flex: 1, padding: '14px', background: '#FF580F', color: '#fff', border: 'none', borderRadius: '10px', fontWeight: 700, cursor: aiProcessing ? 'wait' : 'pointer' }}>
                {aiProcessing ? 'Processing...' : receiptFile ? 'Scan with AI' : 'Skip Receipt'}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: RECONCILIATION */}
        {step === 'reconcile' && (
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>Reconcile Prices</h2>

            {/* AI-detected Store Info (editable) */}
            {(storeName || purchaseDate) && (
              <div style={{ padding: '12px 16px', background: '#f0f9ff', border: '1px solid #0ea5e9', borderRadius: '8px', marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600 }}>Store:</span>
                    <input
                      type="text"
                      value={storeName}
                      onChange={(e) => setStoreName(e.target.value)}
                      style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', width: '120px' }}
                    />
                    {storeNumber && (
                      <input
                        type="text"
                        value={storeNumber}
                        onChange={(e) => setStoreNumber(e.target.value)}
                        style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px', width: '80px' }}
                        placeholder="#"
                      />
                    )}
                    <span style={{ color: '#6b7280' }}>—</span>
                    <span style={{ fontWeight: 600 }}>Date:</span>
                    <input
                      type="date"
                      value={purchaseDate}
                      onChange={(e) => setPurchaseDate(e.target.value)}
                      style={{ padding: '4px 8px', border: '1px solid #d1d5db', borderRadius: '4px', fontSize: '14px' }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* AI Status */}
            {aiStatus && (
              <div style={{ padding: '12px 16px', background: '#f0fdf4', border: '1px solid #22c55e', borderRadius: '8px', marginBottom: '16px' }}>
                <span style={{ fontWeight: 500, color: '#16a34a' }}>{aiStatus}</span>
              </div>
            )}

            {/* AI Notes */}
            {aiNotes && (
              <div style={{ padding: '10px 14px', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#92400e' }}>
                <strong>AI Notes:</strong> {aiNotes}
              </div>
            )}

            {/* Section 1: Matched to Catalog (green) */}
            {(() => {
              const matchedItems = aiParsedItems.filter(i => i.product_id && !i.is_new_product && !i.skipped);
              return matchedItems.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#22c55e' }}>✓</span> Matched to Catalog ({matchedItems.length})
                  </h3>
                  {matchedItems.map((aiItem, idx) => {
                    const product = allProducts.find(p => p.id === aiItem.product_id);
                    const bgColor = aiItem.confidence === 'high' ? '#f0fdf4' : aiItem.confidence === 'medium' ? '#fefce8' : '#fef2f2';
                    const borderColor = aiItem.confidence === 'high' ? '#22c55e' : aiItem.confidence === 'medium' ? '#facc15' : '#f87171';
                    const labelColor = aiItem.confidence === 'high' ? '#16a34a' : aiItem.confidence === 'medium' ? '#ca8a04' : '#dc2626';
                    const label = aiItem.confidence === 'high' ? '✓ High' : aiItem.confidence === 'medium' ? '⚠ Medium' : '? Low';

                    const aliasExists = aliases.some(a =>
                      a.receipt_text.toUpperCase() === aiItem.receipt_text.toUpperCase() && a.product_id === aiItem.product_id
                    );

                    return (
                      <div key={idx} style={{ padding: '12px', background: bgColor, border: `1px solid ${borderColor}`, borderRadius: '10px', marginBottom: '8px' }}>
                        {/* Change Match UI */}
                        {aiItem.changingMatch ? (
                          <div>
                            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                              Change match for: &quot;{aiItem.receipt_text}&quot;
                            </div>
                            <input
                              type="text"
                              placeholder="Search products..."
                              value={productSearchQuery}
                              onChange={(e) => setProductSearchQuery(e.target.value)}
                              className={styles.formInput}
                              style={{ marginBottom: '8px' }}
                              autoFocus
                            />
                            {filteredProducts.length > 0 && (
                              <div style={{ maxHeight: '200px', overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '8px' }}>
                                {filteredProducts.map(p => (
                                  <button
                                    key={p.id}
                                    onClick={() => handleChangeMatch(aiItem, p)}
                                    style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                                  >
                                    {p.brand && <span style={{ fontWeight: 700, fontSize: '10px', color: '#FF580F', textTransform: 'uppercase' }}>{p.brand} </span>}
                                    <span style={{ fontWeight: 500 }}>{p.name}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                            <button
                              onClick={() => {
                                setAiParsedItems(prev => prev.map(item =>
                                  item === aiItem ? { ...item, changingMatch: false } : item
                                ));
                                setProductSearchQuery('');
                              }}
                              style={{ padding: '8px 16px', background: '#f3f4f6', border: 'none', borderRadius: '6px', cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                              <div>
                                <div style={{ fontSize: '12px', color: '#6b7280', fontFamily: 'monospace', marginBottom: '4px' }}>
                                  &quot;{aiItem.receipt_text}&quot; →
                                </div>
                                {product?.brand && <div style={{ fontWeight: 700, fontSize: '11px', color: '#FF580F', textTransform: 'uppercase' }}>{product.brand}</div>}
                                <div style={{ fontWeight: 600 }}>{product?.name || aiItem.parsed_name}</div>
                                {aiItem.reasoning && (
                                  <div style={{ fontSize: '11px', color: '#6366f1', marginTop: '4px', fontStyle: 'italic' }}>
                                    AI: {aiItem.reasoning}
                                  </div>
                                )}
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <span style={{ fontSize: '12px', color: labelColor, fontWeight: 600 }}>{label}</span>
                                <div style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px' }}>${aiItem.price.toFixed(2)}</div>
                                {aiItem.quantity > 1 && <div style={{ fontSize: '11px', color: '#6b7280' }}>x{aiItem.quantity}</div>}
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                              <button
                                onClick={() => {
                                  setAiParsedItems(prev => prev.map((item, i) =>
                                    i === aiParsedItems.indexOf(aiItem) ? { ...item, accepted: true } : item
                                  ));
                                  // Update the scanned item with the price
                                  const existingItem = items.find(i => i.productId === aiItem.product_id);
                                  if (existingItem) {
                                    setItems(prev => prev.map(i =>
                                      i.productId === aiItem.product_id
                                        ? { ...i, unitCost: aiItem.price.toFixed(2), quantity: aiItem.quantity, matchedOcrLine: aiItem.receipt_text, matchConfidence: `ai-${aiItem.confidence}` as const }
                                        : i
                                    ));
                                  } else if (product) {
                                    // Add to items
                                    const newItem: ScannedItem = {
                                      barcode: product.barcode,
                                      name: product.name,
                                      brand: product.brand,
                                      category: product.category,
                                      quantity: aiItem.quantity,
                                      unitCost: aiItem.price.toFixed(2),
                                      productId: product.id,
                                      isNew: false,
                                      matchConfidence: `ai-${aiItem.confidence}` as const,
                                      matchedOcrLine: aiItem.receipt_text,
                                    };
                                    setItems(prev => [...prev, newItem]);
                                  }
                                  // Save alias if not exists
                                  if (!aliasExists && aiItem.product_id && product) {
                                    saveAlias(aiItem.receipt_text, aiItem.product_id, product.name);
                                  }
                                }}
                                disabled={aiItem.accepted}
                                style={{ flex: 1, padding: '8px 12px', background: aiItem.accepted ? '#d1fae5' : '#22c55e', color: aiItem.accepted ? '#065f46' : '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: aiItem.accepted ? 'default' : 'pointer' }}
                              >
                                {aiItem.accepted ? '✓ Accepted' : 'Accept'}
                              </button>
                              {!aiItem.accepted && (
                                <button
                                  onClick={() => {
                                    setAiParsedItems(prev => prev.map(item =>
                                      item === aiItem ? { ...item, changingMatch: true } : item
                                    ));
                                  }}
                                  style={{ padding: '8px 12px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '6px', fontWeight: 500, fontSize: '13px', cursor: 'pointer' }}
                                >
                                  Change
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setAiParsedItems(prev => prev.map((item, i) =>
                                    i === aiParsedItems.indexOf(aiItem) ? { ...item, skipped: true } : item
                                  ));
                                }}
                                disabled={aiItem.accepted || aiItem.skipped}
                                style={{ padding: '8px 12px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '6px', fontWeight: 500, fontSize: '13px', cursor: 'pointer' }}
                              >
                                Skip
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Section 2: New Products Detected (blue) */}
            {(() => {
              const newProducts = aiParsedItems.filter(i => i.is_new_product && !i.skipped && !i.accepted);
              return newProducts.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#3b82f6' }}>🆕</span> New Products Detected ({newProducts.length})
                  </h3>
                  {newProducts.map((aiItem, idx) => (
                    <div key={idx} style={{ padding: '12px', background: '#dbeafe', border: '1px solid #3b82f6', borderRadius: '10px', marginBottom: '8px' }}>
                      {/* Inline New Product Form */}
                      {aiItem.editingNewProduct ? (
                        <div>
                          <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '12px' }}>
                            Adding: &quot;{aiItem.receipt_text}&quot;
                          </div>

                          <div style={{ display: 'grid', gap: '10px' }}>
                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '4px', color: '#374151' }}>Brand</label>
                              <input
                                type="text"
                                value={newProductForm.brand}
                                onChange={(e) => setNewProductForm(prev => ({ ...prev, brand: e.target.value }))}
                                placeholder="e.g., Monster Energy"
                                className={styles.formInput}
                                style={{ padding: '8px 10px', fontSize: '14px' }}
                              />
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '4px', color: '#374151' }}>Product Name *</label>
                              <input
                                type="text"
                                value={newProductForm.name}
                                onChange={(e) => setNewProductForm(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="e.g., Zero Sugar Ultra"
                                className={styles.formInput}
                                style={{ padding: '8px 10px', fontSize: '14px' }}
                              />
                            </div>

                            <div>
                              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '4px', color: '#374151' }}>Category</label>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {CATEGORY_OPTIONS.map(cat => (
                                  <button
                                    key={cat}
                                    onClick={() => setNewProductForm(prev => ({ ...prev, category: cat }))}
                                    style={{
                                      padding: '6px 12px',
                                      background: newProductForm.category === cat ? '#3b82f6' : '#f3f4f6',
                                      color: newProductForm.category === cat ? '#fff' : '#374151',
                                      border: 'none',
                                      borderRadius: '6px',
                                      fontSize: '12px',
                                      fontWeight: 500,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    {cat}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: '10px' }}>
                              <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '4px', color: '#374151' }}>Barcode</label>
                                <input
                                  type="text"
                                  value={newProductForm.barcode}
                                  onChange={(e) => setNewProductForm(prev => ({ ...prev, barcode: e.target.value }))}
                                  placeholder="Optional"
                                  className={styles.formInput}
                                  style={{ padding: '8px 10px', fontSize: '14px' }}
                                />
                              </div>
                              <div style={{ width: '100px' }}>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, marginBottom: '4px', color: '#374151' }}>Price</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={newProductForm.price}
                                  onChange={(e) => setNewProductForm(prev => ({ ...prev, price: e.target.value }))}
                                  className={styles.formInput}
                                  style={{ padding: '8px 10px', fontSize: '14px' }}
                                />
                              </div>
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                            <button
                              onClick={() => {
                                setAiParsedItems(prev => prev.map(item =>
                                  item === aiItem ? { ...item, editingNewProduct: false } : item
                                ));
                                setNewProductForm({ brand: '', name: '', category: '', barcode: '', price: '' });
                              }}
                              style={{ padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '6px', fontWeight: 500, cursor: 'pointer' }}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleCreateNewProduct(aiItem)}
                              disabled={!newProductForm.name.trim()}
                              style={{ flex: 1, padding: '8px 16px', background: newProductForm.name.trim() ? '#22c55e' : '#d1d5db', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: newProductForm.name.trim() ? 'pointer' : 'not-allowed' }}
                            >
                              Save & Match
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                            <div>
                              <div style={{ fontSize: '12px', color: '#6b7280', fontFamily: 'monospace', marginBottom: '4px' }}>
                                &quot;{aiItem.receipt_text}&quot;
                              </div>
                              {aiItem.suggested_brand && <div style={{ fontWeight: 700, fontSize: '11px', color: '#1d4ed8', textTransform: 'uppercase' }}>{aiItem.suggested_brand}</div>}
                              <div style={{ fontWeight: 600, color: '#1d4ed8' }}>{aiItem.parsed_name}</div>
                              {aiItem.suggested_category && (
                                <div style={{ fontSize: '11px', color: '#374151', marginTop: '4px' }}>
                                  Category: {aiItem.suggested_category}
                                </div>
                              )}
                              {aiItem.barcode && (
                                <div style={{ fontSize: '11px', color: '#374151', marginTop: '4px' }}>
                                  Barcode: <span style={{ fontFamily: 'monospace' }}>{aiItem.barcode}</span>
                                </div>
                              )}
                              {aiItem.reasoning && (
                                <div style={{ fontSize: '11px', color: '#6366f1', marginTop: '4px', fontStyle: 'italic' }}>
                                  AI: {aiItem.reasoning}
                                </div>
                              )}
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              <div style={{ fontSize: '18px', fontWeight: 700, color: '#1d4ed8' }}>${aiItem.price.toFixed(2)}</div>
                              {aiItem.quantity > 1 && <div style={{ fontSize: '11px', color: '#6b7280' }}>x{aiItem.quantity}</div>}
                            </div>
                          </div>

                          <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                            <button
                              onClick={() => {
                                setAiParsedItems(prev => prev.map(item =>
                                  item === aiItem ? { ...item, skipped: true } : item
                                ));
                              }}
                              style={{ padding: '8px 12px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '6px', fontWeight: 500, fontSize: '13px', cursor: 'pointer' }}
                            >
                              Skip
                            </button>
                            <button
                              onClick={() => {
                                setAiParsedItems(prev => prev.map(item =>
                                  item === aiItem ? { ...item, changingMatch: true } : item
                                ));
                              }}
                              style={{ padding: '8px 12px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '6px', fontWeight: 500, fontSize: '13px', cursor: 'pointer' }}
                            >
                              Match Existing
                            </button>
                            <button
                              style={{ flex: 1, padding: '8px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                              onClick={() => {
                                // Pre-fill form with AI suggestions
                                setNewProductForm({
                                  brand: aiItem.suggested_brand || '',
                                  name: aiItem.parsed_name || '',
                                  category: aiItem.suggested_category || '',
                                  barcode: aiItem.barcode || '',
                                  price: aiItem.price.toFixed(2),
                                });
                                setAiParsedItems(prev => prev.map(item =>
                                  item === aiItem ? { ...item, editingNewProduct: true } : item
                                ));
                              }}
                            >
                              Add to Catalog
                            </button>
                          </div>

                          {/* Change Match UI for new products */}
                          {aiItem.changingMatch && (
                            <div style={{ marginTop: '12px', padding: '12px', background: '#fff', borderRadius: '8px' }}>
                              <input
                                type="text"
                                placeholder="Search existing products..."
                                value={productSearchQuery}
                                onChange={(e) => setProductSearchQuery(e.target.value)}
                                className={styles.formInput}
                                style={{ marginBottom: '8px' }}
                                autoFocus
                              />
                              {filteredProducts.length > 0 && (
                                <div style={{ maxHeight: '150px', overflow: 'auto', border: '1px solid #e5e7eb', borderRadius: '8px', marginBottom: '8px' }}>
                                  {filteredProducts.map(p => (
                                    <button
                                      key={p.id}
                                      onClick={() => handleChangeMatch(aiItem, p)}
                                      style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }}
                                    >
                                      {p.brand && <span style={{ fontWeight: 700, fontSize: '10px', color: '#FF580F', textTransform: 'uppercase' }}>{p.brand} </span>}
                                      <span style={{ fontWeight: 500 }}>{p.name}</span>
                                    </button>
                                  ))}
                                </div>
                              )}
                              <button
                                onClick={() => {
                                  setAiParsedItems(prev => prev.map(item =>
                                    item === aiItem ? { ...item, changingMatch: false } : item
                                  ));
                                  setProductSearchQuery('');
                                }}
                                style={{ padding: '6px 12px', background: '#f3f4f6', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px' }}
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Section 3: Scanned but Not on Receipt */}
            {(() => {
              const unmatchedScanned = items.filter(item => {
                const matchedByAI = aiParsedItems.some(ai => ai.product_id === item.productId && !ai.skipped);
                return !matchedByAI && !item.unitCost;
              });
              return unmatchedScanned.length > 0 && (
                <div style={{ marginBottom: '24px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: '#374151', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ color: '#dc2626' }}>!</span> Scanned but Not Found on Receipt ({unmatchedScanned.length})
                  </h3>
                  {unmatchedScanned.map((item) => (
                    <div key={item.barcode} style={{ padding: '12px', background: '#fef2f2', border: '1px solid #dc2626', borderRadius: '10px', marginBottom: '8px' }}>
                      <div style={{ marginBottom: '8px' }}>
                        {item.brand && <div style={{ fontWeight: 700, fontSize: '11px', color: '#FF580F', textTransform: 'uppercase' }}>{item.brand}</div>}
                        <div style={{ fontWeight: 600 }}>{item.name}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Qty: {item.quantity}</div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>$</span>
                        <input type="number" step="0.01" value={item.unitCost} onChange={(e) => updatePrice(item.barcode, e.target.value)} placeholder="Enter price manually" className={styles.formInput} style={{ flex: 1, borderColor: '#dc2626' }} />
                        <span style={{ color: '#6b7280', fontSize: '13px' }}>each</span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* Section 4: Totals Check - Fixed math */}
            {(aiTotal || receiptTotalNum > 0 || calculatedTotal > 0) && (
              <div style={{ padding: '16px', background: difference < 1 ? '#f0fdf4' : '#fef3c7', border: `1px solid ${difference < 1 ? '#22c55e' : '#f59e0b'}`, borderRadius: '10px', marginBottom: '24px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Totals Check</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Receipt Total (from receipt):</span>
                  <span style={{ fontWeight: 600 }}>${receiptTotalNum.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span>Matched Items (calculated):</span>
                  <span style={{ fontWeight: 600 }}>${calculatedTotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid #e5e7eb' }}>
                  <span>Difference:</span>
                  <span style={{ fontWeight: 600, color: difference < 1 ? '#16a34a' : '#f59e0b' }}>
                    ${difference.toFixed(2)} {difference > 0 && difference < 2 ? '(likely tax/rounding)' : ''}
                  </span>
                </div>
                {difference >= 2 && (
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
              <div><strong>Store:</strong> {storeName}{storeNumber ? ` ${storeNumber}` : ''}</div>
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
