'use client';

import { useState, useEffect, useCallback } from 'react';
import { adminFetch, AuthError } from '@/lib/admin-fetch';
import styles from '../inventory.module.css';

interface Product {
  id: string;
  barcode: string;
  name: string;
  brand: string | null;
  category: 'snack' | 'beverage' | 'meal';
  default_price: number | null;
  image_url: string | null;
}

interface BrandInfo {
  name: string;
  count: number;
}

interface LookupResult {
  found: boolean;
  source: 'database' | 'openfoodfacts' | 'manual';
  product: {
    barcode: string;
    name: string;
    brand: string | null;
    category: 'snack' | 'beverage' | 'meal';
    image_url: string | null;
    default_price: number | null;
  };
  existingProduct?: Product;
}

interface BarcodeLookupProps {
  barcode: string;
  onResult: (result: LookupResult) => void;
}

// Find similar brand in existing brands
function findSimilarBrand(incoming: string, existingBrands: BrandInfo[]): BrandInfo | null {
  if (!incoming) return null;
  const incomingLower = incoming.toLowerCase().trim();

  for (const brand of existingBrands) {
    const existingLower = brand.name.toLowerCase();

    // Exact match
    if (existingLower === incomingLower) {
      return brand;
    }

    // One contains the other
    if (existingLower.includes(incomingLower) || incomingLower.includes(existingLower)) {
      return brand;
    }

    // First word matches
    const incomingFirst = incomingLower.split(/\s+/)[0];
    const existingFirst = existingLower.split(/\s+/)[0];
    if (incomingFirst.length > 3 && incomingFirst === existingFirst) {
      return brand;
    }
  }

  return null;
}

