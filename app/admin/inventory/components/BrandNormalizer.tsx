'use client';

import { useState, useEffect } from 'react';
import styles from '../inventory.module.css';

interface Product {
  id: string;
  barcode: string;
  name: string;
  brand: string | null;
}

interface BrandGroup {
  brands: string[];
  products: Product[];
}

interface BrandNormalizerProps {
  onClose: () => void;
  onComplete: () => void;
}

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('adminToken') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// Find similar brand groups using fuzzy matching
function findSimilarBrandGroups(products: Product[]): BrandGroup[] {
  const brandProducts: Record<string, Product[]> = {};

  // Group products by brand
  products.forEach(p => {
    if (p.brand) {
      if (!brandProducts[p.brand]) brandProducts[p.brand] = [];
      brandProducts[p.brand].push(p);
    }
  });

  const brands = Object.keys(brandProducts);
  const used = new Set<string>();
  const groups: BrandGroup[] = [];

  for (let i = 0; i < brands.length; i++) {
    const brand = brands[i];
    if (used.has(brand)) continue;

    const brandLower = brand.toLowerCase();
    const brandWords = brandLower.split(/\s+/);
    const group: BrandGroup = {
      brands: [brand],
      products: [...brandProducts[brand]],
    };

    // Find similar brands
    for (let j = i + 1; j < brands.length; j++) {
      const otherBrand = brands[j];
      if (used.has(otherBrand)) continue;

      const otherLower = otherBrand.toLowerCase();
      const otherWords = otherLower.split(/\s+/);

      // Check if one contains the other
      const containsMatch = brandLower.includes(otherLower) || otherLower.includes(brandLower);

      // Check if first word matches
      const firstWordMatch = brandWords[0] === otherWords[0] && brandWords[0].length > 2;

      if (containsMatch || firstWordMatch) {
        group.brands.push(otherBrand);
        group.products.push(...brandProducts[otherBrand]);
        used.add(otherBrand);
      }
    }

    used.add(brand);

    // Only include groups with multiple brands (these need normalization)
    if (group.brands.length > 1) {
      groups.push(group);
    }
  }

  return groups;
}

export function BrandNormalizer({ onClose, onComplete }: BrandNormalizerProps) {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<BrandGroup[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function loadProducts() {
      try {
        const res = await fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'products', action: 'read' }),
        });
        const data = await res.json();
        const products: Product[] = data.data || [];

        const similarGroups = findSimilarBrandGroups(products);
        setGroups(similarGroups);

        // Pre-select the longest (most complete) brand for each group
        const preselected: Record<number, string> = {};
        similarGroups.forEach((group, index) => {
          const longestBrand = group.brands.sort((a, b) => b.length - a.length)[0];
          preselected[index] = longestBrand;
        });
        setSelectedBrands(preselected);
      } catch (err) {
        console.error('Error loading products:', err);
      } finally {
        setLoading(false);
      }
    }
    loadProducts();
  }, []);

  async function handleNormalize() {
    setSaving(true);
    try {
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        const canonicalBrand = selectedBrands[i];
        if (!canonicalBrand) continue;

        // Update all products in the group to use the canonical brand
        for (const product of group.products) {
          if (product.brand !== canonicalBrand) {
            await fetch('/api/admin/crud', {
              method: 'POST',
              headers: getAuthHeaders(),
              body: JSON.stringify({
                table: 'products',
                action: 'update',
                id: product.id,
                data: { brand: canonicalBrand },
              }),
            });
          }
        }
      }

      alert('Brands normalized successfully!');
      onComplete();
    } catch (err) {
      console.error('Error normalizing brands:', err);
      alert('Error normalizing brands');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.modalOverlay}>
        <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.modalHeader}>
            <h2 className={styles.modalTitle}>Normalize Brands</h2>
            <button className={styles.modalClose} onClick={onClose}>×</button>
          </div>
          <div className={styles.modalBody}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
              <div className={styles.spinner} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} style={{ maxWidth: '600px' }} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Normalize Brands</h2>
          <button className={styles.modalClose} onClick={onClose}>×</button>
        </div>
        <div className={styles.modalBody}>
          {groups.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
              <div style={{ width: '48px', height: '48px', margin: '0 auto 16px', color: '#16a34a' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <p style={{ fontSize: '16px', fontWeight: 500 }}>All brands are normalized!</p>
              <p style={{ fontSize: '14px', marginTop: '8px' }}>No similar brand names were found that need merging.</p>
            </div>
          ) : (
            <>
              <p style={{ marginBottom: '20px', color: '#6b7280', fontSize: '14px' }}>
                Found {groups.length} group{groups.length !== 1 ? 's' : ''} of similar brand names.
                Select the canonical name for each group:
              </p>

              {groups.map((group, index) => (
                <div key={index} style={{
                  padding: '16px',
                  background: '#f9fafb',
                  borderRadius: '12px',
                  marginBottom: '16px',
                }}>
                  <div style={{ marginBottom: '12px' }}>
                    <span style={{ fontSize: '13px', color: '#6b7280' }}>
                      {group.products.length} product{group.products.length !== 1 ? 's' : ''} affected
                    </span>
                  </div>

                  {/* Brand options */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {group.brands.map(brand => {
                      const count = group.products.filter(p => p.brand === brand).length;
                      const isSelected = selectedBrands[index] === brand;

                      return (
                        <label
                          key={brand}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '12px',
                            padding: '12px',
                            background: isSelected ? '#fff7ed' : '#fff',
                            border: isSelected ? '2px solid #FF580F' : '1px solid #e5e7eb',
                            borderRadius: '8px',
                            cursor: 'pointer',
                          }}
                        >
                          <input
                            type="radio"
                            name={`brand-group-${index}`}
                            checked={isSelected}
                            onChange={() => setSelectedBrands({ ...selectedBrands, [index]: brand })}
                            style={{ accentColor: '#FF580F' }}
                          />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, color: '#111827' }}>{brand}</div>
                            <div style={{ fontSize: '12px', color: '#9ca3af' }}>
                              {count} product{count !== 1 ? 's' : ''} with this name
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  {/* Products preview */}
                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '8px' }}>
                      Products in this group:
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {group.products.slice(0, 6).map(p => (
                        <span
                          key={p.id}
                          style={{
                            padding: '4px 8px',
                            background: '#e5e7eb',
                            borderRadius: '4px',
                            fontSize: '11px',
                            color: '#374151',
                          }}
                        >
                          {p.name}
                        </span>
                      ))}
                      {group.products.length > 6 && (
                        <span style={{
                          padding: '4px 8px',
                          background: '#e5e7eb',
                          borderRadius: '4px',
                          fontSize: '11px',
                          color: '#6b7280',
                        }}>
                          +{group.products.length - 6} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btnSecondary} onClick={onClose}>
            Cancel
          </button>
          {groups.length > 0 && (
            <button
              className={styles.btnPrimary}
              onClick={handleNormalize}
              disabled={saving}
            >
              {saving ? 'Normalizing...' : `Normalize ${groups.length} Group${groups.length !== 1 ? 's' : ''}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
