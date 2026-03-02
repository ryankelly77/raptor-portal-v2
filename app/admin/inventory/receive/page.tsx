'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AdminShell } from '../../components/AdminShell';
import { BarcodeScanner } from '../components/BarcodeScanner';
import { BarcodeLookup } from '../components/BarcodeLookup';
import styles from '../inventory.module.css';

interface ScannedItem {
  barcode: string;
  name: string;
  brand: string | null;
  category: string;
  quantity: number;
  unitCost: string;
  productId?: string;
  isNew?: boolean;
}

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('adminToken') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function ReceiveItemsPage() {
  const router = useRouter();
  const [step, setStep] = useState<'info' | 'scan' | 'review' | 'receipt' | 'verify'>('info');
  const [purchaseInfo, setPurchaseInfo] = useState({
    purchasedBy: 'Cristian Kelly',
    storeName: "Sam's",
    purchaseDate: new Date().toISOString().split('T')[0],
  });
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [currentBarcode, setCurrentBarcode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [receiptImageUrl, setReceiptImageUrl] = useState<string | null>(null);
  const [receiptTotal, setReceiptTotal] = useState('');
  const [receiptUploading, setReceiptUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleStartScanning() {
    setStep('scan');
  }

  function handleScan(barcode: string) {
    // Check if already in list
    const existing = items.find(i => i.barcode === barcode);
    if (existing) {
      setItems(items.map(i =>
        i.barcode === barcode ? { ...i, quantity: i.quantity + 1 } : i
      ));
      setCurrentBarcode(null);
    } else {
      setCurrentBarcode(barcode);
    }
  }

  function handleLookupResult(result: { found: boolean; source: string; product: { barcode: string; name: string; brand: string | null; category: string }; existingProduct?: { id: string } }) {
    const newItem: ScannedItem = {
      barcode: result.product.barcode,
      name: result.product.name,
      brand: result.product.brand,
      category: result.product.category,
      quantity: 1,
      unitCost: '',
      productId: result.existingProduct?.id,
      isNew: !result.found,
    };
    setItems([...items, newItem]);
    setCurrentBarcode(null);
  }

  function updateItemQuantity(barcode: string, qty: number) {
    if (qty <= 0) {
      setItems(items.filter(i => i.barcode !== barcode));
    } else {
      setItems(items.map(i => i.barcode === barcode ? { ...i, quantity: qty } : i));
    }
  }

  function updateItemCost(barcode: string, cost: string) {
    setItems(items.map(i => i.barcode === barcode ? { ...i, unitCost: cost } : i));
  }

  function removeItem(barcode: string) {
    setItems(items.filter(i => i.barcode !== barcode));
  }

  async function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setReceiptUploading(true);
    try {
      // Upload the file
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'receipts');

      const token = sessionStorage.getItem('adminToken');
      const uploadRes = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: formData,
      });
      const uploadData = await uploadRes.json();

      if (uploadData.url) {
        setReceiptImageUrl(uploadData.url);
        setStep('verify');
      } else {
        alert('Failed to upload receipt');
      }
    } catch (err) {
      console.error('Error uploading receipt:', err);
      alert('Error uploading receipt');
    } finally {
      setReceiptUploading(false);
    }
  }

  async function handleSaveAll() {
    if (items.length === 0) {
      alert('No items to save');
      return;
    }

    if (!receiptTotal) {
      alert('Please enter the receipt total');
      return;
    }

    setSaving(true);
    try {
      // 1. Create the purchase record with receipt info
      const purchaseRes = await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'inventory_purchases',
          action: 'create',
          data: {
            purchased_by: purchaseInfo.purchasedBy,
            store_name: purchaseInfo.storeName,
            purchase_date: purchaseInfo.purchaseDate,
            receipt_image_url: receiptImageUrl,
            receipt_total: parseFloat(receiptTotal),
            status: 'verified',
          },
        }),
      });
      const purchaseData = await purchaseRes.json();
      const purchaseId = purchaseData.data?.id;

      if (!purchaseId) {
        throw new Error('Failed to create purchase record');
      }

      // 2. For each item, create purchase_item and movement
      for (const item of items) {
        let productId = item.productId;

        // If new product, create it first
        if (!productId) {
          const productRes = await fetch('/api/admin/crud', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              table: 'products',
              action: 'create',
              data: {
                barcode: item.barcode,
                name: item.name,
                brand: item.brand,
                category: item.category,
                default_price: item.unitCost ? parseFloat(item.unitCost) : null,
              },
            }),
          });
          const productData = await productRes.json();
          productId = productData.data?.id;
        }

        if (!productId) continue;

        // Create purchase item
        await fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
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
        await fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            table: 'inventory_movements',
            action: 'create',
            data: {
              product_id: productId,
              quantity: item.quantity,
              movement_type: 'purchase_in',
              moved_by: purchaseInfo.purchasedBy,
              notes: `Received from ${purchaseInfo.storeName}`,
            },
          }),
        });
      }

      alert('Purchase saved successfully!');
      router.push('/admin/inventory');
    } catch (err) {
      console.error('Error saving purchase:', err);
      alert('Error saving purchase');
    } finally {
      setSaving(false);
    }
  }

  const totalItemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <AdminShell title="Receive Items">
      <div className={styles.inventoryPage}>
        <div className={styles.testPage}>
          {/* Step 1: Purchase Info */}
          {step === 'info' && (
            <div className={styles.testCard}>
              <div className={styles.testHeader}>
                <h2 className={styles.testTitle}>Purchase Details</h2>
                <p className={styles.testSubtitle}>Enter info about this purchase</p>
              </div>
              <div className={styles.testBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Purchased By</label>
                  <select
                    className={styles.formSelect}
                    value={purchaseInfo.purchasedBy}
                    onChange={(e) => setPurchaseInfo({ ...purchaseInfo, purchasedBy: e.target.value })}
                  >
                    <option value="Cristian Kelly">Cristian Kelly</option>
                    <option value="Ryan Kelly">Ryan Kelly</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Store</label>
                  <select
                    className={styles.formSelect}
                    value={purchaseInfo.storeName}
                    onChange={(e) => setPurchaseInfo({ ...purchaseInfo, storeName: e.target.value })}
                  >
                    <option value="Sam's">Sam&apos;s</option>
                    <option value="Walmart">Walmart</option>
                    <option value="Costco">Costco</option>
                    <option value="Amazon">Amazon</option>
                    <option value="HEB">HEB</option>
                  </select>
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Purchase Date</label>
                  <input
                    type="date"
                    className={styles.formInput}
                    value={purchaseInfo.purchaseDate}
                    onChange={(e) => setPurchaseInfo({ ...purchaseInfo, purchaseDate: e.target.value })}
                  />
                </div>
              </div>
              <div className={styles.testFooter}>
                <button className={styles.btnPrimary} onClick={handleStartScanning} style={{ width: '100%' }}>
                  Start Scanning Items
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Scan Items */}
          {step === 'scan' && (
            <div className={styles.testCard}>
              <div className={styles.testHeader}>
                <h2 className={styles.testTitle}>Scan Items</h2>
                <p className={styles.testSubtitle}>{items.length} items scanned</p>
              </div>
              <div className={styles.testBody}>
                {!currentBarcode ? (
                  <BarcodeScanner onScan={handleScan} />
                ) : (
                  <BarcodeLookup
                    barcode={currentBarcode}
                    onResult={handleLookupResult}
                  />
                )}

                {/* Scanned Items List */}
                {items.length > 0 && (
                  <div style={{ marginTop: '20px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
                      Scanned Items ({items.length})
                    </h3>
                    {items.map((item) => (
                      <div key={item.barcode} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px',
                        background: '#f9fafb',
                        borderRadius: '8px',
                        marginBottom: '8px',
                      }}>
                        <div style={{ flex: 1 }}>
                          {item.brand && (
                            <div style={{ fontWeight: 700, fontSize: '11px', color: '#FF580F', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.brand}</div>
                          )}
                          <div style={{ fontWeight: 600, fontSize: '14px' }}>{item.name}</div>
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>{item.barcode}</div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <button
                            onClick={() => updateItemQuantity(item.barcode, item.quantity - 1)}
                            style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
                          >
                            -
                          </button>
                          <span style={{ fontWeight: 600, minWidth: '24px', textAlign: 'center' }}>{item.quantity}</span>
                          <button
                            onClick={() => updateItemQuantity(item.barcode, item.quantity + 1)}
                            style={{ width: '32px', height: '32px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' }}
                          >
                            +
                          </button>
                        </div>
                        <button
                          onClick={() => removeItem(item.barcode)}
                          style={{ color: '#dc2626', background: 'none', border: 'none', padding: '8px', cursor: 'pointer' }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className={styles.testFooter} style={{ display: 'flex', gap: '12px' }}>
                <button className={styles.btnSecondary} onClick={() => setStep('info')} style={{ flex: 1 }}>
                  Back
                </button>
                <button
                  className={styles.btnPrimary}
                  onClick={() => setStep('review')}
                  disabled={items.length === 0}
                  style={{ flex: 1 }}
                >
                  Review ({items.length})
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Review Items */}
          {step === 'review' && (
            <div className={styles.testCard}>
              <div className={styles.testHeader}>
                <h2 className={styles.testTitle}>Review Items</h2>
                <p className={styles.testSubtitle}>
                  {purchaseInfo.storeName} • {purchaseInfo.purchaseDate}
                </p>
              </div>
              <div className={styles.testBody}>
                <div style={{ marginBottom: '20px', padding: '12px', background: '#f3f4f6', borderRadius: '8px' }}>
                  <div><strong>Purchased by:</strong> {purchaseInfo.purchasedBy}</div>
                  <div><strong>Store:</strong> {purchaseInfo.storeName}</div>
                  <div><strong>Total Items:</strong> {totalItemCount}</div>
                </div>

                {items.map((item) => (
                  <div key={item.barcode} style={{
                    padding: '12px',
                    background: '#f9fafb',
                    borderRadius: '8px',
                    marginBottom: '8px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div>
                        {item.brand && (
                          <div style={{ fontWeight: 700, fontSize: '11px', color: '#FF580F', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{item.brand}</div>
                        )}
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{item.name}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Qty: {item.quantity}</div>
                      </div>
                      {item.isNew && (
                        <span style={{ fontSize: '11px', background: '#fef3c7', color: '#d97706', padding: '2px 8px', borderRadius: '4px', height: 'fit-content' }}>
                          NEW
                        </span>
                      )}
                    </div>
                    <div className={styles.formGroup} style={{ marginBottom: 0 }}>
                      <label className={styles.formLabel}>Unit Cost (optional)</label>
                      <input
                        type="number"
                        step="0.01"
                        className={styles.formInput}
                        value={item.unitCost}
                        onChange={(e) => updateItemCost(item.barcode, e.target.value)}
                        placeholder="0.00"
                        style={{ padding: '10px 12px' }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className={styles.testFooter} style={{ display: 'flex', gap: '12px' }}>
                <button className={styles.btnSecondary} onClick={() => setStep('scan')} style={{ flex: 1 }}>
                  Back
                </button>
                <button
                  className={styles.btnPrimary}
                  onClick={() => setStep('receipt')}
                  style={{ flex: 1 }}
                >
                  Take Receipt Photo
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Receipt Photo */}
          {step === 'receipt' && (
            <div className={styles.testCard}>
              <div className={styles.testHeader}>
                <h2 className={styles.testTitle}>Receipt Photo</h2>
                <p className={styles.testSubtitle}>Take a photo of the receipt</p>
              </div>
              <div className={styles.testBody}>
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <div style={{
                    width: '100px',
                    height: '100px',
                    margin: '0 auto 20px',
                    background: '#f3f4f6',
                    borderRadius: '12px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  </div>

                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    ref={fileInputRef}
                    onChange={handleReceiptUpload}
                    style={{ display: 'none' }}
                  />

                  <button
                    className={styles.btnPrimary}
                    onClick={() => fileInputRef.current?.click()}
                    disabled={receiptUploading}
                    style={{ width: '100%' }}
                  >
                    {receiptUploading ? 'Uploading...' : '📷 Take Photo'}
                  </button>

                  <p style={{ color: '#6b7280', fontSize: '13px', marginTop: '16px' }}>
                    Make sure the total is visible in the photo
                  </p>
                </div>
              </div>
              <div className={styles.testFooter}>
                <button className={styles.btnSecondary} onClick={() => setStep('review')} style={{ width: '100%' }}>
                  Back
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Verify Total */}
          {step === 'verify' && (
            <div className={styles.testCard}>
              <div className={styles.testHeader}>
                <h2 className={styles.testTitle}>Verify Receipt Total</h2>
                <p className={styles.testSubtitle}>Confirm the receipt total</p>
              </div>
              <div className={styles.testBody}>
                {/* Receipt Preview */}
                {receiptImageUrl && (
                  <div style={{ marginBottom: '20px', borderRadius: '12px', overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={receiptImageUrl}
                      alt="Receipt"
                      style={{ width: '100%', maxHeight: '300px', objectFit: 'contain', background: '#f9fafb' }}
                    />
                  </div>
                )}

                {/* Summary */}
                <div style={{ marginBottom: '20px', padding: '12px', background: '#f3f4f6', borderRadius: '8px' }}>
                  <div><strong>Store:</strong> {purchaseInfo.storeName}</div>
                  <div><strong>Date:</strong> {purchaseInfo.purchaseDate}</div>
                  <div><strong>Items:</strong> {totalItemCount}</div>
                </div>

                {/* Total Input */}
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Receipt Total *</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280', fontSize: '18px' }}>$</span>
                    <input
                      type="number"
                      step="0.01"
                      className={styles.formInput}
                      value={receiptTotal}
                      onChange={(e) => setReceiptTotal(e.target.value)}
                      placeholder="0.00"
                      style={{ paddingLeft: '32px', fontSize: '24px', fontWeight: 600, textAlign: 'right' }}
                      autoFocus
                    />
                  </div>
                </div>

                {/* Retake Photo Option */}
                <button
                  className={styles.btnSecondary}
                  onClick={() => {
                    setReceiptImageUrl(null);
                    setStep('receipt');
                  }}
                  style={{ width: '100%', marginTop: '8px' }}
                >
                  Retake Photo
                </button>
              </div>
              <div className={styles.testFooter} style={{ display: 'flex', gap: '12px' }}>
                <button className={styles.btnSecondary} onClick={() => setStep('receipt')} style={{ flex: 1 }}>
                  Back
                </button>
                <button
                  className={styles.btnPrimary}
                  onClick={handleSaveAll}
                  disabled={saving || !receiptTotal}
                  style={{ flex: 1 }}
                >
                  {saving ? 'Saving...' : 'Save Purchase'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
