'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AdminShell } from '../../components/AdminShell';
import { adminFetch, AuthError } from '@/lib/admin-fetch';
import styles from '../inventory.module.css';

interface ReceiptAlias {
  id: string;
  store_name: string | null;
  receipt_text: string;
  product_id: string;
  created_at: string;
}

interface Product {
  id: string;
  name: string;
  brand: string | null;
  barcode: string;
}

export default function AliasesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aliases, setAliases] = useState<ReceiptAlias[]>([]);
  const [products, setProducts] = useState<Map<string, Product>>(new Map());
  const [deleting, setDeleting] = useState<string | null>(null);
  const [filterStore, setFilterStore] = useState<string>('all');

  // Get unique store names
  const storeNames = [...new Set(aliases.map(a => a.store_name).filter(Boolean))];

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Load aliases and products in parallel
      const [aliasRes, productRes] = await Promise.all([
        adminFetch('/api/admin/crud', {
          method: 'POST',
          body: JSON.stringify({ table: 'receipt_aliases', action: 'read' }),
        }),
        adminFetch('/api/admin/crud', {
          method: 'POST',
          body: JSON.stringify({ table: 'products', action: 'read' }),
        }),
      ]);

      const aliasData = await aliasRes.json();
      const productData = await productRes.json();

      if (aliasRes.ok && aliasData.data) {
        setAliases(aliasData.data);
      }

      if (productRes.ok && productData.data) {
        const prodMap = new Map<string, Product>();
        for (const p of productData.data) {
          prodMap.set(p.id, p);
        }
        setProducts(prodMap);
      }
    } catch (err) {
      console.error('Load error:', err);
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

  const handleDelete = async (aliasId: string) => {
    if (!confirm('Delete this alias?')) return;

    setDeleting(aliasId);
    try {
      const res = await adminFetch('/api/admin/crud', {
        method: 'POST',
        body: JSON.stringify({
          table: 'receipt_aliases',
          action: 'delete',
          id: aliasId,
        }),
      });

      if (res.ok) {
        setAliases(aliases.filter(a => a.id !== aliasId));
      } else {
        const data = await res.json();
        alert(data.error || 'Delete failed');
      }
    } catch (err) {
      console.error('Delete error:', err);
      alert('Delete failed');
    } finally {
      setDeleting(null);
    }
  };

  // Filter aliases by store
  const filteredAliases = filterStore === 'all'
    ? aliases
    : aliases.filter(a => a.store_name === filterStore);

  if (loading) {
    return (
      <AdminShell title="Receipt Aliases">
        <div className={styles.inventoryPage}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Receipt Aliases">
      <div className={styles.inventoryPage}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '4px' }}>Receipt Aliases</h1>
            <p style={{ fontSize: '13px', color: '#6b7280' }}>
              Map receipt abbreviations to products for automatic matching
            </p>
          </div>
          <Link href="/admin/inventory" className={styles.actionButton} style={{ padding: '8px 16px', minHeight: 'auto' }}>
            Back
          </Link>
        </div>

        {/* Error display */}
        {error && (
          <div style={{ background: '#fef2f2', color: '#dc2626', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
            {error}
          </div>
        )}

        {/* Info box */}
        <div style={{ background: '#dbeafe', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '13px', color: '#1e40af' }}>
          <strong>How it works:</strong> When scanning receipts, the system first checks for aliases.
          For example, if Walmart prints &quot;BRE&quot; for &quot;Black Rifle Energy&quot;, save an alias
          so future receipts match automatically.
        </div>

        {/* Filter by store */}
        {storeNames.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <select
              value={filterStore}
              onChange={(e) => setFilterStore(e.target.value)}
              className={styles.formSelect}
              style={{ maxWidth: '200px' }}
            >
              <option value="all">All Stores</option>
              {storeNames.map(store => (
                <option key={store} value={store || ''}>{store}</option>
              ))}
            </select>
          </div>
        )}

        {/* Aliases list */}
        <div className={styles.sectionCard}>
          <div className={styles.sectionBody}>
            {filteredAliases.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 17h6M12 12h.01M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9-4.03-9-9-9z" />
                  </svg>
                </div>
                <p>No aliases saved yet.</p>
                <p>Aliases are created automatically when you match receipt lines to products.</p>
              </div>
            ) : (
              <div>
                {filteredAliases.map((alias) => {
                  const product = products.get(alias.product_id);
                  return (
                    <div key={alias.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px',
                      background: '#f9fafb',
                      borderRadius: '10px',
                      marginBottom: '8px',
                      border: '1px solid #e5e7eb',
                    }}>
                      {/* Receipt text */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontFamily: 'monospace', fontSize: '14px', background: '#fff3cd', padding: '4px 8px', borderRadius: '4px', display: 'inline-block' }}>
                          {alias.receipt_text}
                        </div>
                        {alias.store_name && (
                          <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                            Store: {alias.store_name}
                          </div>
                        )}
                      </div>

                      {/* Arrow */}
                      <div style={{ color: '#9ca3af', fontSize: '20px' }}>→</div>

                      {/* Product */}
                      <div style={{ flex: 2, minWidth: 0 }}>
                        {product ? (
                          <>
                            {product.brand && (
                              <div style={{ fontWeight: 700, fontSize: '10px', color: '#FF580F', textTransform: 'uppercase' }}>
                                {product.brand}
                              </div>
                            )}
                            <div style={{ fontWeight: 600, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {product.name}
                            </div>
                          </>
                        ) : (
                          <div style={{ color: '#dc2626', fontSize: '12px' }}>
                            Product not found (deleted?)
                          </div>
                        )}
                      </div>

                      {/* Delete button */}
                      <button
                        onClick={() => handleDelete(alias.id)}
                        disabled={deleting === alias.id}
                        style={{
                          color: '#dc2626',
                          background: 'none',
                          border: 'none',
                          padding: '8px',
                          cursor: deleting === alias.id ? 'wait' : 'pointer',
                          opacity: deleting === alias.id ? 0.5 : 1,
                        }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Stats */}
        <div style={{ marginTop: '16px', padding: '12px', background: '#f3f4f6', borderRadius: '8px', fontSize: '13px', color: '#6b7280' }}>
          Total aliases: {aliases.length} • Showing: {filteredAliases.length}
        </div>
      </div>
    </AdminShell>
  );
}
