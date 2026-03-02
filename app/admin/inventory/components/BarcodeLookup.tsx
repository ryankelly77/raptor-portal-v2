'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import styles from '../inventory.module.css';

interface Product {
  id: string;
  barcode: string;
  name: string;
  brand: string | null;
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
    brand: string | null;
    category: 'snack' | 'beverage' | 'meal';
    image_url: string | null;
    default_price: number | null;
  };
  existingProduct?: Product;
}

interface BrandWithCount {
  brand: string;
  count: number;
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

// Common brands to detect and extract from product names
const KNOWN_BRANDS = [
  'Black Rifle', 'Black Rifle Coffee Company',
  'Monster', 'Red Bull', 'Celsius', 'Prime', 'Gatorade', 'Powerade',
  'Coca-Cola', 'Pepsi', 'Dr Pepper', 'Mountain Dew', 'Sprite', 'Fanta',
  'Cheetos', 'Doritos', 'Lays', 'Pringles', 'Oreo', 'Snickers', 'M&M',
  'Reese', 'Kit Kat', 'Twix', 'Skittles', 'Starburst', 'Takis',
  'Hot Cheetos', 'Smartfood', 'SunChips', 'Ruffles', 'Tostitos', 'Fritos',
  'Funyuns', 'Hostess', 'Little Debbie', 'Kellogg', 'General Mills',
  'Quaker', 'Nature Valley', 'KIND', 'RXBAR', 'Clif', 'Quest',
  'Premier Protein', 'Muscle Milk', 'Fairlife', 'Core Power', 'Reign',
  'Bang', 'Ghost', 'C4', 'Alani Nu', '3D Energy', 'ZOA', 'Rockstar',
  'NOS', 'Full Throttle', 'Amp', 'Starbucks', 'Dunkin',
  'International Delight', 'Coffee Mate', 'Nestle', 'Hershey',
  "Jack Link's", 'Slim Jim', 'Duke', 'Oberto', 'Tillamook',
  'Old Wisconsin', 'Combos', 'Goldfish', 'Cheez-It', 'Wheat Thins',
  'Triscuit', 'Ritz', 'Nabisco', 'Keebler', 'Famous Amos', 'Chips Ahoy',
  'Nutter Butter', 'Belvita', 'Pop-Tarts', 'Nutri-Grain', 'Special K',
  'Fiber One',
];

// Extract brand from product name if it starts with a known brand
function extractBrandFromName(fullName: string): { brand: string | null; name: string } {
  const nameLower = fullName.toLowerCase();

  for (const brand of KNOWN_BRANDS) {
    const brandLower = brand.toLowerCase();
    if (nameLower.startsWith(brandLower + ' ') || nameLower.startsWith(brandLower + "'")) {
      return {
        brand,
        name: fullName.slice(brand.length).trim().replace(/^['-]\s*/, '').trim(),
      };
    }
  }

  return { brand: null, name: fullName };
}

// Fuzzy match brands
function findBrandMatch(incomingBrand: string, existingBrands: BrandWithCount[]): {
  match: string | null;
  matchType: 'exact' | 'contains' | 'similar' | 'none';
  suggestions: string[];
} {
  if (!incomingBrand) return { match: null, matchType: 'none', suggestions: [] };

  const incomingLower = incomingBrand.toLowerCase().trim();
  const incomingWords = incomingLower.split(/\s+/);

  // Exact match
  const exactMatch = existingBrands.find(b => b.brand.toLowerCase() === incomingLower);
  if (exactMatch) {
    return { match: exactMatch.brand, matchType: 'exact', suggestions: [] };
  }

  // Contains match - prefer the longer/more complete brand
  const containsMatches = existingBrands.filter(b => {
    const existingLower = b.brand.toLowerCase();
    return existingLower.includes(incomingLower) || incomingLower.includes(existingLower);
  });

  if (containsMatches.length > 0) {
    // Sort by length descending (prefer longer, more complete names)
    const sortedMatches = containsMatches.sort((a, b) => b.brand.length - a.brand.length);
    return {
      match: sortedMatches[0].brand,
      matchType: 'contains',
      suggestions: sortedMatches.map(m => m.brand),
    };
  }

  // Similar start (first word matches)
  const firstWord = incomingWords[0];
  const similarMatches = existingBrands.filter(b => {
    const existingWords = b.brand.toLowerCase().split(/\s+/);
    return existingWords[0] === firstWord;
  });

  if (similarMatches.length > 0) {
    return {
      match: null,
      matchType: 'similar',
      suggestions: similarMatches.map(m => m.brand),
    };
  }

  return { match: null, matchType: 'none', suggestions: [] };
}

export function BarcodeLookup({ barcode, onResult, onSaveNew }: BarcodeLookupProps) {
  const [loading, setLoading] = useState(true);
  const [result, setResult] = useState<LookupResult | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [existingBrands, setExistingBrands] = useState<BrandWithCount[]>([]);
  const [brandMatch, setBrandMatch] = useState<{
    matchType: 'exact' | 'contains' | 'similar' | 'none';
    suggestions: string[];
  } | null>(null);
  const [showBrandDropdown, setShowBrandDropdown] = useState(false);
  const [brandSearch, setBrandSearch] = useState('');
  const brandInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    brand: '',
    name: '',
    category: 'snack' as 'snack' | 'beverage' | 'meal',
    image_url: '',
    default_price: '',
  });
  const [saving, setSaving] = useState(false);

  // Fetch existing brands on mount
  useEffect(() => {
    async function fetchBrands() {
      try {
        const res = await fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'products', action: 'read' }),
        });
        const data = await res.json();
        const products: Product[] = data.data || [];

        // Count products per brand
        const brandCounts: Record<string, number> = {};
        products.forEach(p => {
          if (p.brand) {
            brandCounts[p.brand] = (brandCounts[p.brand] || 0) + 1;
          }
        });

        // Convert to array and sort by count descending
        const brandsWithCount: BrandWithCount[] = Object.entries(brandCounts)
          .map(([brand, count]) => ({ brand, count }))
          .sort((a, b) => b.count - a.count);

        setExistingBrands(brandsWithCount);
      } catch (err) {
        console.error('Error fetching brands:', err);
      }
    }
    fetchBrands();
  }, []);

  const lookupBarcode = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setBrandMatch(null);

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

      // Step 2: Not in database, try Open Food Facts
      try {
        const offRes = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`);
        const offData = await offRes.json();

        if (offData.status === 1 && offData.product) {
          const p = offData.product;

          // Extract brand from API response
          let apiBrand = p.brands || '';
          // Clean up brand - take first brand if comma-separated
          if (apiBrand.includes(',')) {
            apiBrand = apiBrand.split(',')[0].trim();
          }

          // Get product name
          let productName = p.product_name || p.product_name_en || 'Unknown Product';

          // If no brand from API, try to extract from name
          if (!apiBrand && productName) {
            const extracted = extractBrandFromName(productName);
            apiBrand = extracted.brand || '';
            productName = extracted.name;
          } else if (apiBrand && productName) {
            // If brand exists, check if it's duplicated in the name and remove it
            const brandLower = apiBrand.toLowerCase();
            const nameLower = productName.toLowerCase();
            if (nameLower.startsWith(brandLower + ' ') || nameLower.startsWith(brandLower + "'")) {
              productName = productName.slice(apiBrand.length).trim().replace(/^['-]\s*/, '').trim();
            }
          }

          // Try to normalize brand against existing brands
          let normalizedBrand = apiBrand;
          if (apiBrand && existingBrands.length > 0) {
            const match = findBrandMatch(apiBrand, existingBrands);
            setBrandMatch({ matchType: match.matchType, suggestions: match.suggestions });

            if (match.match && (match.matchType === 'exact' || match.matchType === 'contains')) {
              normalizedBrand = match.match;
            }
          }

          // Try to determine category from Open Food Facts categories
          let category: 'snack' | 'beverage' | 'meal' = 'snack';
          const categories = (p.categories_tags || []).join(' ').toLowerCase();
          const fullName = (productName || '').toLowerCase();

          if (
            categories.includes('beverage') ||
            categories.includes('drink') ||
            categories.includes('water') ||
            categories.includes('soda') ||
            categories.includes('juice') ||
            categories.includes('energy') ||
            fullName.includes('water') ||
            fullName.includes('soda') ||
            fullName.includes('juice') ||
            fullName.includes('tea') ||
            fullName.includes('coffee') ||
            fullName.includes('energy')
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
              name: productName,
              brand: normalizedBrand || null,
              category,
              image_url: p.image_front_small_url || p.image_url || null,
              default_price: null,
            },
          };

          setResult(lookupResult);
          setFormData({
            brand: lookupResult.product.brand || '',
            name: lookupResult.product.name,
            category: lookupResult.product.category,
            image_url: lookupResult.product.image_url || '',
            default_price: '',
          });
          setBrandSearch(lookupResult.product.brand || '');
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
          brand: null,
          category: 'snack',
          image_url: null,
          default_price: null,
        },
      };
      setResult(lookupResult);
      setFormData({
        brand: '',
        name: '',
        category: 'snack',
        image_url: '',
        default_price: '',
      });
      setBrandSearch('');
      setEditMode(true);
      onResult(lookupResult);
    } catch (err) {
      console.error('Lookup error:', err);
    } finally {
      setLoading(false);
    }
  }, [barcode, onResult, existingBrands]);

  useEffect(() => {
    if (barcode && existingBrands !== null) {
      lookupBarcode();
    }
  }, [barcode, lookupBarcode, existingBrands]);

  // Filter brands for dropdown
  const filteredBrands = existingBrands.filter(b =>
    b.brand.toLowerCase().includes(brandSearch.toLowerCase())
  );

  function handleBrandSelect(brand: string) {
    setFormData({ ...formData, brand });
    setBrandSearch(brand);
    setShowBrandDropdown(false);
  }

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
        brand: formData.brand.trim() || null,
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
            {result.product.brand && (
              <div className={styles.lookupBrand}>{result.product.brand}</div>
            )}
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
        <>
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
              {formData.brand && (
                <div className={styles.lookupBrand}>{formData.brand}</div>
              )}
              <div className={styles.lookupName}>{formData.name}</div>
              <div className={styles.lookupBarcode}>{result.product.barcode}</div>
              <span className={`${styles.categoryBadge} ${styles[formData.category]}`}>
                {formData.category}
              </span>
              <div className={styles.lookupSource}>Found on Open Food Facts</div>
            </div>
          </div>

          {/* Brand match notification */}
          {brandMatch && brandMatch.matchType === 'contains' && (
            <div style={{
              marginTop: '12px',
              padding: '10px 12px',
              background: '#dcfce7',
              borderRadius: '8px',
              fontSize: '13px',
              color: '#16a34a',
            }}>
              ✓ Matched to existing brand: <strong>{formData.brand}</strong>
            </div>
          )}

          {brandMatch && brandMatch.matchType === 'similar' && brandMatch.suggestions.length > 0 && (
            <div style={{
              marginTop: '12px',
              padding: '12px',
              background: '#fef3c7',
              borderRadius: '8px',
              fontSize: '13px',
            }}>
              <div style={{ color: '#92400e', marginBottom: '8px' }}>
                Similar brand found. Did you mean:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {brandMatch.suggestions.map(suggestion => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setFormData({ ...formData, brand: suggestion });
                      setBrandSearch(suggestion);
                      setBrandMatch({ ...brandMatch, matchType: 'exact' });
                    }}
                    style={{
                      padding: '6px 12px',
                      background: '#fff',
                      border: '1px solid #d97706',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: '#92400e',
                    }}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {(editMode || result.source === 'manual') && (
        <div>
          {result.source === 'manual' && (
            <p style={{ marginBottom: '16px', color: '#6b7280' }}>
              Product not found. Please enter details:
            </p>
          )}

          {/* Brand combo box */}
          <div className={styles.formGroup} style={{ position: 'relative' }}>
            <label className={styles.formLabel}>Brand</label>
            <input
              ref={brandInputRef}
              type="text"
              className={styles.formInput}
              value={brandSearch}
              onChange={(e) => {
                setBrandSearch(e.target.value);
                setFormData({ ...formData, brand: e.target.value });
                setShowBrandDropdown(true);
              }}
              onFocus={() => setShowBrandDropdown(true)}
              onBlur={() => setTimeout(() => setShowBrandDropdown(false), 200)}
              placeholder="Type to search or enter new brand..."
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
                maxHeight: '200px',
                overflow: 'auto',
                zIndex: 10,
              }}>
                {filteredBrands.map(b => (
                  <div
                    key={b.brand}
                    onClick={() => handleBrandSelect(b.brand)}
                    style={{
                      padding: '10px 14px',
                      cursor: 'pointer',
                      borderBottom: '1px solid #f3f4f6',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}
                  >
                    <span style={{ fontWeight: 500 }}>{b.brand}</span>
                    <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                      {b.count} product{b.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Name *</label>
            <input
              type="text"
              className={styles.formInput}
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Product name (without brand)"
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
