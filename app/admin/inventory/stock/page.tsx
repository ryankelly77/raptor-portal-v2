'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AdminShell } from '../../components/AdminShell';
import { adminFetch, AuthError } from '@/lib/admin-fetch';
import styles from '../inventory.module.css';

interface Product {
  id: string;
  name: string;
  brand?: string | null;
  category: string;
  units_per_package?: number;
  unit_name?: string;
  package_name?: string;
  sell_price?: number | null;
}

interface Purchase {
  id: string;
  store_name: string;
  receipt_image_url: string | null;
}

interface PurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number | null;
  expiration_date: string | null;
  created_at: string;
}

interface Batch {
  purchaseItem: PurchaseItem;
  purchase: Purchase | null;
  product: Product;
  originalQty: number;
  restockedQty: number;
  discardedQty: number;
  remainingQty: number;
  unitCost: number | null;
  expirationDate: string | null;
  daysUntilExpiry: number | null;
  expirationStatus: 'critical' | 'warning' | 'ok' | null;
  isOldest: boolean;
}

interface ProductWithBatches {
  product: Product;
  batches: Batch[];
  totalOnHand: number;
  totalInMachine: number;
  totalSold: number;
  avgUnitCost: number | null;
  totalValue: number;
  earliestExpiration: string | null;
  expirationStatus: 'critical' | 'warning' | 'ok' | null;
}

