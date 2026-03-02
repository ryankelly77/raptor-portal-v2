'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AdminShell } from '../components/AdminShell';
import { adminFetch, AuthError } from '@/lib/admin-fetch';
import styles from './inventory.module.css';

// BUILD VERSION - update this to verify deployment
const BUILD_VERSION = 'v2024-MAR02-H';

interface Product {
  id: string;
  name: string;
  brand?: string | null;
  barcode: string;
  category: string;
  default_price: number | null;
  // Package quantities
  units_per_package?: number;
  unit_name?: string;
  package_name?: string;
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

interface Movement {
  id: string;
  product_id: string;
  location_id: string | null;
  quantity: number;
  movement_type: string;
  moved_by: string | null;
  notes: string | null;
  created_at: string;
  expiration_date?: string | null;
  purchase_item_id?: string | null;
  product?: Product;
}

interface ExpirationSetting {
  id: string;
  category: string;
  warning_days: number;
  critical_days: number;
}

interface ExpiringBatch {
  product: Product;
  quantity: number;
  expirationDate: string;
  daysUntilExpiry: number;
  status: 'critical' | 'warning' | 'ok';
  location: 'on-hand' | 'in-machine';
}

interface ProductInventory {
  product: Product;
  onHandQty: number;
  inMachineQty: number;
  unitCost: number | null;
  earliestExpiration: string | null;
  expirationStatus: 'critical' | 'warning' | 'ok' | null;
}

interface SummaryStats {
  totalProducts: number;
  onHandQty: number;
  availableQty: number;
  totalValue: number;
  expiringCritical: number;
  expiringWarning: number;
}

export default function InventoryPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<SummaryStats>({
    totalProducts: 0,
    onHandQty: 0,
    availableQty: 0,
    totalValue: 0,
    expiringCritical: 0,
    expiringWarning: 0,
  });
  const [recentMovements, setRecentMovements] = useState<Movement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [expiringBatches, setExpiringBatches] = useState<ExpiringBatch[]>([]);
  const [productInventory, setProductInventory] = useState<ProductInventory[]>([]);
  const [showAllProducts, setShowAllProducts] = useState(false);
  const [activeTab, setActiveTab] = useState<'inventory' | 'movements'>('inventory');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Load products, movements, purchase items, and expiration settings in parallel
      const [productsRes, movementsRes, purchaseItemsRes, expirationRes] = await Promise.all([
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
        adminFetch('/api/admin/crud', {
          method: 'POST',
          body: JSON.stringify({ table: 'expiration_settings', action: 'read' }),
        }),
      ]);

      if (!productsRes.ok) {
        const errData = await productsRes.json();
        throw new Error(errData.error || 'Failed to load products');
      }

      const productsData = await productsRes.json();
      const productsList: Product[] = productsData.data || [];
      setProducts(productsList);

      const movementsData = await movementsRes.json();
      const movementsList: Movement[] = movementsData.data || [];

      const purchaseItemsData = await purchaseItemsRes.json();
      const purchaseItemsList: PurchaseItem[] = purchaseItemsData.data || [];

      // Map products
      const productsMap = new Map(productsList.map(p => [p.id, p]));

      // Build a map of most recent purchase cost per product
      // Sort by created_at descending to get most recent first
      const sortedPurchaseItems = [...purchaseItemsList].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      const productCostMap = new Map<string, number>();
      for (const item of sortedPurchaseItems) {
        if (!productCostMap.has(item.product_id) && item.unit_cost !== null) {
          productCostMap.set(item.product_id, item.unit_cost);
        }
      }

      // Map products to movements for display
      const movementsWithProducts = movementsList.map(m => ({
        ...m,
        product: productsMap.get(m.product_id),
      }));

      setRecentMovements(movementsWithProducts.slice(0, 20));

      // Calculate per-product on-hand quantities (in individual units)
      const productOnHand = new Map<string, number>();
      const productInMachine = new Map<string, number>();

      console.log('[Inventory] Processing', movementsList.length, 'movements');