export function BarcodeLookup({ barcode, onResult }: BarcodeLookupProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [existingBrands, setExistingBrands] = useState<BrandInfo[]>([]);
  const [similarBrand, setSimilarBrand] = useState<BrandInfo | null>(null);
  const [useExistingBrand, setUseExistingBrand] = useState(true);

  const [formData, setFormData] = useState({
    brand: '',
    name: '',
    category: 'snack' as 'snack' | 'beverage' | 'meal',
    image_url: '',
    default_price: '',
  });

  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [brandFilter, setBrandFilter] = useState('');
  const [saving, setSaving] = useState(false);

  const lookupBarcode = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setSimilarBrand(null);
    setError(null);

    try {
      // Step 1: Fetch existing products to get brands AND check for barcode
      const res = await adminFetch('/api/admin/crud', {
        method: 'POST',
        body: JSON.stringify({ table: 'products', action: 'read' }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to load products');
      }

      const data = await res.json();
      const products: Product[] = data.data || [];

      // Build brand list with counts
      const brandCounts: Record<string, number> = {};
      products.forEach(p => {
        if (p.brand) {
          brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1;
        }
      });
      const brands: BrandInfo[] = Object.entries(brandCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      setExistingBrands(brands);

      // Check if barcode exists
      const existingProduct = products.find(p => p.barcode === barcode);
      if (existingProduct) {
        const lookupResult: LookupResult = {
          found: true,
          source: 'database',
          product: {
            barcode: existingProduct.barcode,
            name: existingProduct.name,
            brand: existingProduct.brand,
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

      // Step 2: Try Open Food Facts
      try {
        const offRes = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
        const offData = await offRes.json();

        if (offData.status === 1 && offData.product) {
          const p = offData.product;

          // Get brand - take first if comma-separated
          let apiBrand = (p.brands || '').split(',')[0].trim();

          // Get product name
          let productName = p.product_name || p.product_name_en || '';

          // If brand is in the product name, remove it
          if (apiBrand && productName.toLowerCase().startsWith(apiBrand.toLowerCase())) {
            productName = productName.slice(apiBrand.length).replace(/^[\s\-']+/, '').trim();
          }

          // Check for similar existing brand
          const similar = findSimilarBrand(apiBrand, brands);
          setSimilarBrand(similar);

          // Determine category
          let category: 'snack' | 'beverage' | 'meal' = 'snack';
          const cats = (p.categories_tags || []).join(' ').toLowerCase();
          const fullName = productName.toLowerCase();
          if (cats.includes('beverage') || cats.includes('drink') || fullName.includes('water') || fullName.includes('soda') || fullName.includes('energy')) {
            category = 'beverage';
          } else if (cats.includes('meal') || cats.includes('sandwich')) {
            category = 'meal';
          }

          const lookupResult: LookupResult = {
            found: false,
            source: 'openfoodfacts',
            product: {
              barcode,
              name: productName || 'Unknown Product',
              brand: similar && useExistingBrand ? similar.name : apiBrand,
              category,
              image_url: p.image_front_small_url || p.image_url || null,
              default_price: null,
            },
          };

          setResult(lookupResult);
          setFormData({
            brand: similar && useExistingBrand ? similar.name : apiBrand,
            name: productName || 'Unknown Product',
            category,
            image_url: lookupResult.product.image_url || '',
            default_price: '',
          });
          setBrandFilter(similar && useExistingBrand ? similar.name : apiBrand);
          setLoading(false);
          return;
        }
      } catch (err) {
        console.error('Open Food Facts error:', err);
      }

      // Step 3: Manual entry needed
      const lookupResult: LookupResult = {
        found: false,
        source: 'manual',
        product: {
          barcode,
          name: '',
          brand: null,
          category: 'snack',
          image_url: null,
          default_price: null,
        },
      };
      setResult(lookupResult);
      setFormData({ brand: '', name: '', category: 'snack', image_url: '', default_price: '' });
      setBrandFilter('');
    } catch (err) {
      console.error('Lookup error:', err);
      // Don't show error for auth errors - they redirect to login
      if (!(err instanceof AuthError)) {
        setError(err instanceof Error ? err.message : 'Lookup failed');
      }
    } finally {
      setLoading(false);
    }
  }, [barcode, onResult, useExistingBrand]);

  useEffect(() => {
    if (barcode) {
      lookupBarcode();
    }
  }, [barcode, lookupBarcode]);

  // When user toggles brand choice, update form
  useEffect(() => {
    if (similarBrand && result) {
      const newBrand = useExistingBrand ? similarBrand.name : (result.product.brand || '');
      setFormData(f => ({ ...f, brand: newBrand }));
      setBrandFilter(newBrand);
    }
  }, [useExistingBrand, similarBrand, result]);

  const filteredBrands = existingBrands.filter(b =>
    b.name.toLowerCase().includes(brandFilter.toLowerCase())
  );

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('Product name is required');
      return;
    }

    setSaving(true);
    try {
      const productData = {
        barcode,
        name: formData.name.trim(),
        brand: formData.brand.trim() || null,
        category: formData.category,
        image_url: formData.image_url.trim() || null,
        default_price: formData.default_price ? parseFloat(formData.default_price) : null,
      };

      const saveRes = await adminFetch('/api/admin/crud', {
        method: 'POST',
        body: JSON.stringify({ table: 'products', action: 'create', data: productData }),
      });

      const saveData = await saveRes.json();

      if (!saveRes.ok) {
        throw new Error(saveData.error || 'Failed to save product');
      }

      if (saveData.data) {
        const finalResult: LookupResult = {
          found: true,
          source: 'database',
          product: productData,
          existingProduct: saveData.data,
        };
        onResult(finalResult);
      } else {
        throw new Error('No product data returned');
      }
    } catch (err) {
      console.error('Save error:', err);
      // Don't show error for auth errors - they redirect to login
      if (!(err instanceof AuthError)) {
        alert('Error saving product: ' + (err instanceof Error ? err.message : 'Unknown error'));
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div className={styles.spinner} style={{ margin: '0 auto 12px' }} />
        <div>Looking up barcode...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#dc2626' }}>
        <div>Error: {error}</div>
      </div>
    );
  }

  if (!result) return null;

  // Product exists in database - just show confirmation
  if (result.found && result.existingProduct) {
    return (
      <div style={{ padding: '16px', background: '#f0fdf4', borderRadius: '12px', border: '2px solid #22c55e' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px', color: '#16a34a' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M20 6L9 17l-5-5" />
          </svg>
          <span style={{ fontWeight: 600 }}>Found in catalog</span>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {result.product.image_url && (
            <img src={result.product.image_url} alt="" style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '8px' }} />
          )}
          <div>
            {result.product.brand && (
              <div style={{ fontWeight: 700, fontSize: '12px', color: '#FF580F', textTransform: 'uppercase' }}>{result.product.brand}</div>
            )}
            <div style={{ fontWeight: 600, fontSize: '16px' }}>{result.product.name}</div>
            <div style={{ fontSize: '13px', color: '#6b7280' }}>{result.product.barcode}</div>
          </div>
        </div>
      </div>
    );
  }

  // New product - show form with brand normalization
  return (
    <div style={{ padding: '16px', background: '#fefce8', borderRadius: '12px', border: '2px solid #facc15' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', color: '#a16207' }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <span style={{ fontWeight: 600 }}>New Product - Review Details</span>
      </div>

      {/* PROMINENT BRAND MATCH WARNING */}
      {similarBrand && (
        <div style={{
          marginBottom: '16px',
          padding: '14px',
          background: '#fef3c7',
          borderRadius: '10px',
          border: '2px solid #f59e0b',
        }}>
          <div style={{ fontWeight: 700, color: '#92400e', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Similar brand exists!
          </div>
          <div style={{ fontSize: '14px', color: '#78350f', marginBottom: '12px' }}>
            &quot;{result.product.brand}&quot; looks like &quot;<strong>{similarBrand.name}</strong>&quot; ({similarBrand.count} products)
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={() => setUseExistingBrand(true)}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                border: useExistingBrand ? '2px solid #22c55e' : '2px solid #d1d5db',
                background: useExistingBrand ? '#dcfce7' : '#fff',
                color: useExistingBrand ? '#16a34a' : '#374151',
              }}
            >
              Use &quot;{similarBrand.name}&quot;
            </button>
            <button
              onClick={() => setUseExistingBrand(false)}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                fontWeight: 600,
                cursor: 'pointer',
                border: !useExistingBrand ? '2px solid #3b82f6' : '2px solid #d1d5db',
                background: !useExistingBrand ? '#dbeafe' : '#fff',
                color: !useExistingBrand ? '#1d4ed8' : '#374151',
              }}
            >
              Keep &quot;{result.product.brand}&quot;
            </button>
          </div>
        </div>
      )}

      {/* Product image */}
      {formData.image_url && (
        <div style={{ marginBottom: '16px', textAlign: 'center' }}>
          <img src={formData.image_url} alt="" style={{ maxWidth: '120px', maxHeight: '120px', objectFit: 'contain', borderRadius: '8px' }} />
        </div>
      )}

      {/* Brand field with dropdown */}
      <div style={{ marginBottom: '14px', position: 'relative' }}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: '#374151' }}>Brand</label>
        <input
          type="text"
          value={brandFilter}
          onChange={(e) => {
            setBrandFilter(e.target.value);
            setFormData(f => ({ ...f, brand: e.target.value }));
            setShowBrandDropdown(true);
          }}
          onFocus={() => setShowBrandDropdown(true)}
          onBlur={() => setTimeout(() => setShowBrandDropdown(false), 200)}
          placeholder="Type to search or add new..."
          className={styles.formInput}
        />
        {showBrandDropdown && filteredBrands.length > 0 && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            background: '#fff',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            maxHeight: '180px',
            overflow: 'auto',
            zIndex: 10,
          }}>
            {filteredBrands.slice(0, 10).map(b => (
              <div
                key={b.name}
                onClick={() => {
                  setFormData(f => ({ ...f, brand: b.name }));
                  setBrandFilter(b.name);
                  setShowBrandDropdown(false);
                }}
                style={{
                  padding: '10px 14px',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid #f3f4f6',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
              >
                <span style={{ fontWeight: 500 }}>{b.name}</span>
                <span style={{ fontSize: '12px', color: '#9ca3af' }}>{b.count} items</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Product name */}
      <div style={{ marginBottom: '14px' }}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: '#374151' }}>Product Name *</label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => setFormData(f => ({ ...f, name: e.target.value }))}
          placeholder="Product name"
          className={styles.formInput}
        />
      </div>

      {/* Category buttons */}
      <div style={{ marginBottom: '14px' }}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: '#374151' }}>Category</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(['snack', 'beverage', 'meal'] as const).map(cat => (
            <button
              key={cat}
              onClick={() => setFormData(f => ({ ...f, category: cat }))}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '8px',
                fontWeight: 600,
                textTransform: 'capitalize',
                cursor: 'pointer',
                border: formData.category === cat ? '2px solid #FF580F' : '2px solid #d1d5db',
                background: formData.category === cat ? '#fff7ed' : '#fff',
                color: formData.category === cat ? '#FF580F' : '#374151',
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Price */}
      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: '13px', marginBottom: '6px', color: '#374151' }}>Default Price (optional)</label>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#6b7280' }}>$</span>
          <input
            type="number"
            step="0.01"
            value={formData.default_price}
            onChange={(e) => setFormData(f => ({ ...f, default_price: e.target.value }))}
            placeholder="0.00"
            className={styles.formInput}
            style={{ paddingLeft: '28px' }}
          />
        </div>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving || !formData.name.trim()}
        style={{
          width: '100%',
          padding: '14px',
          background: saving || !formData.name.trim() ? '#d1d5db' : '#FF580F',
          color: '#fff',
          border: 'none',
          borderRadius: '10px',
          fontWeight: 700,
          fontSize: '16px',
          cursor: saving || !formData.name.trim() ? 'not-allowed' : 'pointer',
        }}
      >
        {saving ? 'Saving...' : 'Add to Catalog'}
      </button>
    </div>
  );
}
