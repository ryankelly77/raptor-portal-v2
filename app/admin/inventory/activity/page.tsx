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
  units_per_package?: number;
}

interface Movement {
  id: string;
  product_id: string;
  quantity: number;
  movement_type: string;
  moved_by: string;
  notes: string | null;
  created_at: string;
  expiration_date: string | null;
  purchase_item_id: string | null;
}

interface MovementWithProduct extends Movement {
  product: Product | null;
}

export default function ActivityPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [movements, setMovements] = useState<MovementWithProduct[]>([]);
  const [filter, setFilter] = useState<string>('all');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [productsRes, movementsRes] = await Promise.all([
        adminFetch('/api/admin/crud', { method: 'POST', body: JSON.stringify({ table: 'products', action: 'read' }) }),
        adminFetch('/api/admin/crud', { method: 'POST', body: JSON.stringify({ table: 'inventory_movements', action: 'read' }) }),
      ]);

      const products: Product[] = (await productsRes.json()).data || [];
      const rawMovements: Movement[] = (await movementsRes.json()).data || [];

      const productsMap = new Map(products.map(p => [p.id, p]));

      // Join movements with products and sort by date (newest first)
      const movementsWithProducts: MovementWithProduct[] = rawMovements
        .map(m => ({
          ...m,
          product: productsMap.get(m.product_id) || null,
        }))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setMovements(movementsWithProducts);
    } catch (err) {
      if (!(err instanceof AuthError)) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const getMovementIcon = (type: string) => {
    switch (type) {
      case 'purchase':
      case 'receive':
        return { icon: '📦', class: styles.in, label: 'Received' };
      case 'restock_in':
        return { icon: '🏪', class: styles.in, label: 'Stocked' };
      case 'restock_out':
        return { icon: '📤', class: styles.out, label: 'To Machine' };
      case 'sold':
        return { icon: '💵', class: styles.sold, label: 'Sold' };
      case 'shrinkage':
        return { icon: '🗑️', class: styles.out, label: 'Discarded' };
      case 'adjustment':
        return { icon: '📝', class: styles.adjust, label: 'Adjusted' };
      default:
        return { icon: '📋', class: styles.adjust, label: type };
    }
  };

  const formatDateTime = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const filteredMovements = movements.filter(m => {
    if (filter === 'all') return true;
    if (filter === 'in') return ['purchase', 'receive', 'restock_in'].includes(m.movement_type);
    if (filter === 'out') return ['restock_out', 'sold', 'shrinkage'].includes(m.movement_type);
    if (filter === 'adjust') return m.movement_type === 'adjustment';
    return true;
  });

  if (loading) {
    return (
      <AdminShell title="Activity">
        <div className={styles.inventoryPage}>
          <div className={styles.loading}><div className={styles.spinner} /></div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Activity">
      <div className={styles.inventoryPage}>
        <Link href="/admin/inventory" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#6b7280', fontSize: '14px', marginBottom: '16px', textDecoration: 'none' }}>
          ← Back to Inventory
        </Link>

        {error && (
          <div style={{ background: '#fef2f2', color: '#dc2626', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>
        )}

        {/* Filter Tabs */}
        <div className={styles.categoryTabs}>
          <button
            className={`${styles.categoryTab} ${filter === 'all' ? styles.active : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={`${styles.categoryTab} ${filter === 'in' ? styles.active : ''}`}
            onClick={() => setFilter('in')}
          >
            In
          </button>
          <button
            className={`${styles.categoryTab} ${filter === 'out' ? styles.active : ''}`}
            onClick={() => setFilter('out')}
          >
            Out
          </button>
          <button
            className={`${styles.categoryTab} ${filter === 'adjust' ? styles.active : ''}`}
            onClick={() => setFilter('adjust')}
          >
            Adjustments
          </button>
        </div>

        {filteredMovements.length === 0 ? (
          <div className={styles.emptyState}>
            <p>No activity recorded yet.</p>
          </div>
        ) : (
          <div className={styles.sectionCard}>
            <div className={styles.sectionBody} style={{ padding: '0' }}>
              <div className={styles.movementList}>
                {filteredMovements.map((m) => {
                  const { icon, class: iconClass, label } = getMovementIcon(m.movement_type);
                  const isPositive = m.quantity > 0;

                  return (
                    <div key={m.id} className={styles.movementItem} style={{ padding: '14px 16px' }}>
                      <div className={`${styles.movementIcon} ${iconClass}`}>
                        <span style={{ fontSize: '18px' }}>{icon}</span>
                      </div>
                      <div className={styles.movementInfo}>
                        <div className={styles.movementProduct}>
                          {m.product?.brand && <span style={{ color: '#FF580F' }}>{m.product.brand} </span>}
                          {m.product?.name || 'Unknown Product'}
                        </div>
                        <div className={styles.movementMeta}>
                          {label} • {formatDateTime(m.created_at)}
                          {m.moved_by && ` • ${m.moved_by}`}
                        </div>
                        {m.notes && (
                          <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px', fontStyle: 'italic' }}>
                            {m.notes}
                          </div>
                        )}
                      </div>
                      <div className={`${styles.movementQty} ${isPositive ? styles.positive : styles.negative}`}>
                        {isPositive ? '+' : ''}{m.quantity}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
