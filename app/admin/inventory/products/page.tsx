'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AdminShell } from '../../components/AdminShell';
import { BrandNormalizer } from '../components/BrandNormalizer';
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
  is_active: boolean;
  created_at: string;
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'snack' | 'beverage' | 'meal'>('all');
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [showNormalizer, setShowNormalizer] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
    brand: '',
    name: '',
    barcode: '',
    category: 'snack' as 'snack' | 'beverage' | 'meal',
    default_price: '',
    image_url: '',
  });
  const [saving, setSaving] = useState(false);

  const loadProducts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await adminFetch('/api/admin/crud', {
        method: 'POST',
        body: JSON.stringify({ table: 'products', action: 'read' }),
      });
      const data = await res.json();
      setProducts(data.data || []);
    } catch (err) {
      console.error('Error loading products:', err);
      if (!(err instanceof AuthError)) {
        // Only show error for non-auth errors
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  // Get unique brands for filter dropdown
  const uniqueBrands = useMemo(() => {
    const brands = new Set<string>();
    products.forEach(p => {
      if (p.brand) brands.add(p.brand);
    });
    return Array.from(brands).sort();
  }, [products]);

  const filteredProducts = products.filter((p) => {
    // Search in brand, name, and barcode
    const searchLower = searchTerm.toLowerCase();
    const matchesSearch =
      (p.brand?.toLowerCase() || '').includes(searchLower) ||
      p.name.toLowerCase().includes(searchLower) ||
      p.barcode.toLowerCase().includes(searchLower);
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    const matchesBrand = brandFilter === 'all' || p.brand === brandFilter;
    return matchesSearch && matchesCategory && matchesBrand;
  });

  // Group products by brand for display
  const productsByBrand = useMemo(() => {
    const grouped: { [brand: string]: Product[] } = {};
    filteredProducts.forEach(p => {
      const brand = p.brand || 'Other';
      if (!grouped[brand]) grouped[brand] = [];
      grouped[brand].push(p);
    });
    // Sort brands alphabetically, with "Other" at the end
    const sortedBrands = Object.keys(grouped).sort((a, b) => {
      if (a === 'Other') return 1;
      if (b === 'Other') return -1;
      return a.localeCompare(b);
    });
    return { grouped, sortedBrands };
  }, [filteredProducts]);

  function openAddModal() {
    setEditingProduct(null);
    setFormData({
      brand: '',
      name: '',
      barcode: '',
      category: 'snack',
      default_price: '',
      image_url: '',
    });
    setShowModal(true);
  }

  function openEditModal(product: Product) {
    setEditingProduct(product);
    setFormData({
      brand: product.brand || '',
      name: product.name,
      barcode: product.barcode,
      category: product.category,
      default_price: product.default_price?.toString() || '',
      image_url: product.image_url || '',
    });
    setShowModal(true);
  }

  async function handleSave() {
    if (!formData.name.trim() || !formData.barcode.trim()) {
      alert('Name and barcode are required');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        brand: formData.brand.trim() || null,
        name: formData.name.trim(),
        barcode: formData.barcode.trim(),
        category: formData.category,
        default_price: formData.default_price ? parseFloat(formData.default_price) : null,
        image_url: formData.image_url.trim() || null,
      };

      if (editingProduct) {
        await adminFetch('/api/admin/crud', {
          method: 'POST',
          body: JSON.stringify({
            table: 'products',
            action: 'update',
            id: editingProduct.id,
            data: payload,
          }),
        });
      } else {
        await adminFetch('/api/admin/crud', {
          method: 'POST',
          body: JSON.stringify({
            table: 'products',
            action: 'create',
            data: payload,
          }),
        });
      }

      setShowModal(false);
      await loadProducts();
    } catch (err) {
      console.error('Error saving product:', err);
      alert('Error saving product');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(product: Product) {
    if (!confirm(`Delete "${product.brand ? product.brand + ' ' : ''}${product.name}"?`)) return;

    try {
      await adminFetch('/api/admin/crud', {
        method: 'POST',
        body: JSON.stringify({
          table: 'products',
          action: 'delete',
          id: product.id,
        }),
      });
      await loadProducts();
    } catch (err) {
      console.error('Error deleting product:', err);
      if (!(err instanceof AuthError)) {
        alert('Error deleting product');
      }
    }
  }

  if (loading) {
    return (
      <AdminShell title="Product Catalog">
        <div className={styles.inventoryPage}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Product Catalog">
      <div className={styles.inventoryPage}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <div className={styles.searchBar}>
            <input
              type="text"
              className={styles.searchInput}
              placeholder="Search by brand, name, or barcode..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className={styles.btnSecondary}
              onClick={() => setShowNormalizer(true)}
              style={{ padding: '12px 16px', whiteSpace: 'nowrap' }}
            >
              Normalize Brands
            </button>
            <button className={styles.addButton} onClick={openAddModal}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add
            </button>
          </div>
        </div>

        {/* Category Tabs */}
        <div className={styles.categoryTabs}>
          {(['all', 'snack', 'beverage', 'meal'] as const).map((cat) => (
            <button
              key={cat}
              className={`${styles.categoryTab} ${categoryFilter === cat ? styles.active : ''}`}
              onClick={() => setCategoryFilter(cat)}
            >
              {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1) + 's'}
            </button>
          ))}
        </div>

        {/* Brand Filter */}
        {uniqueBrands.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <select
              className={styles.formSelect}
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              style={{ maxWidth: '200px' }}
            >
              <option value="all">All Brands</option>
              {uniqueBrands.map(brand => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
          </div>
        )}

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="9" cy="21" r="1" />
                <circle cx="20" cy="21" r="1" />
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
              </svg>
            </div>
            <p>No products found.</p>
            <button className={styles.addButton} onClick={openAddModal} style={{ marginTop: 16 }}>
              Add Your First Product
            </button>
          </div>
        ) : (
          <div className={styles.productGrid}>
            {filteredProducts.map((product) => (
              <div key={product.id} className={styles.productCard}>
                <div className={styles.productImage}>
                  {product.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={product.image_url} alt={product.name} />
                  ) : (
                    <span className={styles.placeholder}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                        <line x1="12" y1="22.08" x2="12" y2="12" />
                      </svg>
                    </span>
                  )}
                </div>
                <div className={styles.productInfo}>
                  {product.brand && (
                    <div className={styles.productBrand}>{product.brand}</div>
                  )}
                  <div className={styles.productName}>{product.name}</div>
                  <div className={styles.productBarcode}>{product.barcode}</div>
                  <div className={styles.productDetails}>
                    <span className={`${styles.categoryBadge} ${styles[product.category]}`}>
                      {product.category}
                    </span>
                    {product.default_price && (
                      <span className={styles.productPrice}>${product.default_price.toFixed(2)}</span>
                    )}
                  </div>
                  <div className={styles.productActions}>
                    <button className={styles.btnEdit} onClick={() => openEditModal(product)}>
                      Edit
                    </button>
                    <button className={styles.btnDelete} onClick={() => handleDelete(product)}>
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add/Edit Modal */}
        {showModal && (
          <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
              <div className={styles.modalHeader}>
                <h2 className={styles.modalTitle}>
                  {editingProduct ? 'Edit Product' : 'Add Product'}
                </h2>
                <button className={styles.modalClose} onClick={() => setShowModal(false)}>
                  ×
                </button>
              </div>
              <div className={styles.modalBody}>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Brand</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder="Brand name (e.g., Black Rifle, Monster)"
                  />
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
                  <label className={styles.formLabel}>Barcode *</label>
                  <input
                    type="text"
                    className={styles.formInput}
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    placeholder="Barcode / UPC"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Category *</label>
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
                  <label className={styles.formLabel}>Default Price</label>
                  <input
                    type="number"
                    step="0.01"
                    className={styles.formInput}
                    value={formData.default_price}
                    onChange={(e) => setFormData({ ...formData, default_price: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Image URL</label>
                  <input
                    type="url"
                    className={styles.formInput}
                    value={formData.image_url}
                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                    placeholder="https://..."
                  />
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button className={styles.btnSecondary} onClick={() => setShowModal(false)}>
                  Cancel
                </button>
                <button className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
                  {saving ? 'Saving...' : editingProduct ? 'Save Changes' : 'Add Product'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Brand Normalizer Modal */}
        {showNormalizer && (
          <BrandNormalizer
            onClose={() => setShowNormalizer(false)}
            onComplete={() => {
              setShowNormalizer(false);
              loadProducts();
            }}
          />
        )}
      </div>
    </AdminShell>
  );
}
