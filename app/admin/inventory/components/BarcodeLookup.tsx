'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from '../inventory.module.css';

interface Product {
  id: string;
  barcode: string;
  name: string;
  category: 'snack' | 'beverage' | 'meal';
  default_price: number | null;
  image_url: string | null;
  is_active: boolean;
}

interface LookupResult {
  found: boolean;
  source: 'database' | 'openfoodfacts' | 'manual';
  product: {
    barcode: string;
    name: string;
    category: 'snack' | 'beverage' | 'meal';
    image_url: string | null;
    default_price: number | null;
  };
  existingProduct?: Product;
}

interface BarcodeLookupProps {
  barcode: string;
  onResult: (result: LookupResult) => void;
  onSaveNew?: (product: LookupResult['product']) => Promise<void>;
}

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('adminToken') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export function BarcodeLookup({ barcode, onResult, onSaveNew }: BarcodeLookupProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    category: 'snack' as 'snack' | 'beverage' | 'meal',
    image_url: '',
    default_price: '',
  });
  const [saving, setSaving] = useState(false);

  const lookupBarcode = useCallback(async () => {
    setLoading(true);
    setResult(null);

    try {
      // Step 1: Check database first
      const dbRes = await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'products',
          action: 'read',
          filters: { barcode },
        }),
      });
      const dbData = await dbRes.json();

      if (dbData.data && dbData.data.length > 0) {
        // Found in database
        const existingProduct = dbData.data[0] as Product;
        const lookupResult: LookupResult = {
          found: true,
          source: 'database',
          product: {
            barcode: existingProduct.barcode,
            name: existingProduct.name,
            category: existingProduct.category,
            image_url: existingProduct.image_url,
            default_price: existingProduct.default_price,
          },
          existingProduct,
        };
        setResult(lookupResult);
        onResult(lookupResult);
        setLoading(false);
        return;
      }

      // Step 2: Not in database, try Open Food Facts
      try {
        const offRes = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
        const offData = await offRes.json();

        if (offData.status === 1 && offData.product) {
          const p = offData.product;

          // Try to determine category from Open Food Facts categories
          let category: 'snack' | 'beverage' | 'meal' = 'snack';
          const categories = (p.categories_tags || []).join(' ').toLowerCase();
          const productName = (p.product_name || '').toLowerCase();

          if (
            categories.includes('beverage') ||
            categories.includes('drink') ||
            categories.includes('water') ||
            categories.includes('soda') ||
            categories.includes('juice') ||
            productName.includes('water') ||
            productName.includes('soda') ||
            productName.includes('juice') ||
            productName.includes('tea') ||
            productName.includes('coffee')
          ) {
            category = 'beverage';
          } else if (
            categories.includes('meal') ||
            categories.includes('prepared') ||
            categories.includes('frozen-meal') ||
            categories.includes('sandwich')
          ) {
            category = 'meal';
          }

          const lookupResult: LookupResult = {
            found: false,
            source: 'openfoodfacts',
            product: {
              barcode,
              name: p.product_name || p.product_name_en || 'Unknown Product',
              category,
              image_url: p.image_front_small_url || p.image_url || null,
              default_price: null,
            },
          };

          setResult(lookupResult);
          setFormData({
            name: lookupResult.product.name,
            category: lookupResult.product.category,
            image_url: lookupResult.product.image_url || '',
            default_price: '',
          });
          onResult(lookupResult);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error('Open Food Facts lookup failed:', err);
      }

      // Step 3: Not found anywhere - manual entry needed
      const lookupResult: LookupResult = {
        found: false,
        source: 'manual',
        product: {
          barcode,
          name: '',
          category: 'snack',
          image_url: null,
          default_price: null,
        },
      };
      setResult(lookupResult);
      setFormData({
        name: '',
        category: 'snack',
        image_url: '',
        default_price: '',
      });
      setEditMode(true);
      onResult(lookupResult);
    } catch (err) {
      console.error('Lookup error:', err);
    } finally {
      setLoading(false);
    }
  }, [barcode, onResult]);

  useEffect(() => {
    if (barcode) {
      lookupBarcode();
    }
  }, [barcode, lookupBarcode]);

  async function handleSave() {
    if (!formData.name.trim()) {
      alert('Product name is required');
      return;
    }

    setSaving(true);
    try {
      const productData = {
        barcode,
        name: formData.name.trim(),
        category: formData.category,
        image_url: formData.image_url.trim() || null,
        default_price: formData.default_price ? parseFloat(formData.default_price) : null,
      };

      if (onSaveNew) {
        await onSaveNew(productData);
      } else {
        // Save directly
        await fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            table: 'products',
            action: 'create',
            data: productData,
          }),
        });
      }

      setEditMode(false);
      // Re-lookup to get the saved product
      await lookupBarcode();
    } catch (err) {
      console.error('Error saving product:', err);
      alert('Error saving product');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className={styles.lookupResult}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div className={styles.spinner} />
          <span>Looking up barcode...</span>
        </div>
      </div>
    );
  }

  if (!result) {
    return null;
  }

  // Product found in database
  if (result.found && result.existingProduct) {
    return (
      <div className={styles.lookupResult}>
        <div className={styles.lookupProduct}>
          <div className={styles.lookupImage}>
            {result.product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result.product.image_url} alt={result.product.name} />
            ) : (
              <span style={{ fontSize: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>📦</span>
            )}
          </div>
          <div className={styles.lookupInfo}>
            <div className={styles.lookupName}>{result.product.name}</div>
            <div className={styles.lookupBarcode}>{result.product.barcode}</div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <span className={`${styles.categoryBadge} ${styles[result.product.category]}`}>
                {result.product.category}
              </span>
              {result.product.default_price && (
                <span style={{ fontWeight: 600 }}>${result.product.default_price.toFixed(2)}</span>
              )}
            </div>
            <div className={styles.lookupSource}>Found in catalog</div>
          </div>
        </div>
      </div>
    );
  }

  // Product needs to be added
  return (
    <div className={styles.lookupResult}>
      <div className={styles.newProductBadge}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        New Product
      </div>

      {!editMode && result.source === 'openfoodfacts' && (
        <div className={styles.lookupProduct}>
          <div className={styles.lookupImage}>
            {result.product.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={result.product.image_url} alt={result.product.name} />
            ) : (
              <span style={{ fontSize: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>📦</span>
            )}
          </div>
          <div className={styles.lookupInfo}>
            <div className={styles.lookupName}>{result.product.name}</div>
            <div className={styles.lookupBarcode}>{result.product.barcode}</div>
            <span className={`${styles.categoryBadge} ${styles[result.product.category]}`}>
              {result.product.category}
            </span>
            <div className={styles.lookupSource}>Found on Open Food Facts</div>
          </div>
        </div>
      )}

      {(editMode || result.source === 'manual') && (
        <div>
          {result.source === 'manual' && (
            <p style={{ marginBottom: '16px', color: '#6b7280' }}>
              Product not found. Please enter details:
            </p>
          )}
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Name *</label>
            <input
              type="text"
              className={styles.formInput}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Product name"
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Category</label>
            <select
              className={styles.formSelect}
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value as 'snack' | 'beverage' | 'meal' })}
            >
              <option value="snack">Snack</option>
              <option value="beverage">Beverage</option>
              <option value="meal">Meal</option>
            </select>
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Price</label>
            <input
              type="number"
              step="0.01"
              className={styles.formInput}
              value={formData.default_price}
              onChange={(e) => setFormData({ ...formData, default_price: e.target.value })}
              placeholder="0.00"
            />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
        {!editMode && result.source === 'openfoodfacts' && (
          <>
            <button className={styles.btnSecondary} onClick={() => setEditMode(true)} style={{ flex: 1 }}>
              Edit
            </button>
            <button className={styles.btnPrimary} onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
              {saving ? 'Saving...' : 'Save to Catalog'}
            </button>
          </>
        )}
        {(editMode || result.source === 'manual') && (
          <button className={styles.btnPrimary} onClick={handleSave} disabled={saving} style={{ flex: 1 }}>
            {saving ? 'Saving...' : 'Save to Catalog'}
          </button>
        )}
      </div>
    </div>
  );
}
