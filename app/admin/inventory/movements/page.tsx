'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminShell } from '../../components/AdminShell';
import styles from '../inventory.module.css';

interface Product {
  id: string;
  name: string;
  barcode: string;
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

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('adminToken') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function MovementsPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const [movementsRes, productsRes] = await Promise.all([
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'inventory_movements', action: 'read' }),
        }),
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'products', action: 'read' }),
        }),
      ]);

      const movementsData = await movementsRes.json();
      const productsData = await productsRes.json();

      const productsList: Product[] = productsData.data || [];
      setProducts(productsList);

      const productsMap = new Map(productsList.map(p => [p.id, p]));
      const movementsList: Movement[] = (movementsData.data || []).map((m: Movement) => ({
        ...m,
        product: productsMap.get(m.product_id),
      }));

      setMovements(movementsList);
    } catch (err) {
      console.error('Error loading movements:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const filteredMovements = filter === 'all'
    ? movements
    : movements.filter(m => m.movement_type === filter);

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
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  if (loading) {
    return (
      <AdminShell title="Movement History">
        <div className={styles.inventoryPage}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Movement History">
      <div className={styles.inventoryPage}>
        {/* Filter Tabs */}
        <div className={styles.categoryTabs}>
          {[
            { key: 'all', label: 'All' },
            { key: 'purchase_in', label: 'Received' },
            { key: 'restock_out', label: 'To Machine' },
            { key: 'sold', label: 'Sold' },
            { key: 'shrinkage', label: 'Shrinkage' },
          ].map((tab) => (
            <button
              key={tab.key}
              className={`${styles.categoryTab} ${filter === tab.key ? styles.active : ''}`}
              onClick={() => setFilter(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Movements List */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionBody}>
            {filteredMovements.length === 0 ? (
              <div className={styles.emptyState}>
                <p>No movements found.</p>
              </div>
            ) : (
              <div className={styles.movementList}>
                {filteredMovements.map((movement) => (
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
                        {getMovementLabel(movement.movement_type)}
                        {movement.moved_by && ` by ${movement.moved_by}`}
                        {' • '}
                        {formatDate(movement.created_at)}
                      </div>
                      {movement.notes && (
                        <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                          {movement.notes}
                        </div>
                      )}
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
