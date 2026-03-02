'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AdminShell } from '../components/AdminShell';
import styles from './inventory.module.css';

// BUILD VERSION - update this to verify deployment
const BUILD_VERSION = 'v2024-MAR01-A';

interface Product {
  id: string;
  name: string;
  barcode: string;
  category: string;
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
  product?: Product;
}

interface SummaryStats {
  totalProducts: number;
  onHandQty: number;
  availableQty: number;
  totalValue: number;
}

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('adminToken') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function InventoryPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SummaryStats>({
    totalProducts: 0,
    onHandQty: 0,
    availableQty: 0,
    totalValue: 0,
  });
  const [recentMovements, setRecentMovements] = useState<Movement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Load products
      const productsRes = await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ table: 'products', action: 'read' }),
      });
      const productsData = await productsRes.json();
      const productsList: Product[] = productsData.data || [];
      setProducts(productsList);

      // Load movements
      const movementsRes = await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ table: 'inventory_movements', action: 'read' }),
      });
      const movementsData = await movementsRes.json();
      const movementsList: Movement[] = movementsData.data || [];

      // Map products to movements
      const productsMap = new Map(productsList.map(p => [p.id, p]));
      const movementsWithProducts = movementsList.map(m => ({
        ...m,
        product: productsMap.get(m.product_id),
      }));

      setRecentMovements(movementsWithProducts.slice(0, 20));

      // Calculate stats
      let onHand = 0;
      let available = 0;

      for (const m of movementsList) {
        switch (m.movement_type) {
          case 'purchase_in':
            onHand += m.quantity;
            break;
          case 'restock_out':
            onHand -= m.quantity;
            break;
          case 'restock_in':
            available += m.quantity;
            break;
          case 'sold':
          case 'shrinkage':
            available -= m.quantity;
            break;
          case 'adjustment':
            // Adjustments can be positive or negative, quantity already has sign
            onHand += m.quantity;
            break;
        }
      }

      setStats({
        totalProducts: productsList.length,
        onHandQty: Math.max(0, onHand),
        availableQty: Math.max(0, available),
        totalValue: 0, // TODO: Calculate based on product prices
      });
    } catch (err) {
      console.error('Error loading inventory data:', err);
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

        {/* Summary Cards */}
        <div className={styles.summaryGrid}>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Total Products</div>
            <div className={styles.summaryValue}>{stats.totalProducts}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>On-Hand Qty</div>
            <div className={`${styles.summaryValue} ${styles.orange}`}>{stats.onHandQty}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>In Machines</div>
            <div className={styles.summaryValue}>{stats.availableQty}</div>
          </div>
          <div className={styles.summaryCard}>
            <div className={styles.summaryLabel}>Total Value</div>
            <div className={styles.summaryValue}>${stats.totalValue.toFixed(2)}</div>
          </div>
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
        </div>

        {/* Recent Movements */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionHeader}>
            <h2 className={styles.sectionTitle}>Recent Movements</h2>
            <Link href="/admin/inventory/movements" className={styles.actionButton} style={{ padding: '8px 16px', minHeight: 'auto' }}>
              View All
            </Link>
          </div>
          <div className={styles.sectionBody}>
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
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
