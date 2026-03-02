'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminShell } from '../../components/AdminShell';
import styles from '../inventory.module.css';

interface Product {
  id: string;
  barcode: string;
  name: string;
  category: 'snack' | 'beverage' | 'meal';
  default_price: number | null;
  image_url: string | null;
  is_active: boolean;
  created_at: string;
}

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('adminToken') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'snack' | 'beverage' | 'meal'>('all');
  const [showModal, setShowModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState({
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
      const res = await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ table: 'products', action: 'read' }),
      });
      const data = await res.json();
      setProducts(data.data || []);
    } catch (err) {
      console.error('Error loading products:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.barcode.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'all' || p.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  function openAddModal() {
    setEditingProduct(null);
    setFormData({
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
        name: formData.name.trim(),
        barcode: formData.barcode.trim(),
        category: formData.category,
        default_price: formData.default_price ? parseFloat(formData.default_price) : null,
        image_url: formData.image_url.trim() || null,
      };

      if (editingProduct) {
        await fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            table: 'products',
            action: 'update',
            id: editingProduct.id,
            data: payload,
          }),
        });
      } else {
        await fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
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
    if (!confirm(`Delete "${product.name}"?`)) return;

    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'products',
          action: 'delete',
          id: product.id,
        }),
      });
      await loadProducts();
    } catch (err) {
      console.error('Error deleting product:', err);
      alert('Error deleting product');
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
              placeholder="Search by name or barcode..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <button className={styles.addButton} onClick={openAddModal}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Product
          </button>
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
                    <span className={styles.placeholder}>📦</span>
                  )}
                </div>
                <div className={styles.productInfo}>
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
      </div>
    </AdminShell>
  );
}
