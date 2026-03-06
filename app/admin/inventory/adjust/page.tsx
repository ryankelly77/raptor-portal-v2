'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AdminShell } from '../../components/AdminShell';
import { adminFetch, AuthError } from '@/lib/admin-fetch';
import styles from '../inventory.module.css';

// Force dynamic rendering - required for useSearchParams
export const dynamic = 'force-dynamic';

interface Product {
  id: string;
  name: string;
  brand: string | null;
  barcode: string;
  category: string;
  units_per_package?: number;
  unit_name?: string;
}

interface Movement {
  id: string;
  product_id: string;
  quantity: number;
  movement_type: string;
  notes: string | null;
  created_at: string;
  expiration_date?: string | null;
}

// Wrapper component to handle Suspense for useSearchParams
export default function AdjustPage() {
  return (
    <Suspense fallback={
      <AdminShell title="Adjust Inventory">
        <div className={styles.inventoryPage}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
          </div>
        </div>
      </AdminShell>
    }>
      <AdjustPageContent />
    </Suspense>
  );
}

function AdjustPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const productId = searchParams.get('product');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<string>(productId || '');
  const [adjustmentType, setAdjustmentType] = useState<'add' | 'remove' | 'set'>('remove');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Calculate on-hand qty for selected product
  const [onHandQty, setOnHandQty] = useState(0);

  // Purchase items for FIFO calculation
  const [purchaseItems, setPurchaseItems] = useState<{ id: string; product_id: string; quantity: number }[]>([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [productsRes, movementsRes, purchaseItemsRes] = await Promise.all([
        adminFetch('/api/admin/crud', {
          method: 'POST',
          body: JSON.stringify({ table: 'products', action: 'read' }),
        }),
        adminFetch('/api/admin/crud', {
          method: 'POST',
          body: JSON.stringify({ table: 'inventory_movements', action: 'read' }),
        }),
        adminFetch('/api/admin/crud', {
          method: 'POST',
          body: JSON.stringify({ table: 'inventory_purchase_items', action: 'read' }),
        }),
      ]);

      const productsData = await productsRes.json();
      const movementsData = await movementsRes.json();
      const purchaseItemsData = await purchaseItemsRes.json();

      setProducts(productsData.data || []);
      setMovements(movementsData.data || []);
      setPurchaseItems(purchaseItemsData.data || []);
    } catch (err) {
      if (!(err instanceof AuthError)) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Calculate on-hand when product changes (FIFO: from purchase_items minus outbound movements)
  useEffect(() => {
    if (!selectedProduct) {
      setOnHandQty(0);
      return;
    }

    const product = products.find(p => p.id === selectedProduct);
    const unitsPerPkg = product?.units_per_package || 1;

    // Sum all purchase items for this product
    // pi.quantity is PACKAGES, convert to units
    let totalReceived = 0;
    for (const pi of purchaseItems) {
      if (pi.product_id === selectedProduct) {
        totalReceived += pi.quantity * unitsPerPkg;
      }
    }

    // Subtract outbound movements (already in units)
    let totalOut = 0;
    for (const m of movements) {
      if (m.product_id !== selectedProduct) continue;

      switch (m.movement_type) {
        case 'restock_out':
          totalOut += Math.abs(m.quantity); // Already in units
          break;
        case 'shrinkage':
          totalOut += Math.abs(m.quantity); // Already in units
          break;
      }
    }

    setOnHandQty(Math.max(0, totalReceived - totalOut));
  }, [selectedProduct, movements, products, purchaseItems]);

  const handleSubmit = async () => {
    if (!selectedProduct || !quantity) {
      setError('Please select a product and enter a quantity');
      return;
    }

    const qtyNum = parseInt(quantity);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      setError('Quantity must be a positive number');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      let adjustmentQty = 0;
      let movementType = 'adjustment';
      let notes = reason || 'Manual adjustment';

      switch (adjustmentType) {
        case 'add':
          adjustmentQty = qtyNum;
          notes = `Added ${qtyNum} units: ${notes}`;
          break;
        case 'remove':
          adjustmentQty = -qtyNum;
          movementType = 'shrinkage';
          notes = `Removed ${qtyNum} units: ${notes}`;
          break;
        case 'set':
          // Calculate difference from current on-hand
          adjustmentQty = qtyNum - onHandQty;
          notes = `Set to ${qtyNum} units (was ${onHandQty}): ${notes}`;
          break;
      }

      if (adjustmentQty === 0) {
        setError('No change needed - quantity is already correct');
        setSaving(false);
        return;
      }

      const res = await adminFetch('/api/admin/crud', {
        method: 'POST',
        body: JSON.stringify({
          table: 'inventory_movements',
          action: 'create',
          data: {
            product_id: selectedProduct,
            quantity: adjustmentQty,
            movement_type: movementType,
            moved_by: 'Admin',
            notes: notes,
            reason: adjustmentType === 'remove' ? (reason || 'shrinkage') : null,
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to create adjustment');
      }

      setSuccess(`Inventory adjusted successfully! ${adjustmentQty > 0 ? '+' : ''}${adjustmentQty} units`);
      setQuantity('');
      setReason('');
      loadData();

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to adjust inventory');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteMovement = async (movementId: string) => {
    if (!confirm('Are you sure you want to delete this movement? This will affect inventory counts.')) {
      return;
    }

    try {
      const res = await adminFetch('/api/admin/crud', {
        method: 'POST',
        body: JSON.stringify({
          table: 'inventory_movements',
          action: 'delete',
          id: movementId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to delete movement');
      }

      setSuccess('Movement deleted successfully');
      loadData();

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete movement');
    }
  };

  const selectedProductData = products.find(p => p.id === selectedProduct);
  const productMovements = movements
    .filter(m => m.product_id === selectedProduct)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 10);

  if (loading) {
    return (
      <AdminShell title="Adjust Inventory">
        <div className={styles.inventoryPage}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Adjust Inventory">
      <div className={styles.inventoryPage}>
        <Link href="/admin/inventory" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#6b7280', fontSize: '14px', marginBottom: '16px', textDecoration: 'none' }}>
          ← Back to Inventory
        </Link>

        {/* Error/Success Messages */}
        {error && (
          <div style={{ background: '#fef2f2', color: '#dc2626', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
            {error}
          </div>
        )}
        {success && (
          <div style={{ background: '#f0fdf4', color: '#16a34a', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
            {success}
          </div>
        )}

        {/* Adjustment Form */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Adjust Inventory</h2>
          </div>
          <div className={styles.sectionBody}>
            {/* Product Selection */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>
                Select Product
              </label>
              <select
                value={selectedProduct}
                onChange={(e) => setSelectedProduct(e.target.value)}
                className={styles.formSelect}
                style={{ width: '100%', padding: '12px', fontSize: '14px' }}
              >
                <option value="">Choose a product...</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.brand ? `${p.brand} - ` : ''}{p.name}
                  </option>
                ))}
              </select>
            </div>

            {selectedProductData && (
              <>
                {/* Current Stock Display */}
                <div style={{ padding: '12px', background: '#f3f4f6', borderRadius: '8px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#6b7280' }}>Current On-Hand:</span>
                    <span style={{ fontSize: '24px', fontWeight: 700, color: '#FF580F' }}>{onHandQty} units</span>
                  </div>
                </div>

                {/* Delete Product Button - only show if 0 inventory */}
                {onHandQty === 0 && (
                  <button
                    onClick={async () => {
                      try {
                        // Check for related records first
                        const [movementsRes, purchaseItemsRes] = await Promise.all([
                          adminFetch('/api/admin/crud', {
                            method: 'POST',
                            body: JSON.stringify({ table: 'inventory_movements', action: 'read', filters: { product_id: selectedProduct } }),
                          }),
                          adminFetch('/api/admin/crud', {
                            method: 'POST',
                            body: JSON.stringify({ table: 'inventory_purchase_items', action: 'read', filters: { product_id: selectedProduct } }),
                          }),
                        ]);
                        const movementsData = await movementsRes.json();
                        const purchaseItemsData = await purchaseItemsRes.json();
                        const movementCount = movementsData.data?.length || 0;
                        const purchaseItemCount = purchaseItemsData.data?.length || 0;

                        if (movementCount > 0 || purchaseItemCount > 0) {
                          alert(`Cannot delete: This product has ${movementCount} movement records and ${purchaseItemCount} purchase item records.\n\nDelete these records first in Supabase if you really want to remove this product.`);
                          return;
                        }

                        if (!confirm(`Delete "${selectedProductData.brand ? selectedProductData.brand + ' - ' : ''}${selectedProductData.name}"?\n\nThis cannot be undone.`)) return;

                        const res = await adminFetch('/api/admin/crud', {
                          method: 'POST',
                          body: JSON.stringify({
                            table: 'products',
                            action: 'delete',
                            id: selectedProduct,
                          }),
                        });
                        if (!res.ok) {
                          const errData = await res.json();
                          throw new Error(errData.error || 'Failed to delete');
                        }
                        setSuccess('Product deleted');
                        setSelectedProduct('');
                        loadData();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'Failed to delete product');
                      }
                    }}
                    style={{
                      width: '100%',
                      padding: '12px',
                      marginBottom: '16px',
                      background: '#fef2f2',
                      color: '#dc2626',
                      border: '2px solid #dc2626',
                      borderRadius: '8px',
                      fontWeight: 600,
                      fontSize: '14px',
                      cursor: 'pointer',
                    }}
                  >
                    🗑️ Delete This Product
                  </button>
                )}

                {/* Adjustment Type */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '8px' }}>
                    Adjustment Type
                  </label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {[
                      { value: 'remove', label: 'Remove Units', color: '#dc2626' },
                      { value: 'add', label: 'Add Units', color: '#22c55e' },
                      { value: 'set', label: 'Set Exact Count', color: '#3b82f6' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setAdjustmentType(opt.value as 'add' | 'remove' | 'set')}
                        style={{
                          flex: 1,
                          padding: '12px',
                          background: adjustmentType === opt.value ? opt.color : '#f3f4f6',
                          color: adjustmentType === opt.value ? '#fff' : '#374151',
                          border: 'none',
                          borderRadius: '8px',
                          fontWeight: 600,
                          fontSize: '13px',
                          cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quantity */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>
                    {adjustmentType === 'set' ? 'New Count (units)' : 'Quantity (units)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    placeholder={adjustmentType === 'set' ? 'Enter new total count' : 'Enter quantity'}
                    className={styles.formInput}
                    style={{ width: '100%', padding: '12px', fontSize: '16px' }}
                  />
                </div>

                {/* Reason */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>
                    Reason / Notes
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder={adjustmentType === 'remove' ? 'e.g., Expired, damaged, lost...' : 'e.g., Count correction, found extra...'}
                    className={styles.formInput}
                    style={{ width: '100%', padding: '12px', fontSize: '14px' }}
                  />
                </div>

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={saving || !quantity}
                  style={{
                    width: '100%',
                    padding: '14px',
                    background: saving ? '#d1d5db' : adjustmentType === 'remove' ? '#dc2626' : '#22c55e',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '10px',
                    fontWeight: 700,
                    fontSize: '16px',
                    cursor: saving ? 'wait' : 'pointer',
                  }}
                >
                  {saving ? 'Saving...' : adjustmentType === 'remove' ? 'Remove from Inventory' : 'Save Adjustment'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Recent Movements for Selected Product */}
        {selectedProduct && productMovements.length > 0 && (
          <div className={styles.sectionCard} style={{ marginTop: '16px' }}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Recent Movements</h2>
            </div>
            <div className={styles.sectionBody}>
              {productMovements.map(m => (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '10px 12px',
                    borderBottom: '1px solid #e5e7eb',
                    fontSize: '13px',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 500 }}>{m.movement_type.replace('_', ' ')}</div>
                    <div style={{ fontSize: '11px', color: '#6b7280' }}>
                      {new Date(m.created_at).toLocaleDateString()} - {m.notes || 'No notes'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{
                      fontWeight: 600,
                      color: m.quantity >= 0 ? '#22c55e' : '#dc2626',
                    }}>
                      {m.quantity >= 0 ? '+' : ''}{m.quantity}
                    </span>
                    <button
                      onClick={() => handleDeleteMovement(m.id)}
                      style={{
                        padding: '4px 8px',
                        background: '#fef2f2',
                        color: '#dc2626',
                        border: '1px solid #dc2626',
                        borderRadius: '4px',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Back Button */}
        <button
          onClick={() => router.push('/admin/inventory')}
          style={{
            width: '100%',
            marginTop: '16px',
            padding: '12px',
            background: '#f3f4f6',
            color: '#374151',
            border: 'none',
            borderRadius: '10px',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Back to Inventory
        </button>
      </div>
    </AdminShell>
  );
}