      for (const m of movementsList) {
        const product = productsMap.get(m.product_id);
        const unitsPerPkg = product?.units_per_package || 1;
        const currentOnHand = productOnHand.get(m.product_id) || 0;
        const currentInMachine = productInMachine.get(m.product_id) || 0;

        switch (m.movement_type) {
          case 'purchase_in':
            // Purchases are in packages, convert to units
            productOnHand.set(m.product_id, currentOnHand + (m.quantity * unitsPerPkg));
            break;
          case 'restock_out':
            // Sending packages to machine
            productOnHand.set(m.product_id, currentOnHand - (m.quantity * unitsPerPkg));
            break;
          case 'restock_in':
            // Loaded into machine (packages become available as units)
            productInMachine.set(m.product_id, currentInMachine + (m.quantity * unitsPerPkg));
            break;
          case 'sold':
          case 'shrinkage':
            // Sales/shrinkage are individual units from machine
            productInMachine.set(m.product_id, currentInMachine - m.quantity);
            break;
          case 'adjustment':
            // Adjustments are in individual units to on-hand
            productOnHand.set(m.product_id, currentOnHand + m.quantity);
            break;
        }
      }

      // Calculate totals
      let totalOnHand = 0;
      let totalInMachine = 0;
      let totalValue = 0;

      for (const [productId, onHandQty] of productOnHand) {
        const qty = Math.max(0, onHandQty);
        totalOnHand += qty;

        // Calculate value using purchase cost or default price
        const purchaseCost = productCostMap.get(productId);
        const product = productsMap.get(productId);
        const unitCost = purchaseCost ?? product?.default_price ?? 0;
        totalValue += qty * unitCost;
      }

      for (const [, inMachineQty] of productInMachine) {
        totalInMachine += Math.max(0, inMachineQty);
      }

      // Also add value for items in machines
      for (const [productId, inMachineQty] of productInMachine) {
        const qty = Math.max(0, inMachineQty);
        const purchaseCost = productCostMap.get(productId);
        const product = productsMap.get(productId);
        const unitCost = purchaseCost ?? product?.default_price ?? 0;
        totalValue += qty * unitCost;
      }

      // Parse expiration settings
      const expSettingsData = await expirationRes.json();
      const expSettings: ExpirationSetting[] = expSettingsData.data || [];
      const expSettingsMap = new Map(expSettings.map(s => [s.category, s]));

      // Default settings if not configured
      const getExpSettings = (category: string) => {
        return expSettingsMap.get(category) || { warning_days: 14, critical_days: 3 };
      };

      // Calculate expiration alerts from purchase items with expiration dates
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const batches: ExpiringBatch[] = [];

      for (const purchaseItem of purchaseItemsList) {
        if (!purchaseItem.expiration_date) continue;

        const product = productsMap.get(purchaseItem.product_id);
        if (!product) continue;

        const expDate = new Date(purchaseItem.expiration_date);
        const daysUntilExpiry = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const settings = getExpSettings(product.category);

        let status: 'critical' | 'warning' | 'ok' = 'ok';
        if (daysUntilExpiry <= settings.critical_days) {
          status = 'critical';
        } else if (daysUntilExpiry <= settings.warning_days) {
          status = 'warning';
        }

        if (status !== 'ok') {
          batches.push({
            product,
            quantity: purchaseItem.quantity,
            expirationDate: purchaseItem.expiration_date,
            daysUntilExpiry,
            status,
            location: 'on-hand', // For now, assume on-hand
          });
        }
      }