export default function StockPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [productInventory, setProductInventory] = useState<ProductWithBatches[]>([]);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [receiptModal, setReceiptModal] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Locations for restocking
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);

  // Batch action states
  const [actionBatch, setActionBatch] = useState<{ batch: Batch; action: 'push_to_machine' | 'discard' | 'adjust' } | null>(null);
  const [actionQty, setActionQty] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [actionLocation, setActionLocation] = useState('');
  const [actionSaving, setActionSaving] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [productsRes, movementsRes, purchaseItemsRes, purchasesRes, expirationRes, locationsRes] = await Promise.all([
        adminFetch('/api/admin/crud', { method: 'POST', body: JSON.stringify({ table: 'products', action: 'read' }) }),
        adminFetch('/api/admin/crud', { method: 'POST', body: JSON.stringify({ table: 'inventory_movements', action: 'read' }) }),
        adminFetch('/api/admin/crud', { method: 'POST', body: JSON.stringify({ table: 'inventory_purchase_items', action: 'read' }) }),
        adminFetch('/api/admin/crud', { method: 'POST', body: JSON.stringify({ table: 'inventory_purchases', action: 'read' }) }),
        adminFetch('/api/admin/crud', { method: 'POST', body: JSON.stringify({ table: 'expiration_settings', action: 'read' }) }),
        adminFetch('/api/admin/crud', { method: 'POST', body: JSON.stringify({ table: 'locations', action: 'read' }) }),
      ]);

      const products: Product[] = (await productsRes.json()).data || [];
      const movements = (await movementsRes.json()).data || [];
      const purchaseItems: PurchaseItem[] = (await purchaseItemsRes.json()).data || [];
      const purchases: Purchase[] = (await purchasesRes.json()).data || [];
      const expSettings = (await expirationRes.json()).data || [];
      const locationsData = (await locationsRes.json()).data || [];
      setLocations(locationsData.map((l: { id: string; name: string }) => ({ id: l.id, name: l.name })));

      type ExpSetting = { category: string; warning_days: number; critical_days: number };
      const productsMap = new Map(products.map(p => [p.id, p]));
      const purchasesMap = new Map(purchases.map(p => [p.id, p]));
      const expSettingsMap = new Map<string, ExpSetting>(expSettings.map((s: ExpSetting) => [s.category, s]));

      const getExpSettings = (category: string): ExpSetting => expSettingsMap.get(category) || { category, warning_days: 14, critical_days: 3 };

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Group movements by purchase_item_id
      const movementsByPurchaseItem = new Map<string, typeof movements>();
      // Calculate in-machine per product (restock_in - sold)
      const inMachineByProduct = new Map<string, number>();
      // Track sold units per product
      const soldByProduct = new Map<string, number>();

      for (const m of movements) {
        if (m.purchase_item_id) {
          const existing = movementsByPurchaseItem.get(m.purchase_item_id) || [];
          existing.push(m);
          movementsByPurchaseItem.set(m.purchase_item_id, existing);
        }

        // Track in-machine quantities
        const currentInMachine = inMachineByProduct.get(m.product_id) || 0;
        if (m.movement_type === 'restock_in') {
          inMachineByProduct.set(m.product_id, currentInMachine + m.quantity);
        } else if (m.movement_type === 'sold') {
          inMachineByProduct.set(m.product_id, currentInMachine - m.quantity);
          // Track total sold
          const currentSold = soldByProduct.get(m.product_id) || 0;
          soldByProduct.set(m.product_id, currentSold + m.quantity);
        }
      }

      // Build batches
      const batchesByProduct = new Map<string, Batch[]>();

      for (const purchaseItem of purchaseItems) {
        const product = productsMap.get(purchaseItem.product_id);
        if (!product) continue;

        const purchase = purchasesMap.get(purchaseItem.purchase_id) || null;
        const mvmts = movementsByPurchaseItem.get(purchaseItem.id) || [];

        // All movements are stored in INDIVIDUAL UNITS (not packages)
        let restockedQty = 0;
        let discardedQty = 0;

        for (const m of mvmts) {
          if (m.movement_type === 'restock_out') {
            restockedQty += Math.abs(m.quantity); // Already in units
          } else if (m.movement_type === 'shrinkage') {
            discardedQty += Math.abs(m.quantity); // Already in units
          }
        }

        const remainingQty = purchaseItem.quantity - restockedQty - discardedQty;
        if (remainingQty <= 0) continue;

        let daysUntilExpiry: number | null = null;
        let expirationStatus: 'critical' | 'warning' | 'ok' | null = null;

        if (purchaseItem.expiration_date) {
          const expDate = new Date(purchaseItem.expiration_date);
          daysUntilExpiry = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const settings = getExpSettings(product.category);

          if (daysUntilExpiry <= settings.critical_days) {
            expirationStatus = 'critical';
          } else if (daysUntilExpiry <= settings.warning_days) {
            expirationStatus = 'warning';
          } else {
            expirationStatus = 'ok';
          }
        }

        const batch: Batch = {
          purchaseItem,
          purchase,
          product,
          originalQty: purchaseItem.quantity,
          restockedQty,
          discardedQty,
          remainingQty,
          unitCost: purchaseItem.unit_cost,
          expirationDate: purchaseItem.expiration_date,
          daysUntilExpiry,
          expirationStatus,
          isOldest: false,
        };

        const existing = batchesByProduct.get(product.id) || [];
        existing.push(batch);
        batchesByProduct.set(product.id, existing);
      }

      // Sort batches FIFO and mark oldest
      for (const [, batches] of batchesByProduct) {
        batches.sort((a, b) => {
          if (a.expirationDate && b.expirationDate) {
            const diff = new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
            if (diff !== 0) return diff;
          } else if (a.expirationDate) return -1;
          else if (b.expirationDate) return 1;
          return new Date(a.purchaseItem.created_at).getTime() - new Date(b.purchaseItem.created_at).getTime();
        });
        if (batches.length > 0) batches[0].isOldest = true;
      }

      // Build product inventory
      const inventoryList: ProductWithBatches[] = [];

      for (const product of products) {
        const batches = batchesByProduct.get(product.id) || [];
        if (batches.length === 0) continue;

        let totalOnHand = 0;
        let totalCost = 0;
        let earliestExp: string | null = null;
        let worstStatus: 'critical' | 'warning' | 'ok' | null = null;

        for (const batch of batches) {
          totalOnHand += batch.remainingQty;
          if (batch.unitCost) totalCost += batch.remainingQty * batch.unitCost;
          if (batch.expirationDate && (!earliestExp || new Date(batch.expirationDate) < new Date(earliestExp))) {
            earliestExp = batch.expirationDate;
          }
          if (batch.expirationStatus === 'critical') worstStatus = 'critical';
          else if (batch.expirationStatus === 'warning' && worstStatus !== 'critical') worstStatus = 'warning';
          else if (batch.expirationStatus === 'ok' && !worstStatus) worstStatus = 'ok';
        }

        inventoryList.push({
          product,
          batches,
          totalOnHand,
          totalInMachine: Math.max(0, inMachineByProduct.get(product.id) || 0),
          totalSold: soldByProduct.get(product.id) || 0,
          avgUnitCost: totalOnHand > 0 ? totalCost / totalOnHand : null,
          totalValue: totalCost,
          earliestExpiration: earliestExp,
          expirationStatus: worstStatus,
        });
      }

      // Sort by expiration urgency
      inventoryList.sort((a, b) => {
        if (a.expirationStatus === 'critical' && b.expirationStatus !== 'critical') return -1;
        if (b.expirationStatus === 'critical' && a.expirationStatus !== 'critical') return 1;
        if (a.expirationStatus === 'warning' && b.expirationStatus !== 'warning') return -1;
        if (b.expirationStatus === 'warning' && a.expirationStatus !== 'warning') return 1;
        return b.totalOnHand - a.totalOnHand;
      });

      setProductInventory(inventoryList);
    } catch (err) {
      if (!(err instanceof AuthError)) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggleExpanded = (productId: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const handleBatchAction = async () => {
    if (!actionBatch || !actionQty) return;
    const qty = parseInt(actionQty);
    if (isNaN(qty) || qty <= 0) return;

    setActionSaving(true);
    try {
      if (actionBatch.action === 'push_to_machine') {
        // Push to Machine creates TWO movements:
        // 1. restock_out: removes from on-hand (storage)
        // 2. restock_in: adds to machine

        // Movement 1: Out of storage
        const outRes = await adminFetch('/api/admin/crud', {
          method: 'POST',
          body: JSON.stringify({
            table: 'inventory_movements',
            action: 'create',
            data: {
              product_id: actionBatch.batch.product.id,
              quantity: -qty, // Negative = leaving storage
              movement_type: 'restock_out',
              moved_by: 'Admin',
              notes: actionReason || 'Pushed to machine',
              purchase_item_id: actionBatch.batch.purchaseItem.id,
              expiration_date: actionBatch.batch.expirationDate,
            },
          }),
        });
        if (!outRes.ok) throw new Error((await outRes.json()).error || 'Failed to record out movement');

        // Movement 2: Into machine (with location)
        const locationName = locations.find(l => l.id === actionLocation)?.name || 'Machine';
        const inRes = await adminFetch('/api/admin/crud', {
          method: 'POST',
          body: JSON.stringify({
            table: 'inventory_movements',
            action: 'create',
            data: {
              product_id: actionBatch.batch.product.id,
              quantity: qty, // Positive = entering machine
              movement_type: 'restock_in',
              moved_by: 'Admin',
              notes: `Pushed to ${locationName}`,
              purchase_item_id: actionBatch.batch.purchaseItem.id,
              expiration_date: actionBatch.batch.expirationDate,
              location_id: actionLocation || null,
            },
          }),
        });
        if (!inRes.ok) throw new Error((await inRes.json()).error || 'Failed to record in movement');

      } else {
        // Discard or Adjust: single movement
        let movementType = '';
        let movementQty = 0;

        switch (actionBatch.action) {
          case 'discard': movementType = 'shrinkage'; movementQty = -qty; break;
          case 'adjust': movementType = 'adjustment'; movementQty = qty - actionBatch.batch.remainingQty; break;
        }

        const res = await adminFetch('/api/admin/crud', {
          method: 'POST',
          body: JSON.stringify({
            table: 'inventory_movements',
            action: 'create',
            data: {
              product_id: actionBatch.batch.product.id,
              quantity: movementQty,
              movement_type: movementType,
              moved_by: 'Admin',
              notes: actionReason || `${actionBatch.action} from batch`,
              purchase_item_id: actionBatch.batch.purchaseItem.id,
              expiration_date: actionBatch.batch.expirationDate,
            },
          }),
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      }

      setActionBatch(null);
      setActionQty('');
      setActionReason('');
      setActionLocation('');
      loadData();
    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setActionSaving(false);
    }
  };

  const formatExpDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const formatPurchaseDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const getDaysLabel = (days: number | null) => {
    if (days === null) return '';
    if (days < 0) return 'EXPIRED';
    if (days === 0) return 'TODAY';
    if (days === 1) return '1 day';
    return `${days} days`;
  };
  const pluralize = (count: number, singular: string) => {
    // Handle common unit names
    if (count === 1) return singular;
    // Add 's' for pluralization, unless already ends in 's'
    if (singular.endsWith('s')) return singular;
    return singular + 's';
  };

  if (loading) {
    return (
      <AdminShell title="Stock">
        <div className={styles.inventoryPage}>
          <div className={styles.loading}><div className={styles.spinner} /></div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Stock">
      <div className={styles.inventoryPage}>
        <Link href="/admin/inventory" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#6b7280', fontSize: '14px', marginBottom: '16px', textDecoration: 'none' }}>
          ← Back to Inventory
        </Link>

        {/* Search Bar */}
        <div style={{ marginBottom: '16px' }}>
          <input
            type="text"
            placeholder="Search products..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={styles.searchInput}
            style={{ width: '100%', maxWidth: '400px' }}
          />
        </div>

        {error && (
          <div style={{ background: '#fef2f2', color: '#dc2626', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>
        )}

        {productInventory.filter(inv => {
          if (!searchQuery.trim()) return true;
          const q = searchQuery.toLowerCase();
          return (
            inv.product.name.toLowerCase().includes(q) ||
            (inv.product.brand?.toLowerCase().includes(q)) ||
            inv.product.category.toLowerCase().includes(q)
          );
        }).length === 0 ? (
          <div className={styles.emptyState}>
            <p>{searchQuery.trim() ? 'No products match your search.' : 'No inventory on hand. Start by receiving items.'}</p>
          </div>
        ) : (
          <div className={styles.sectionCard}>
            {/* Table Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', gap: '8px', padding: '12px 16px', borderBottom: '2px solid #e5e7eb', background: '#f9fafb', fontSize: '11px', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase' }}>
              <div>Product</div>
              <div style={{ textAlign: 'right' }}>On-Hand</div>
              <div style={{ textAlign: 'right' }}>In Machine</div>
              <div style={{ textAlign: 'right' }}>Sold</div>
              <div style={{ textAlign: 'right' }}>Cost</div>
              <div style={{ textAlign: 'right' }}>Expires</div>
            </div>
            <div className={styles.sectionBody} style={{ padding: 0 }}>
              {productInventory.filter(inv => {
                if (!searchQuery.trim()) return true;
                const q = searchQuery.toLowerCase();
                return (
                  inv.product.name.toLowerCase().includes(q) ||
                  (inv.product.brand?.toLowerCase().includes(q)) ||
                  inv.product.category.toLowerCase().includes(q)
                );
              }).map((inv) => (
                <div key={inv.product.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                  {/* Product Row */}
                  <div
                    onClick={() => toggleExpanded(inv.product.id)}
                    style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr', gap: '8px', alignItems: 'center', padding: '12px 16px', cursor: 'pointer', background: expandedProducts.has(inv.product.id) ? '#f9fafb' : 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: '#6b7280', fontSize: '12px' }}>{expandedProducts.has(inv.product.id) ? '▼' : '▶'}</span>
                      <div>
                        {inv.product.brand && <span style={{ color: '#FF580F', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>{inv.product.brand} </span>}
                        <span style={{ fontWeight: 500 }}>{inv.product.name}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', fontWeight: 600, color: '#FF580F' }}>
                      {inv.totalOnHand} <span style={{ fontWeight: 400, color: '#6b7280', fontSize: '12px' }}>{pluralize(inv.totalOnHand, inv.product.unit_name || 'unit')}</span>
                    </div>
                    <div style={{ textAlign: 'right', color: inv.totalInMachine > 0 ? '#16a34a' : '#9ca3af' }}>
                      {inv.totalInMachine} <span style={{ color: '#6b7280', fontSize: '12px' }}>{pluralize(inv.totalInMachine, inv.product.unit_name || 'unit')}</span>
                    </div>
                    <div style={{ textAlign: 'right', color: inv.totalSold > 0 ? '#2563eb' : '#9ca3af' }}>
                      {inv.totalSold} <span style={{ color: '#6b7280', fontSize: '12px' }}>{pluralize(inv.totalSold, inv.product.unit_name || 'unit')}</span>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '13px' }}>
                      {inv.avgUnitCost ? `$${inv.avgUnitCost.toFixed(2)}/${inv.product.unit_name || 'unit'}` : '—'}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {inv.earliestExpiration ? (
                        <span style={{
                          fontSize: '12px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 500,
                          background: inv.expirationStatus === 'critical' ? '#fef2f2' : inv.expirationStatus === 'warning' ? '#fef3c7' : '#dcfce7',
                          color: inv.expirationStatus === 'critical' ? '#dc2626' : inv.expirationStatus === 'warning' ? '#92400e' : '#16a34a',
                        }}>
                          {formatExpDate(inv.earliestExpiration)}
                        </span>
                      ) : '—'}
                    </div>
                  </div>

                  {/* Expanded Batches */}
                  {expandedProducts.has(inv.product.id) && (
                    <div style={{ background: '#f9fafb', padding: '0 12px 12px' }}>
                      {inv.batches.map((batch, idx) => (
                        <div key={batch.purchaseItem.id} style={{ background: '#fff', border: batch.isOldest ? '2px solid #22c55e' : '1px solid #e5e7eb', borderRadius: '8px', padding: '12px', marginTop: '8px' }}>
                          {batch.isOldest && (
                            <div style={{ background: '#dcfce7', color: '#16a34a', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700, marginBottom: '8px', display: 'inline-block' }}>
                              📦 STOCK THIS FIRST
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '13px' }}>Batch {idx + 1} — {batch.purchase?.store_name || 'Unknown'}</div>
                              <div style={{ fontSize: '12px', color: '#6b7280' }}>Purchased: {formatPurchaseDate(batch.purchaseItem.created_at)}</div>
                              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                Remaining: <strong>{batch.remainingQty}</strong> of {batch.originalQty} {pluralize(batch.originalQty, batch.product.unit_name || 'unit')}
                                {batch.restockedQty > 0 && <span style={{ color: '#2563eb' }}> ({batch.restockedQty} pushed)</span>}
                                {batch.discardedQty > 0 && <span style={{ color: '#dc2626' }}> ({batch.discardedQty} discarded)</span>}
                              </div>
                              <div style={{ fontSize: '12px', color: '#6b7280' }}>Cost: ${batch.unitCost?.toFixed(2) || '—'}/{batch.product.unit_name || 'unit'}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                              {batch.expirationDate && (
                                <div style={{ fontSize: '12px', fontWeight: 600, color: batch.expirationStatus === 'critical' ? '#dc2626' : batch.expirationStatus === 'warning' ? '#f59e0b' : '#22c55e' }}>
                                  Exp: {formatExpDate(batch.expirationDate)} ({getDaysLabel(batch.daysUntilExpiry)})
                                </div>
                              )}
                              {batch.purchase?.receipt_image_url && (
                                <button onClick={(e) => { e.stopPropagation(); setReceiptModal(batch.purchase!.receipt_image_url); }} style={{ fontSize: '11px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', marginTop: '4px' }}>
                                  View Receipt
                                </button>
                              )}
                            </div>
                          </div>
                          {/* Actions */}
                          <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                            <button onClick={(e) => { e.stopPropagation(); setActionBatch({ batch, action: 'push_to_machine' }); setActionQty(String(batch.remainingQty)); }} style={{ padding: '8px 16px', background: batch.isOldest ? '#FF580F' : '#f3f4f6', color: batch.isOldest ? '#fff' : '#374151', border: 'none', borderRadius: '6px', fontWeight: 600, cursor: 'pointer' }}>
                              Push to Machine ▸
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); setActionBatch({ batch, action: 'discard' }); setActionQty(String(batch.remainingQty)); }} style={{ padding: '8px 16px', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                              Discard
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Modal */}
        {actionBatch && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
            <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', maxWidth: '400px', width: '100%' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>
                {actionBatch.action === 'push_to_machine' ? 'Push to Machine' : actionBatch.action === 'discard' ? 'Discard Items' : 'Adjust Count'}
              </h3>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px' }}>
                {actionBatch.batch.product.brand && <strong>{actionBatch.batch.product.brand} </strong>}{actionBatch.batch.product.name}
                <br /><span style={{ fontSize: '12px' }}>{actionBatch.batch.remainingQty} available</span>
              </p>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Quantity ({pluralize(2, actionBatch.batch.product.unit_name || 'unit')})</label>
                <input type="number" value={actionQty} onChange={(e) => setActionQty(e.target.value)} max={actionBatch.batch.remainingQty} min={0} style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '16px' }} />
              </div>
              {actionBatch.action === 'push_to_machine' && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Location (Machine)</label>
                  <select value={actionLocation} onChange={(e) => setActionLocation(e.target.value)} style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px' }}>
                    <option value="">Select location...</option>
                    {locations.map(loc => (
                      <option key={loc.id} value={loc.id}>{loc.name}</option>
                    ))}
                  </select>
                </div>
              )}
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Reason</label>
                <select value={actionReason} onChange={(e) => setActionReason(e.target.value)} style={{ width: '100%', padding: '12px', border: '1px solid #d1d5db', borderRadius: '6px' }}>
                  <option value="">Select...</option>
                  {actionBatch.action === 'discard' && <><option value="Expired">Expired</option><option value="Damaged">Damaged</option><option value="Lost">Lost</option><option value="Duplicate">Duplicate</option></>}
                  {actionBatch.action === 'push_to_machine' && <><option value="Routine restock">Routine restock</option><option value="Expiring soon">Expiring soon</option></>}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => { setActionBatch(null); setActionQty(''); setActionReason(''); }} style={{ flex: 1, padding: '12px', background: '#f3f4f6', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleBatchAction} disabled={actionSaving || !actionQty} style={{ flex: 1, padding: '12px', background: actionBatch.action === 'discard' ? '#dc2626' : '#FF580F', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: actionSaving ? 'wait' : 'pointer' }}>
                  {actionSaving ? 'Saving...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Receipt Modal */}
        {receiptModal && (
          <div onClick={() => setReceiptModal(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
            <div style={{ maxWidth: '600px', maxHeight: '90vh', overflow: 'auto', background: '#fff', borderRadius: '12px', padding: '4px' }}>
              <img src={receiptModal} alt="Receipt" style={{ width: '100%', display: 'block' }} />
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
