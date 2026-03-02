'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AdminShell } from '../components/AdminShell';
import { adminFetch, AuthError } from '@/lib/admin-fetch';
import styles from './inventory.module.css';

// BUILD VERSION - update this to verify deployment
const BUILD_VERSION = 'v2024-MAR02-L';

interface Product {
  id: string;
  name: string;
  brand?: string | null;
  barcode: string;
  category: string;
  default_price: number | null;
  units_per_package?: number;
  unit_name?: string;
  package_name?: string;
}

interface Purchase {
  id: string;
  store_name: string;
  purchased_by: string;
  receipt_total: number | null;
  receipt_image_url: string | null;
  created_at: string;
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
  avgUnitCost: number | null;
  totalValue: number;
  earliestExpiration: string | null;
  expirationStatus: 'critical' | 'warning' | 'ok' | null;
  lastReceived: string | null;
  batchCount: number;
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
  const [productInventory, setProductInventory] = useState<ProductWithBatches[]>([]);
  const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'inventory' | 'movements'>('inventory');
  const [receiptModal, setReceiptModal] = useState<string | null>(null);

  // Batch action states
  const [actionBatch, setActionBatch] = useState<{ batch: Batch; action: 'restock' | 'discard' | 'adjust' } | null>(null);
  const [actionQty, setActionQty] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [actionSaving, setActionSaving] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Load all data in parallel
      const [productsRes, movementsRes, purchaseItemsRes, purchasesRes, expirationRes] = await Promise.all([
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
          body: JSON.stringify({ table: 'inventory_purchases', action: 'read' }),
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

      const movementsData = await movementsRes.json();
      const movementsList: Movement[] = movementsData.data || [];

      const purchaseItemsData = await purchaseItemsRes.json();
      const purchaseItemsList: PurchaseItem[] = purchaseItemsData.data || [];

      const purchasesData = await purchasesRes.json();
      const purchasesList: Purchase[] = purchasesData.data || [];

      const expSettingsData = await expirationRes.json();
      const expSettings = expSettingsData.data || [];

      // DEBUG: Log what we loaded and set visible debug info
      const debugStr = `Products: ${productsList.length} | Movements: ${movementsList.length} | PurchaseItems: ${purchaseItemsList.length} | Purchases: ${purchasesList.length}`;
      console.log('[Inventory] Loaded:', debugStr);
      setDebugInfo(debugStr);

      // Create maps for lookups
      const productsMap = new Map(productsList.map(p => [p.id, p]));
      const purchasesMap = new Map(purchasesList.map(p => [p.id, p]));
      const expSettingsMap = new Map<string, { category: string; warning_days: number; critical_days: number }>(
        expSettings.map((s: { category: string; warning_days: number; critical_days: number }) => [s.category, s])
      );

      const getExpSettings = (category: string): { warning_days: number; critical_days: number } => {
        return expSettingsMap.get(category) || { warning_days: 14, critical_days: 3 };
      };

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Calculate remaining qty for each purchase item (batch)
      // Group movements by purchase_item_id
      const movementsByPurchaseItem = new Map<string, Movement[]>();
      const unlinkedMovements: Movement[] = [];

      for (const m of movementsList) {
        if (m.purchase_item_id) {
          const existing = movementsByPurchaseItem.get(m.purchase_item_id) || [];
          existing.push(m);
          movementsByPurchaseItem.set(m.purchase_item_id, existing);
        } else {
          unlinkedMovements.push(m);
        }
      }

      // Build batches from purchase items
      const batchesByProduct = new Map<string, Batch[]>();

      for (const purchaseItem of purchaseItemsList) {
        const product = productsMap.get(purchaseItem.product_id);
        if (!product) continue;

        const purchase = purchasesMap.get(purchaseItem.purchase_id) || null;
        const movements = movementsByPurchaseItem.get(purchaseItem.id) || [];

        // Calculate quantities (movements store packages, multiply by units_per_package)
        const unitsPerPkg = product.units_per_package || 1;
        let restockedQty = 0;
        let discardedQty = 0;

        for (const m of movements) {
          if (m.movement_type === 'restock_out') {
            restockedQty += Math.abs(m.quantity) * unitsPerPkg;
          } else if (m.movement_type === 'shrinkage') {
            discardedQty += Math.abs(m.quantity);  // Shrinkage is already in units
          }
        }

        const originalQty = purchaseItem.quantity;
        const remainingQty = originalQty - restockedQty - discardedQty;

        // Only include batches with remaining qty > 0
        if (remainingQty <= 0) continue;

        // Calculate expiration status
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
          originalQty,
          restockedQty,
          discardedQty,
          remainingQty,
          unitCost: purchaseItem.unit_cost,
          expirationDate: purchaseItem.expiration_date,
          daysUntilExpiry,
          expirationStatus,
          isOldest: false, // Will set below
        };

        const existing = batchesByProduct.get(product.id) || [];
        existing.push(batch);
        batchesByProduct.set(product.id, existing);
      }

      // Sort batches by FIFO (oldest expiration first, then oldest purchase date)
      // Mark oldest batch for each product
      for (const [, batches] of batchesByProduct) {
        batches.sort((a, b) => {
          // First by expiration date (earliest first)
          if (a.expirationDate && b.expirationDate) {
            const diff = new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime();
            if (diff !== 0) return diff;
          } else if (a.expirationDate) {
            return -1;
          } else if (b.expirationDate) {
            return 1;
          }
          // Then by purchase date (oldest first)
          return new Date(a.purchaseItem.created_at).getTime() - new Date(b.purchaseItem.created_at).getTime();
        });

        if (batches.length > 0) {
          batches[0].isOldest = true;
        }
      }

      // Also calculate in-machine quantities from movements
      // Note: Movements store packages, multiply by units_per_package
      const productInMachine = new Map<string, number>();
      for (const m of movementsList) {
        const product = productsMap.get(m.product_id);
        const unitsPerPkg = product?.units_per_package || 1;
        const current = productInMachine.get(m.product_id) || 0;

        if (m.movement_type === 'restock_in') {
          productInMachine.set(m.product_id, current + (m.quantity * unitsPerPkg));
        } else if (m.movement_type === 'sold' || m.movement_type === 'shrinkage') {
          productInMachine.set(m.product_id, current - m.quantity); // These are in units
        }
      }

      // Build product inventory with batches
      const inventoryList: ProductWithBatches[] = [];
      let totalOnHand = 0;
      let totalInMachine = 0;
      let totalValue = 0;
      let expiringCritical = 0;
      let expiringWarning = 0;

      for (const product of productsList) {
        const batches = batchesByProduct.get(product.id) || [];
        const inMachineQty = Math.max(0, productInMachine.get(product.id) || 0);

        if (batches.length === 0 && inMachineQty === 0) continue;

        // Calculate totals from batches
        let productOnHand = 0;
        let totalCost = 0;
        let earliestExp: string | null = null;
        let lastReceived: string | null = null;
        let worstStatus: 'critical' | 'warning' | 'ok' | null = null;

        for (const batch of batches) {
          productOnHand += batch.remainingQty;
          if (batch.unitCost) {
            totalCost += batch.remainingQty * batch.unitCost;
          }

          if (batch.expirationDate) {
            if (!earliestExp || new Date(batch.expirationDate) < new Date(earliestExp)) {
              earliestExp = batch.expirationDate;
            }
          }

          if (!lastReceived || new Date(batch.purchaseItem.created_at) > new Date(lastReceived)) {
            lastReceived = batch.purchaseItem.created_at;
          }

          // Track worst expiration status
          if (batch.expirationStatus === 'critical') {
            worstStatus = 'critical';
            expiringCritical++;
          } else if (batch.expirationStatus === 'warning' && worstStatus !== 'critical') {
            worstStatus = 'warning';
            expiringWarning++;
          } else if (batch.expirationStatus === 'ok' && !worstStatus) {
            worstStatus = 'ok';
          }
        }

        const avgUnitCost = productOnHand > 0 ? totalCost / productOnHand : null;
        const productValue = productOnHand * (avgUnitCost || 0) + inMachineQty * (avgUnitCost || 0);

        totalOnHand += productOnHand;
        totalInMachine += inMachineQty;
        totalValue += productValue;

        inventoryList.push({
          product,
          batches,
          totalOnHand: productOnHand,
          totalInMachine: inMachineQty,
          avgUnitCost,
          totalValue: productValue,
          earliestExpiration: earliestExp,
          expirationStatus: worstStatus,
          lastReceived,
          batchCount: batches.length,
        });
      }

      // Sort by expiration urgency, then by on-hand qty
      inventoryList.sort((a, b) => {
        if (a.expirationStatus === 'critical' && b.expirationStatus !== 'critical') return -1;
        if (b.expirationStatus === 'critical' && a.expirationStatus !== 'critical') return 1;
        if (a.expirationStatus === 'warning' && b.expirationStatus !== 'warning') return -1;
        if (b.expirationStatus === 'warning' && a.expirationStatus !== 'warning') return 1;
        return b.totalOnHand - a.totalOnHand;
      });

      setProductInventory(inventoryList);

      // Recent movements with products
      const movementsWithProducts = movementsList
        .map(m => ({ ...m, product: productsMap.get(m.product_id) }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 20);
      setRecentMovements(movementsWithProducts);

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

  const toggleExpanded = (productId: string) => {
    setExpandedProducts(prev => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  };

  const handleBatchAction = async () => {
    if (!actionBatch || !actionQty) return;

    const qty = parseInt(actionQty);
    if (isNaN(qty) || qty <= 0) return;

    setActionSaving(true);
    try {
      let movementType = '';
      let movementQty = 0;

      switch (actionBatch.action) {
        case 'restock':
          movementType = 'restock_out';
          movementQty = -qty; // Negative for out
          break;
        case 'discard':
          movementType = 'shrinkage';
          movementQty = -qty;
          break;
        case 'adjust':
          movementType = 'adjustment';
          movementQty = qty - actionBatch.batch.remainingQty; // Difference
          break;
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

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save');
      }

      setActionBatch(null);
      setActionQty('');
      setActionReason('');
      loadData();

    } catch (err) {
      alert('Error: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setActionSaving(false);
    }
  };

  function formatDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }

  function formatExpDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatPurchaseDate(dateStr: string) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function getDaysLabel(days: number | null) {
    if (days === null) return '';
    if (days < 0) return 'EXPIRED';
    if (days === 0) return 'TODAY';
    if (days === 1) return '1 day';
    return `${days} days`;
  }

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
      case 'purchase_in': return 'Received';
      case 'restock_out': return 'Sent to machine';
      case 'restock_in': return 'Loaded in machine';
      case 'sold': return 'Sold';
      case 'shrinkage': return 'Shrinkage';
      case 'adjustment': return 'Adjustment';
      default: return type;
    }
  }

  function getCategoryColor(category: string) {
    switch (category.toLowerCase()) {
      case 'beverage': return { bg: '#dbeafe', color: '#2563eb' };
      case 'snack': return { bg: '#fff7ed', color: '#ea580c' };
      case 'meal': return { bg: '#dcfce7', color: '#16a34a' };
      case 'candy': return { bg: '#fce7f3', color: '#db2777' };
      default: return { bg: '#f3f4f6', color: '#6b7280' };
    }
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
        {/* Build Version + Debug Info + Nuke Button */}
        <div style={{ background: '#fef3c7', color: '#92400e', padding: '8px 12px', borderRadius: '6px', marginBottom: '16px', fontSize: '11px', fontFamily: 'monospace' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Build: {BUILD_VERSION}</span>
          </div>
          {debugInfo && (
            <div style={{ marginTop: '4px', fontSize: '10px', color: '#78716c' }}>
              DB: {debugInfo}
            </div>
          )}
          <button
            onClick={async () => {
              if (!confirm('⚠️ NUKE ALL INVENTORY DATA?\n\nThis will delete:\n- All inventory movements\n- All purchase items\n- All purchases\n\nProducts will NOT be deleted.')) return;
              if (!confirm('⚠️ FINAL WARNING! Click OK to proceed.')) return;
              try {
                const tables = ['inventory_movements', 'inventory_purchase_items', 'inventory_purchases'];
                for (const table of tables) {
                  const res = await adminFetch('/api/admin/crud', { method: 'POST', body: JSON.stringify({ table, action: 'read' }) });
                  const data = await res.json();
                  for (const item of (data.data || [])) {
                    await adminFetch('/api/admin/crud', { method: 'POST', body: JSON.stringify({ table, action: 'delete', id: item.id }) });
                  }
                }
                alert('💥 Inventory data nuked!');
                window.location.reload();
              } catch (err) {
                alert('Failed: ' + (err instanceof Error ? err.message : 'Unknown'));
              }
            }}
            style={{ padding: '4px 12px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
          >
            ☢️ NUKE
          </button>
        </div>

        {error && (
          <div style={{ background: '#fef2f2', color: '#dc2626', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {/* Summary Cards */}
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Products</div>
            <div className={styles.summaryValue}>{stats.totalProducts}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>On-Hand</div>
            <div className={`${styles.summaryValue} ${styles.orange}`}>{stats.onHandQty}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>In Machine</div>
            <div className={styles.summaryValue}>{stats.availableQty}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Total Value</div>
            <div className={styles.summaryValue}>${stats.totalValue.toFixed(2)}</div>
          </div>
          {(stats.expiringCritical > 0 || stats.expiringWarning > 0) && (
            <div className={styles.summaryCard} style={{ background: stats.expiringCritical > 0 ? '#fef2f2' : '#fef3c7', border: `2px solid ${stats.expiringCritical > 0 ? '#dc2626' : '#f59e0b'}` }}>
              <div className={styles.summaryLabel} style={{ color: stats.expiringCritical > 0 ? '#dc2626' : '#92400e' }}>Expiring</div>
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
              <line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            Receive
          </Link>
          <Link href="/admin/inventory/restock" className={styles.actionButton}>
            <svg className={styles.actionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="7" width="20" height="14" rx="2" />
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
            </svg>
            Restock
          </Link>
          <Link href="/admin/inventory/adjust" className={styles.actionButton}>
            <svg className={styles.actionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 20V10" /><path d="M18 20V4" /><path d="M6 20v-4" />
            </svg>
            Adjust
          </Link>
          <Link href="/admin/inventory/products" className={styles.actionButton}>
            <svg className={styles.actionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
            </svg>
            Catalog
          </Link>
          <Link href="/admin/inventory/aliases" className={styles.actionButton}>
            <svg className={styles.actionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M15 3h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4" />
              <line x1="12" y1="15" x2="12" y2="21" /><polyline points="9 18 12 21 15 18" />
            </svg>
            Aliases
          </Link>
        </div>

        {/* Tabbed Content */}
        <div className={styles.sectionCard}>
          <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
            <button
              onClick={() => setActiveTab('inventory')}
              style={{
                flex: 1, padding: '14px 20px',
                background: activeTab === 'inventory' ? '#fff' : '#f9fafb',
                border: 'none',
                borderBottom: activeTab === 'inventory' ? '2px solid #FF580F' : '2px solid transparent',
                color: activeTab === 'inventory' ? '#FF580F' : '#6b7280',
                fontWeight: 600, fontSize: '14px', cursor: 'pointer',
              }}
            >
              Product Inventory
            </button>
            <button
              onClick={() => setActiveTab('movements')}
              style={{
                flex: 1, padding: '14px 20px',
                background: activeTab === 'movements' ? '#fff' : '#f9fafb',
                border: 'none',
                borderBottom: activeTab === 'movements' ? '2px solid #FF580F' : '2px solid transparent',
                color: activeTab === 'movements' ? '#FF580F' : '#6b7280',
                fontWeight: 600, fontSize: '14px', cursor: 'pointer',
              }}
            >
              Recent Movements
            </button>
          </div>

          <div className={styles.sectionBody}>
            {/* Product Inventory Tab */}
            {activeTab === 'inventory' && (
              <>
                {productInventory.length === 0 ? (
                  <div className={styles.emptyState}>
                    <p>No inventory on hand. Start by receiving items.</p>
                  </div>
                ) : (
                  <div>
                    {/* Header */}
                    <div style={{ display: 'grid', gridTemplateColumns: '24px 2fr 70px 70px 70px 80px 70px 80px 50px', gap: '8px', padding: '8px 12px', background: '#f3f4f6', borderRadius: '8px', fontSize: '11px', fontWeight: 600, color: '#6b7280', marginBottom: '4px' }}>
                      <div></div>
                      <div>Product</div>
                      <div style={{ textAlign: 'center' }}>Cat</div>
                      <div style={{ textAlign: 'right' }}>On-Hand</div>
                      <div style={{ textAlign: 'right' }}>Machine</div>
                      <div style={{ textAlign: 'right' }}>Avg Cost</div>
                      <div style={{ textAlign: 'right' }}>Value</div>
                      <div style={{ textAlign: 'right' }}>Expires</div>
                      <div style={{ textAlign: 'center' }}>Lots</div>
                    </div>

                    {/* Product Rows */}
                    {productInventory.map((inv) => (
                      <div key={inv.product.id}>
                        {/* Summary Row */}
                        <div
                          onClick={() => toggleExpanded(inv.product.id)}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '24px 2fr 70px 70px 70px 80px 70px 80px 50px',
                            gap: '8px',
                            padding: '12px',
                            borderBottom: expandedProducts.has(inv.product.id) ? 'none' : '1px solid #e5e7eb',
                            fontSize: '13px',
                            alignItems: 'center',
                            cursor: 'pointer',
                            background: expandedProducts.has(inv.product.id) ? '#f9fafb' : 'transparent',
                          }}
                        >
                          <div style={{ color: '#6b7280' }}>
                            {expandedProducts.has(inv.product.id) ? '▼' : '▶'}
                          </div>
                          <div>
                            {inv.product.brand && <span style={{ color: '#FF580F', fontSize: '10px', textTransform: 'uppercase', fontWeight: 700 }}>{inv.product.brand} </span>}
                            <span style={{ fontWeight: 500 }}>{inv.product.name}</span>
                          </div>
                          <div style={{ textAlign: 'center' }}>
                            <span style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 600,
                              background: getCategoryColor(inv.product.category).bg,
                              color: getCategoryColor(inv.product.category).color,
                            }}>
                              {inv.product.category.slice(0, 4).toUpperCase()}
                            </span>
                          </div>
                          <div style={{ textAlign: 'right', fontWeight: 600, color: '#FF580F' }}>{inv.totalOnHand}</div>
                          <div style={{ textAlign: 'right', color: '#6b7280' }}>{inv.totalInMachine}</div>
                          <div style={{ textAlign: 'right', color: '#6b7280' }}>{inv.avgUnitCost ? `$${inv.avgUnitCost.toFixed(2)}` : '—'}</div>
                          <div style={{ textAlign: 'right', color: '#374151', fontWeight: 500 }}>${inv.totalValue.toFixed(2)}</div>
                          <div style={{
                            textAlign: 'right',
                            fontSize: '12px',
                            color: inv.expirationStatus === 'critical' ? '#dc2626' : inv.expirationStatus === 'warning' ? '#f59e0b' : '#22c55e',
                            fontWeight: inv.expirationStatus !== 'ok' ? 600 : 400,
                          }}>
                            {inv.earliestExpiration ? formatExpDate(inv.earliestExpiration) : '—'}
                          </div>
                          <div style={{ textAlign: 'center', color: '#6b7280' }}>{inv.batchCount}</div>
                        </div>

                        {/* Expanded Batches */}
                        {expandedProducts.has(inv.product.id) && (
                          <div style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb', padding: '0 12px 12px' }}>
                            {inv.batches.map((batch, idx) => (
                              <div
                                key={batch.purchaseItem.id}
                                style={{
                                  background: '#fff',
                                  border: batch.isOldest ? '2px solid #22c55e' : '1px solid #e5e7eb',
                                  borderRadius: '8px',
                                  padding: '12px',
                                  marginTop: '8px',
                                }}
                              >
                                {/* Batch Header */}
                                {batch.isOldest && (
                                  <div style={{
                                    background: '#dcfce7',
                                    color: '#16a34a',
                                    padding: '4px 8px',
                                    borderRadius: '4px',
                                    fontSize: '11px',
                                    fontWeight: 700,
                                    marginBottom: '8px',
                                    display: 'inline-block',
                                  }}>
                                    📦 STOCK THIS FIRST
                                  </div>
                                )}

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                                  <div style={{ flex: '1 1 200px' }}>
                                    <div style={{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>
                                      Batch {idx + 1} — {batch.purchase?.store_name || 'Unknown Store'}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                      Purchased: {formatPurchaseDate(batch.purchaseItem.created_at)}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                                      Qty: <strong>{batch.remainingQty}</strong> of {batch.originalQty} remaining
                                      {batch.restockedQty > 0 && <span style={{ color: '#2563eb' }}> ({batch.restockedQty} restocked)</span>}
                                      {batch.discardedQty > 0 && <span style={{ color: '#dc2626' }}> ({batch.discardedQty} discarded)</span>}
                                    </div>
                                    <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                                      Unit Cost: <strong>${batch.unitCost?.toFixed(2) || '—'}</strong>
                                    </div>
                                  </div>

                                  <div style={{ flex: '1 1 150px', textAlign: 'right' }}>
                                    {batch.expirationDate && (
                                      <div style={{
                                        fontSize: '12px',
                                        color: batch.expirationStatus === 'critical' ? '#dc2626' : batch.expirationStatus === 'warning' ? '#f59e0b' : '#22c55e',
                                        fontWeight: 600,
                                      }}>
                                        Exp: {formatExpDate(batch.expirationDate)} ({getDaysLabel(batch.daysUntilExpiry)})
                                        {batch.expirationStatus === 'critical' && ' 🔴'}
                                        {batch.expirationStatus === 'warning' && ' 🟡'}
                                        {batch.expirationStatus === 'ok' && ' 🟢'}
                                      </div>
                                    )}
                                    {batch.purchase?.receipt_image_url && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setReceiptModal(batch.purchase!.receipt_image_url); }}
                                        style={{ fontSize: '11px', color: '#2563eb', background: 'none', border: 'none', cursor: 'pointer', marginTop: '4px' }}
                                      >
                                        View Receipt
                                      </button>
                                    )}
                                  </div>
                                </div>

                                {/* Batch Actions */}
                                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' }}>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setActionBatch({ batch, action: 'restock' }); setActionQty(String(batch.remainingQty)); }}
                                    style={{
                                      padding: '6px 12px',
                                      background: batch.isOldest ? '#FF580F' : '#f3f4f6',
                                      color: batch.isOldest ? '#fff' : '#374151',
                                      border: 'none',
                                      borderRadius: '6px',
                                      fontSize: '12px',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                    }}
                                  >
                                    Restock ▸
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setActionBatch({ batch, action: 'discard' }); setActionQty(String(batch.remainingQty)); }}
                                    style={{ padding: '6px 12px', background: '#fef2f2', color: '#dc2626', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
                                  >
                                    Discard
                                  </button>
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setActionBatch({ batch, action: 'adjust' }); setActionQty(String(batch.remainingQty)); }}
                                    style={{ padding: '6px 12px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
                                  >
                                    Adjust
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Recent Movements Tab */}
            {activeTab === 'movements' && (
              <>
                {recentMovements.length === 0 ? (
                  <div className={styles.emptyState}>
                    <p>No inventory movements yet.</p>
                  </div>
                ) : (
                  <div className={styles.movementList}>
                    {recentMovements.map((movement) => (
                      <div key={movement.id} className={styles.movementItem}>
                        <div className={`${styles.movementIcon} ${styles[getMovementIcon(movement.movement_type)]}`}>
                          {movement.movement_type === 'purchase_in' || movement.movement_type === 'restock_in' ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" />
                            </svg>
                          ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" />
                            </svg>
                          )}
                        </div>
                        <div className={styles.movementInfo}>
                          <div className={styles.movementProduct}>{movement.product?.name || 'Unknown'}</div>
                          <div className={styles.movementMeta}>{getMovementLabel(movement.movement_type)} • {formatDate(movement.created_at)}</div>
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

        {/* Batch Action Modal */}
        {actionBatch && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}>
            <div style={{ background: '#fff', borderRadius: '12px', padding: '20px', maxWidth: '400px', width: '100%' }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '16px' }}>
                {actionBatch.action === 'restock' && 'Restock to Machine'}
                {actionBatch.action === 'discard' && 'Discard Items'}
                {actionBatch.action === 'adjust' && 'Adjust Count'}
              </h3>
              <p style={{ fontSize: '13px', color: '#6b7280', margin: '0 0 16px' }}>
                {actionBatch.batch.product.brand && <strong>{actionBatch.batch.product.brand} </strong>}
                {actionBatch.batch.product.name}
                <br />
                <span style={{ fontSize: '12px' }}>Batch from {actionBatch.batch.purchase?.store_name || 'Unknown'} • {actionBatch.batch.remainingQty} available</span>
              </p>

              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  {actionBatch.action === 'adjust' ? 'New Count' : 'Quantity'}
                </label>
                <input
                  type="number"
                  value={actionQty}
                  onChange={(e) => setActionQty(e.target.value)}
                  max={actionBatch.action !== 'adjust' ? actionBatch.batch.remainingQty : undefined}
                  min={0}
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '16px' }}
                />
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>Reason</label>
                <select
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  style={{ width: '100%', padding: '10px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                >
                  <option value="">Select reason...</option>
                  {actionBatch.action === 'discard' && (
                    <>
                      <option value="Expired">Expired</option>
                      <option value="Damaged">Damaged</option>
                      <option value="Lost">Lost</option>
                      <option value="Other">Other</option>
                    </>
                  )}
                  {actionBatch.action === 'adjust' && (
                    <>
                      <option value="Count correction">Count correction</option>
                      <option value="Found extra">Found extra</option>
                      <option value="Other">Other</option>
                    </>
                  )}
                  {actionBatch.action === 'restock' && (
                    <>
                      <option value="Routine restock">Routine restock</option>
                      <option value="Low stock alert">Low stock alert</option>
                      <option value="Expiring soon">Expiring soon</option>
                    </>
                  )}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => { setActionBatch(null); setActionQty(''); setActionReason(''); }}
                  style={{ flex: 1, padding: '12px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleBatchAction}
                  disabled={actionSaving || !actionQty}
                  style={{
                    flex: 1,
                    padding: '12px',
                    background: actionBatch.action === 'discard' ? '#dc2626' : '#FF580F',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: 600,
                    cursor: actionSaving ? 'wait' : 'pointer',
                    opacity: actionSaving ? 0.7 : 1,
                  }}
                >
                  {actionSaving ? 'Saving...' : 'Confirm'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Receipt Modal */}
        {receiptModal && (
          <div
            onClick={() => setReceiptModal(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '20px' }}
          >
            <div style={{ maxWidth: '600px', maxHeight: '90vh', overflow: 'auto', background: '#fff', borderRadius: '12px', padding: '4px' }}>
              <img src={receiptModal} alt="Receipt" style={{ width: '100%', display: 'block' }} />
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
