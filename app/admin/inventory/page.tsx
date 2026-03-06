'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AdminShell } from '../components/AdminShell';
import { adminFetch, AuthError } from '@/lib/admin-fetch';
import styles from './inventory.module.css';

interface SummaryStats {
  totalProducts: number;
  onHandQty: number;
  availableQty: number;
  totalValue: number;
  expiringCritical: number;
  expiringWarning: number;
}

interface ExpiringItem {
  productId: string;
  productName: string;
  productBrand: string | null;
  quantity: number;
  expirationDate: string;
  daysUntil: number;
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
  const [expiringItems, setExpiringItems] = useState<ExpiringItem[]>([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [productsRes, purchaseItemsRes, movementsRes, expirationRes] = await Promise.all([
        adminFetch('/api/admin/crud', {
          method: 'POST',
          body: JSON.stringify({ table: 'products', action: 'read' }),
        }),
        adminFetch('/api/admin/crud', {
          method: 'POST',
          body: JSON.stringify({ table: 'inventory_purchase_items', action: 'read' }),
        }),
        adminFetch('/api/admin/crud', {
          method: 'POST',
          body: JSON.stringify({ table: 'inventory_movements', action: 'read' }),
        }),
        adminFetch('/api/admin/crud', {
          method: 'POST',
          body: JSON.stringify({ table: 'expiration_settings', action: 'read' }),
        }),
      ]);

      const productsData = await productsRes.json();
      const purchaseItemsData = await purchaseItemsRes.json();
      const movementsData = await movementsRes.json();
      const expSettingsData = await expirationRes.json();

      const products = productsData.data || [];
      const purchaseItems = purchaseItemsData.data || [];
      const movements = movementsData.data || [];
      const expSettings = expSettingsData.data || [];

      // Create maps
      type Product = { id: string; name: string; brand: string | null; units_per_package?: number; category: string };
      type ExpSetting = { category: string; warning_days: number; critical_days: number };
      const productsMap = new Map<string, Product>(products.map((p: Product) => [p.id, p]));
      const expSettingsMap = new Map<string, ExpSetting>(expSettings.map((s: ExpSetting) => [s.category, s]));

      const getExpSettings = (category: string): ExpSetting => {
        return expSettingsMap.get(category) || { category, warning_days: 14, critical_days: 3 };
      };

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Group movements by purchase_item_id
      // All movements are stored in INDIVIDUAL UNITS (not packages)
      const movementsByPurchaseItem = new Map<string, { restocked: number; discarded: number }>();
      for (const m of movements) {
        if (m.purchase_item_id) {
          const existing = movementsByPurchaseItem.get(m.purchase_item_id) || { restocked: 0, discarded: 0 };

          if (m.movement_type === 'restock_out') {
            existing.restocked += Math.abs(m.quantity); // Already in units
          } else if (m.movement_type === 'shrinkage') {
            existing.discarded += Math.abs(m.quantity); // Already in units
          }
          movementsByPurchaseItem.set(m.purchase_item_id, existing);
        }
      }

      // Calculate in-machine from restock_in movements
      // All movements are stored in INDIVIDUAL UNITS (not packages)
      let totalInMachine = 0;
      for (const m of movements) {
        if (m.movement_type === 'restock_in') {
          totalInMachine += m.quantity; // Already in units
        } else if (m.movement_type === 'sold') {
          totalInMachine -= m.quantity; // Already in units
        }
      }

      // Calculate stats from purchase items
      let totalOnHand = 0;
      let totalValue = 0;
      let expiringCritical = 0;
      let expiringWarning = 0;
      const expiringSoon: ExpiringItem[] = [];

      for (const pi of purchaseItems) {
        const product = productsMap.get(pi.product_id);
        if (!product) continue;

        const mvmts = movementsByPurchaseItem.get(pi.id) || { restocked: 0, discarded: 0 };
        // pi.quantity is PACKAGES, convert to units
        const unitsPerPkg = product.units_per_package || 1;
        const totalUnitsReceived = pi.quantity * unitsPerPkg;
        const remaining = totalUnitsReceived - mvmts.restocked - mvmts.discarded;

        if (remaining > 0) {
          totalOnHand += remaining;
          if (pi.unit_cost) {
            totalValue += remaining * pi.unit_cost;
          }

          // Check expiration
          if (pi.expiration_date) {
            const expDate = new Date(pi.expiration_date);
            const daysUntil = Math.ceil((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            const settings = getExpSettings(product.category);

            if (daysUntil <= settings.critical_days) {
              expiringCritical++;
            } else if (daysUntil <= settings.warning_days) {
              expiringWarning++;
            }

            // Track items expiring within 10 days
            if (daysUntil <= 10) {
              expiringSoon.push({
                productId: product.id,
                productName: product.name,
                productBrand: product.brand,
                quantity: remaining,
                expirationDate: pi.expiration_date,
                daysUntil,
              });
            }
          }
        }
      }

      // Sort by days until expiry (soonest first)
      expiringSoon.sort((a, b) => a.daysUntil - b.daysUntil);
      setExpiringItems(expiringSoon);

      setStats({
        totalProducts: products.length,
        onHandQty: totalOnHand,
        availableQty: Math.max(0, totalInMachine),
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

        {/* Quick Actions - All buttons */}
        <div className={styles.quickActions}>
          <Link href="/admin/inventory/receive" className={`${styles.actionButton} ${styles.primary}`}>
            <svg className={styles.actionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
              <line x1="12" y1="8" x2="12" y2="16" /><line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            Receive
          </Link>
          <Link href="/admin/inventory/stock" className={styles.actionButton}>
            <svg className={styles.actionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
            View Stock
          </Link>
          <Link href="/admin/inventory/activity" className={styles.actionButton}>
            <svg className={styles.actionIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
            </svg>
            Activity
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
        </div>

        {/* Expiring Soon Card */}
        {expiringItems.length > 0 && (
          <div className={styles.sectionCard} style={{ marginTop: '8px' }}>
            <div className={styles.sectionHeader} style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
              <h2 className={styles.sectionTitle} style={{ color: '#dc2626', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '18px' }}>⚠️</span> Expiring Soon
              </h2>
            </div>
            <div className={styles.sectionBody} style={{ padding: '0' }}>
              {expiringItems.map((item, idx) => (
                <div
                  key={`${item.productId}-${idx}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderBottom: idx < expiringItems.length - 1 ? '1px solid #f3f4f6' : 'none',
                  }}
                >
                  <div>
                    {item.productBrand && (
                      <span style={{ color: '#FF580F', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>
                        {item.productBrand}{' '}
                      </span>
                    )}
                    <span style={{ fontWeight: 500 }}>{item.productName}</span>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>
                      {item.quantity} units
                    </div>
                  </div>
                  <div style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: 600,
                    background: item.daysUntil <= 3 ? '#fef2f2' : '#fef3c7',
                    color: item.daysUntil <= 3 ? '#dc2626' : '#92400e',
                  }}>
                    {item.daysUntil <= 0 ? 'EXPIRED' : item.daysUntil === 1 ? '1 day' : `${item.daysUntil} days`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