      // Sort by days until expiry (most urgent first)
      batches.sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);
      setExpiringBatches(batches);

      const expiringCritical = batches.filter(b => b.status === 'critical').length;
      const expiringWarning = batches.filter(b => b.status === 'warning').length;

      // Build product inventory list
      const inventoryList: ProductInventory[] = [];
      for (const product of productsList) {
        const onHandQty = Math.max(0, productOnHand.get(product.id) || 0);
        const inMachineQty = Math.max(0, productInMachine.get(product.id) || 0);

        // Find earliest expiration for this product
        const productPurchaseItems = purchaseItemsList
          .filter(pi => pi.product_id === product.id && pi.expiration_date)
          .sort((a, b) => new Date(a.expiration_date!).getTime() - new Date(b.expiration_date!).getTime());

        const earliestExp = productPurchaseItems[0]?.expiration_date || null;
        let expirationStatus: 'critical' | 'warning' | 'ok' | null = null;

        if (earliestExp) {
          const expDate = new Date(earliestExp);
          const daysUntilExpiry = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const settings = getExpSettings(product.category);

          if (daysUntilExpiry <= settings.critical_days) {
            expirationStatus = 'critical';
          } else if (daysUntilExpiry <= settings.warning_days) {
            expirationStatus = 'warning';
          } else {
            expirationStatus = 'ok';
          }
        }

        if (onHandQty > 0 || inMachineQty > 0) {
          inventoryList.push({
            product,
            onHandQty,
            inMachineQty,
            unitCost: productCostMap.get(product.id) || product.default_price,
            earliestExpiration: earliestExp,
            expirationStatus,
          });
        }
      }
      setProductInventory(inventoryList);

      console.log('[Inventory] Final stats:', { totalOnHand, totalInMachine, totalValue, expiringCritical, expiringWarning });

      setStats({
        totalProducts: productsList.length,
        onHandQty: totalOnHand,
        availableQty: totalInMachine,
        totalValue: Math.round(totalValue * 100) / 100,
        expiringCritical,
        expiringWarning,
      });
    } catch (err) {
      console.error('Error loading inventory data:', err);
      // Don't show error for auth errors - they redirect to login
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

  function getMovementIcon(type: string) {
    switch (type) {
      case 'purchase_in':
      case 'restock_in':
        return 'in';
      case 'restock_out':
        return 'out';
      case 'sold':
        return 'sold';
      default:
        return 'adjust';
    }
  }

  function getMovementLabel(type: string) {
    switch (type) {
      case 'purchase_in':
        return 'Received';
      case 'restock_out':
        return 'Sent to machine';
      case 'restock_in':
        return 'Loaded in machine';
      case 'sold':
        return 'Sold';
      case 'shrinkage':
        return 'Shrinkage';
      case 'adjustment':
        return 'Adjustment';
      default:
        return type;
    }
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function formatExpDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  function getDaysLabel(days: number) {
    if (days < 0) return 'EXPIRED';
    if (days === 0) return 'TODAY';
    if (days === 1) return 'TOMORROW';
    return `${days} days`;
  }

  if (loading) {
    return (
      <AdminShell title="Inventory">
        <div className={styles.inventoryPage}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Inventory">
      <div className={styles.inventoryPage}>
        {/* Build Version - TEMPORARY */}
        <div style={{ background: '#fef3c7', color: '#92400e', padding: '8px 12px', borderRadius: '6px', marginBottom: '16px', fontSize: '12px', fontFamily: 'monospace' }}>
          Build: {BUILD_VERSION}
        </div>

        {/* Error display */}
        {error && (
          <div style={{ background: '#fef2f2', color: '#dc2626', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {/* Summary Cards */}
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Total Products</div>
            <div className={styles.summaryValue}>{stats.totalProducts}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>On-Hand (units)</div>
            <div className={`${styles.summaryValue} ${styles.orange}`}>{stats.onHandQty}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>In Machines (units)</div>
            <div className={styles.summaryValue}>{stats.availableQty}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Total Value</div>
            <div className={styles.summaryValue}>${stats.totalValue.toFixed(2)}</div>
          </div>
          {(stats.expiringCritical > 0 || stats.expiringWarning > 0) && (
            <div className={styles.summaryCard} style={{
              background: stats.expiringCritical > 0 ? '#fef2f2' : '#fef3c7',
              border: `2px solid ${stats.expiringCritical > 0 ? '#dc2626' : '#f59e0b'}`,
            }}>
              <div className={styles.summaryLabel} style={{ color: stats.expiringCritical > 0 ? '#dc2626' : '#92400e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Expiring Soon
              </div>
              <div className={styles.summaryValue} style={{ color: stats.expiringCritical > 0 ? '#dc2626' : '#f59e0b' }}>
                {stats.expiringCritical + stats.expiringWarning}
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className={styles.quickActions}>
          <Link href="/admin/inventory/receive" className={`${styles.actionButton} ${styles.primary}`}>
            <svg className={styles.actionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            Receive Items
          </Link>
          <Link href="/admin/inventory/restock" className={styles.actionButton}>
            <svg className={styles.actionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            Restock Machine
          </Link>
          <Link href="/admin/inventory/adjust" className={styles.actionButton}>
            <svg className={styles.actionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20V10" />
              <path d="M18 20V4" />
              <path d="M6 20v-4" />
            </svg>
            Adjust Inventory
          </Link>
          <Link href="/admin/inventory/products" className={styles.actionButton}>
            <svg className={styles.actionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="21" r="1" />
              <circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            Product Catalog
          </Link>
          <Link href="/admin/inventory/aliases" className={styles.actionButton}>
            <svg className={styles.actionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M15 3h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4" />
              <line x1="12" y1="15" x2="12" y2="21" />
              <polyline points="9 18 12 21 15 18" />
            </svg>
            Receipt Aliases
          </Link>
        </div>

        {/* Expiration Alerts */}
        {expiringBatches.length > 0 && (
          <div className={styles.sectionCard} style={{ border: '2px solid #f59e0b', background: '#fffbeb' }}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
                Expiration Alerts
              </h2>
            </div>
            <div className={styles.sectionBody}>
              {expiringBatches.map((batch, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px',
                    background: batch.status === 'critical' ? '#fef2f2' : '#fef3c7',
                    borderRadius: '8px',
                    marginBottom: '8px',
                    border: `1px solid ${batch.status === 'critical' ? '#dc2626' : '#f59e0b'}`,
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill={batch.status === 'critical' ? '#dc2626' : '#f59e0b'} stroke="none">
                        <circle cx="12" cy="12" r="10" />
                      </svg>
                      <span style={{ fontWeight: 600 }}>
                        {batch.product.brand && <span style={{ color: '#FF580F', fontSize: '11px', textTransform: 'uppercase' }}>{batch.product.brand} </span>}
                        {batch.product.name}
                      </span>
                      <span style={{ color: '#6b7280', fontSize: '13px' }}>({batch.quantity} units)</span>
                    </div>
                    <div style={{ fontSize: '12px', color: batch.status === 'critical' ? '#dc2626' : '#92400e', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      Expires {formatExpDate(batch.expirationDate)} ({getDaysLabel(batch.daysUntilExpiry)})
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button style={{ padding: '6px 12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
                      Discard
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tabbed Section: Product Inventory & Recent Movements */}
        <div className={styles.sectionCard}>
          {/* Tab Header */}
          <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
            <button
              onClick={() => setActiveTab('inventory')}
              style={{
                flex: 1,
                padding: '14px 20px',
                background: activeTab === 'inventory' ? '#fff' : '#f9fafb',
                border: 'none',
                borderBottom: activeTab === 'inventory' ? '2px solid #FF580F' : '2px solid transparent',
                color: activeTab === 'inventory' ? '#FF580F' : '#6b7280',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              </svg>
              Product Inventory
            </button>
            <button
              onClick={() => setActiveTab('movements')}
              style={{
                flex: 1,
                padding: '14px 20px',
                background: activeTab === 'movements' ? '#fff' : '#f9fafb',
                border: 'none',
                borderBottom: activeTab === 'movements' ? '2px solid #FF580F' : '2px solid transparent',
                color: activeTab === 'movements' ? '#FF580F' : '#6b7280',
                fontWeight: 600,
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
              Recent Movements
            </button>
          </div>

          {/* Tab Content */}
          <div className={styles.sectionBody}>
            {/* Product Inventory Tab */}
            {activeTab === 'inventory' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                  <button
                    onClick={() => setShowAllProducts(!showAllProducts)}
                    style={{
                      padding: '6px 12px',
                      background: '#f3f4f6',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#374151',
                      cursor: 'pointer',
                    }}
                  >
                    {showAllProducts ? 'Show Less' : `Show All (${productInventory.length})`}
                  </button>
                </div>
                {productInventory.length === 0 ? (
                  <div className={styles.emptyState}>
                    <p>No inventory on hand.</p>
                  </div>
                ) : (
                  <div>
                    {/* Header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 80px', gap: '8px', padding: '8px 12px', background: '#f3f4f6', borderRadius: '8px', fontSize: '12px', fontWeight: 600, color: '#6b7280', marginBottom: '8px' }}>
                      <div>Product</div>
                      <div style={{ textAlign: 'right' }}>On-Hand</div>
                      <div style={{ textAlign: 'right' }}>In Machine</div>
                      <div style={{ textAlign: 'right' }}>Unit Cost</div>
                      <div style={{ textAlign: 'right' }}>Earliest Exp</div>
                      <div style={{ textAlign: 'right' }}>Actions</div>
                    </div>
                    {/* Rows */}
                    {(showAllProducts ? productInventory : productInventory.slice(0, 5)).map((inv) => (
                      <div
                        key={inv.product.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 80px',
                          gap: '8px',
                          padding: '10px 12px',
                          borderBottom: '1px solid #e5e7eb',
                          fontSize: '13px',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          {inv.product.brand && <span style={{ color: '#FF580F', fontSize: '10px', textTransform: 'uppercase', fontWeight: 700 }}>{inv.product.brand} </span>}
                          <span style={{ fontWeight: 500 }}>{inv.product.name}</span>
                        </div>
                        <div style={{ textAlign: 'right', fontWeight: 600, color: '#FF580F' }}>{inv.onHandQty}</div>
                        <div style={{ textAlign: 'right', color: '#6b7280' }}>{inv.inMachineQty}</div>
                        <div style={{ textAlign: 'right', color: '#6b7280' }}>{inv.unitCost ? `$${inv.unitCost.toFixed(2)}` : '—'}</div>
                        <div style={{
                          textAlign: 'right',
                          fontSize: '12px',
                          color: inv.expirationStatus === 'critical' ? '#dc2626' : inv.expirationStatus === 'warning' ? '#f59e0b' : '#22c55e',
                          fontWeight: inv.expirationStatus === 'critical' || inv.expirationStatus === 'warning' ? 600 : 400,
                        }}>
                          {inv.earliestExpiration ? formatExpDate(inv.earliestExpiration) : '—'}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <Link
                            href={`/admin/inventory/adjust?product=${inv.product.id}`}
                            style={{
                              padding: '4px 8px',
                              background: '#f3f4f6',
                              color: '#374151',
                              border: 'none',
                              borderRadius: '4px',
                              fontSize: '11px',
                              textDecoration: 'none',
                              display: 'inline-block',
                            }}
                          >
                            Adjust
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Recent Movements Tab */}
            {activeTab === 'movements' && (
              <>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                  <Link
                    href="/admin/inventory/movements"
                    style={{
                      padding: '6px 12px',
                      background: '#f3f4f6',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#374151',
                      textDecoration: 'none',
                    }}
                  >
                    View All
                  </Link>
                </div>
                {recentMovements.length === 0 ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                      </svg>
                    </div>
                    <p>No inventory movements yet.</p>
                    <p>Start by receiving items or importing sales data.</p>
                  </div>
                ) : (
                  <div className={styles.movementList}>
                    {recentMovements.map((movement) => (
                      <div key={movement.id} className={styles.movementItem}>
                        <div className={`${styles.movementIcon} ${styles[getMovementIcon(movement.movement_type)]}`}>
                          {movement.movement_type === 'purchase_in' || movement.movement_type === 'restock_in' ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="12" y1="5" x2="12" y2="19" />
                              <polyline points="19 12 12 19 5 12" />
                            </svg>
                          ) : movement.movement_type === 'sold' ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="12" y1="1" x2="12" y2="23" />
                              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                            </svg>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="12" y1="19" x2="12" y2="5" />
                              <polyline points="5 12 12 5 19 12" />
                            </svg>
                          )}
                        </div>
                        <div className={styles.movementInfo}>
                          <div className={styles.movementProduct}>
                            {movement.product?.name || 'Unknown Product'}
                          </div>
                          <div className={styles.movementMeta}>
                            {getMovementLabel(movement.movement_type)} • {formatDate(movement.created_at)}
                          </div>
                        </div>
                        <div className={`${styles.movementQty} ${movement.quantity >= 0 ? styles.positive : styles.negative}`}>
                          {movement.quantity >= 0 ? '+' : ''}{movement.quantity}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
