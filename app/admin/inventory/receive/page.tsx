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
  const [step, setStep] = useState<'info' | 'scan' | 'review' | 'receipt'>('info');
  const [purchaseInfo, setPurchaseInfo] = useState({
    purchasedBy: 'Cristian Kelly',
    storeName: "Sam's",
    purchaseDate: new Date().toISOString().split('T')[0],
  });
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [currentBarcode, setCurrentBarcode] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedPurchaseId, setSavedPurchaseId] = useState<string | null>(null);
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

  function handleLookupResult(result: { found: boolean; source: string; product: { barcode: string; name: string; category: string }; existingProduct?: { id: string } }) {
    const newItem: ScannedItem = {
      barcode: result.product.barcode,
      name: result.product.name,
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

  async function handleSavePurchase() {
    if (items.length === 0) {
      alert('No items to save');
      return;
    }

    setSaving(true);
    try {
      // 1. Create the purchase record
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
            status: 'pending',
          },
        }),
      });
      const purchaseData = await purchaseRes.json();
      const purchaseId = purchaseData.data?.id;

      if (!purchaseId) {
        throw new Error('Failed to create purchase record');
      }

      setSavedPurchaseId(purchaseId);

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

      // Move to receipt photo step
      setStep('receipt');
    } catch (err) {
      console.error('Error saving purchase:', err);
      alert('Error saving purchase');
    } finally {
      setSaving(false);
    }
  }

  async function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !savedPurchaseId) return;

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
        // Update the purchase record with receipt URL
        await fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            table: 'inventory_purchases',
            action: 'update',
            id: savedPurchaseId,
            data: {
              receipt_image_url: uploadData.url,
              status: 'verified',
            },
          }),
        });

        alert('Receipt uploaded successfully!');
        router.push('/admin/inventory');
      }
    } catch (err) {
      console.error('Error uploading receipt:', err);
      alert('Error uploading receipt');
    } finally {
      setReceiptUploading(false);
    }
  }

  function handleSkipReceipt() {
    router.push('/admin/inventory');
  }

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

          {/* Step 3: Review & Save */}
          {step === 'review' && (
            <div className={styles.testCard}>
              <div className={styles.testHeader}>
                <h2 className={styles.testTitle}>Review Purchase</h2>
                <p className={styles.testSubtitle}>
                  {purchaseInfo.storeName} • {purchaseInfo.purchaseDate}
                </p>
              </div>
              <div className={styles.testBody}>
                <div style={{ marginBottom: '20px', padding: '12px', background: '#f3f4f6', borderRadius: '8px' }}>
                  <div><strong>Purchased by:</strong> {purchaseInfo.purchasedBy}</div>
                  <div><strong>Store:</strong> {purchaseInfo.storeName}</div>
                </div>

                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
                  Items ({items.reduce((sum, i) => sum + i.quantity, 0)} total)
                </h3>
                {items.map((item) => (
                  <div key={item.barcode} style={{
                    padding: '12px',
                    background: '#f9fafb',
                    borderRadius: '8px',
                    marginBottom: '8px',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div>
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
                  onClick={handleSavePurchase}
                  disabled={saving}
                  style={{ flex: 1 }}
                >
                  {saving ? 'Saving...' : 'Save Purchase'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Receipt Photo */}
          {step === 'receipt' && (
            <div className={styles.testCard}>
              <div className={styles.testHeader}>
                <h2 className={styles.testTitle}>Receipt Photo</h2>
                <p className={styles.testSubtitle}>Take a photo of the receipt for records</p>
              </div>
              <div className={styles.testBody}>
                <div style={{ textAlign: 'center', padding: '20px' }}>
                  <div style={{
                    width: '80px',
                    height: '80px',
                    margin: '0 auto 20px',
                    background: '#dcfce7',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <h3 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '8px', color: '#16a34a' }}>
                    Purchase Saved!
                  </h3>
                  <p style={{ color: '#6b7280', marginBottom: '24px' }}>
                    {items.reduce((sum, i) => sum + i.quantity, 0)} items added to inventory
                  </p>

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
                    style={{ width: '100%', marginBottom: '12px' }}
                  >
                    {receiptUploading ? 'Uploading...' : '📷 Take Receipt Photo'}
                  </button>
                </div>
              </div>
              <div className={styles.testFooter}>
                <button className={styles.btnSecondary} onClick={handleSkipReceipt} style={{ width: '100%' }}>
                  Skip for Now
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
