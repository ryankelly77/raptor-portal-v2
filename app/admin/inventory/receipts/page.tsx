'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { AdminShell } from '../../components/AdminShell';
import { adminFetch, AuthError } from '@/lib/admin-fetch';
import styles from '../inventory.module.css';

interface Product {
  id: string;
  name: string;
  brand: string | null;
  barcode: string;
  units_per_package: number;
  unit_name: string;
  package_name: string;
}

interface Purchase {
  id: string;
  purchased_by: string;
  store_name: string;
  purchase_date: string;
  receipt_image_url: string | null;
  receipt_total: number | null;
  status: string;
  created_at: string;
}

interface PurchaseItem {
  id: string;
  purchase_id: string;
  product_id: string;
  quantity: number;
  unit_cost: number | null;
  expiration_date: string | null;
  package_qty: number | null;
  package_price: number | null;
  created_at: string;
}

interface Movement {
  id: string;
  product_id: string;
  location_id: string | null;
  quantity: number;
  movement_type: string;
  reason: string | null;
  moved_by: string | null;
  notes: string | null;
  expiration_date: string | null;
  purchase_item_id: string | null;
  created_at: string;
}

interface Location {
  id: string;
  name: string;
  property_id: string;
}

interface Property {
  id: string;
  name: string;
}

interface ReceiptWithItems extends Purchase {
  items: (PurchaseItem & { product: Product })[];
  itemCount: number;
  calculatedTotal: number;
}

interface MovementWithDetails extends Movement {
  product: Product | null;
  location: Location | null;
  propertyName: string | null;
  batchDate: string | null;
  batchStore: string | null;
}

type TabType = 'receipts' | 'transactions';

const MOVEMENT_TYPE_CONFIG: Record<string, { label: string; color: string; bgColor: string; prefix: string }> = {
  purchase_in: { label: 'Purchase In', color: '#16a34a', bgColor: '#dcfce7', prefix: '+' },
  restock_out: { label: 'Restock Out', color: '#ea580c', bgColor: '#ffedd5', prefix: '-' },
  restock_in: { label: 'Restock In', color: '#2563eb', bgColor: '#dbeafe', prefix: '+' },
  sold: { label: 'Sold', color: '#16a34a', bgColor: '#dcfce7', prefix: '-' },
  shrinkage: { label: 'Shrinkage', color: '#dc2626', bgColor: '#fef2f2', prefix: '-' },
  adjustment: { label: 'Adjustment', color: '#6b7280', bgColor: '#f3f4f6', prefix: '' },
};

export default function ReceiptsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('receipts');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Data
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [purchaseItems, setPurchaseItems] = useState<PurchaseItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);

  // UI State
  const [expandedReceipts, setExpandedReceipts] = useState<Set<string>>(new Set());
  const [receiptModal, setReceiptModal] = useState<string | null>(null);

  // Filters - Receipts
  const [storeFilter, setStoreFilter] = useState('');
  const [dateFromReceipts, setDateFromReceipts] = useState('');
  const [dateToReceipts, setDateToReceipts] = useState('');

  // Filters - Transactions
  const [productFilter, setProductFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [locationFilter, setLocationFilter] = useState('');
  const [dateFromTx, setDateFromTx] = useState('');
  const [dateToTx, setDateToTx] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [purchasesRes, itemsRes, productsRes, movementsRes, locationsRes, propertiesRes] = await Promise.all([
        adminFetch('/api/admin/crud', { method: 'POST', body: JSON.stringify({ table: 'inventory_purchases', action: 'read' }) }),
        adminFetch('/api/admin/crud', { method: 'POST', body: JSON.stringify({ table: 'inventory_purchase_items', action: 'read' }) }),
        adminFetch('/api/admin/crud', { method: 'POST', body: JSON.stringify({ table: 'products', action: 'read' }) }),
        adminFetch('/api/admin/crud', { method: 'POST', body: JSON.stringify({ table: 'inventory_movements', action: 'read' }) }),
        adminFetch('/api/admin/crud', { method: 'POST', body: JSON.stringify({ table: 'locations', action: 'read' }) }),
        adminFetch('/api/admin/crud', { method: 'POST', body: JSON.stringify({ table: 'properties', action: 'read' }) }),
      ]);

      setPurchases((await purchasesRes.json()).data || []);
      setPurchaseItems((await itemsRes.json()).data || []);
      setProducts((await productsRes.json()).data || []);
      setMovements((await movementsRes.json()).data || []);
      setLocations((await locationsRes.json()).data || []);
      setProperties((await propertiesRes.json()).data || []);
    } catch (err) {
      if (!(err instanceof AuthError)) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Maps for lookups
  const productsMap = useMemo(() => new Map(products.map(p => [p.id, p])), [products]);
  const locationsMap = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations]);
  const propertiesMap = useMemo(() => new Map(properties.map(p => [p.id, p])), [properties]);
  const purchasesMap = useMemo(() => new Map(purchases.map(p => [p.id, p])), [purchases]);
  const purchaseItemsMap = useMemo(() => new Map(purchaseItems.map(pi => [pi.id, pi])), [purchaseItems]);

  // Build receipts with items
  const receiptsWithItems: ReceiptWithItems[] = useMemo(() => {
    return purchases
      .map(purchase => {
        const items = purchaseItems
          .filter(pi => pi.purchase_id === purchase.id)
          .map(pi => ({
            ...pi,
            product: productsMap.get(pi.product_id) || {
              id: pi.product_id,
              name: 'Unknown Product',
              brand: null,
              barcode: '',
              units_per_package: 1,
              unit_name: 'each',
              package_name: 'each',
            },
          }));

        const calculatedTotal = items.reduce((sum, item) => {
          // item.quantity is PACKAGES, unit_cost is per unit
          const unitsPerPkg = item.product.units_per_package || 1;
          const totalUnits = item.quantity * unitsPerPkg;
          const price = item.package_price || (item.unit_cost ? item.unit_cost * totalUnits : 0);
          return sum + price;
        }, 0);

        return {
          ...purchase,
          items,
          itemCount: items.length,
          calculatedTotal,
        };
      })
      .sort((a, b) => new Date(b.purchase_date).getTime() - new Date(a.purchase_date).getTime());
  }, [purchases, purchaseItems, productsMap]);

  // Filter receipts
  const filteredReceipts = useMemo(() => {
    return receiptsWithItems.filter(r => {
      if (storeFilter && !r.store_name.toLowerCase().includes(storeFilter.toLowerCase())) return false;
      if (dateFromReceipts && r.purchase_date < dateFromReceipts) return false;
      if (dateToReceipts && r.purchase_date > dateToReceipts) return false;
      return true;
    });
  }, [receiptsWithItems, storeFilter, dateFromReceipts, dateToReceipts]);

  // Build movements with details
  const movementsWithDetails: MovementWithDetails[] = useMemo(() => {
    return movements
      .map(m => {
        const product = productsMap.get(m.product_id) || null;
        const location = m.location_id ? locationsMap.get(m.location_id) || null : null;
        const propertyName = location?.property_id ? propertiesMap.get(location.property_id)?.name || null : null;

        let batchDate: string | null = null;
        let batchStore: string | null = null;

        if (m.purchase_item_id) {
          const purchaseItem = purchaseItemsMap.get(m.purchase_item_id);
          if (purchaseItem) {
            const purchase = purchasesMap.get(purchaseItem.purchase_id);
            if (purchase) {
              batchDate = purchase.purchase_date;
              batchStore = purchase.store_name;
            }
          }
        }

        return {
          ...m,
          product,
          location,
          propertyName,
          batchDate,
          batchStore,
        };
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [movements, productsMap, locationsMap, propertiesMap, purchaseItemsMap, purchasesMap]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return movementsWithDetails.filter(m => {
      if (productFilter && m.product?.id !== productFilter) return false;
      if (typeFilter.length > 0 && !typeFilter.includes(m.movement_type)) return false;
      if (locationFilter && m.location?.id !== locationFilter) return false;
      const txDate = m.created_at.split('T')[0];
      if (dateFromTx && txDate < dateFromTx) return false;
      if (dateToTx && txDate > dateToTx) return false;
      return true;
    });
  }, [movementsWithDetails, productFilter, typeFilter, locationFilter, dateFromTx, dateToTx]);

  // Summaries
  const receiptsSummary = useMemo(() => ({
    count: filteredReceipts.length,
    total: filteredReceipts.reduce((sum, r) => sum + (r.receipt_total || r.calculatedTotal), 0),
  }), [filteredReceipts]);

  const transactionsSummary = useMemo(() => {
    let purchased = 0;
    let restocked = 0;
    let shrinkage = 0;

    filteredTransactions.forEach(t => {
      if (t.movement_type === 'purchase_in') purchased += t.quantity;
      else if (t.movement_type === 'restock_out') restocked += Math.abs(t.quantity);
      else if (t.movement_type === 'shrinkage') shrinkage += Math.abs(t.quantity);
    });

    return { count: filteredTransactions.length, purchased, restocked, shrinkage };
  }, [filteredTransactions]);

  // Unique stores for filter
  const uniqueStores = useMemo(() => {
    const stores = new Set(purchases.map(p => p.store_name).filter(Boolean));
    return Array.from(stores).sort();
  }, [purchases]);

  // Unique locations with property names
  const uniqueLocations = useMemo(() => {
    return locations.map(l => ({
      id: l.id,
      name: propertiesMap.get(l.property_id)?.name || l.name,
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [locations, propertiesMap]);

  // Format helpers
  const formatDate = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const formatDateShort = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  // Toggle receipt expansion
  const toggleReceipt = (id: string) => {
    setExpandedReceipts(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // CSV Export
  const exportReceiptsCSV = () => {
    const headers = ['purchase_date', 'store_name', 'product_name', 'product_brand', 'barcode', 'package_qty', 'units_per_package', 'total_units', 'package_price', 'unit_cost', 'expiration_date'];
    const rows: string[][] = [];

    filteredReceipts.forEach(r => {
      r.items.forEach(item => {
        const pkgQty = item.quantity; // quantity is now PACKAGES
        const unitsPerPkg = item.product.units_per_package || 1;
        const totalUnits = pkgQty * unitsPerPkg;
        rows.push([
          r.purchase_date,
          r.store_name,
          item.product.name,
          item.product.brand || '',
          item.product.barcode,
          String(pkgQty),
          String(unitsPerPkg),
          String(totalUnits),
          item.package_price?.toFixed(2) || '',
          item.unit_cost?.toFixed(2) || '',
          item.expiration_date || '',
        ]);
      });
    });

    downloadCSV(headers, rows, 'receipts');
  };

  const exportTransactionsCSV = () => {
    const headers = ['date', 'product_name', 'product_brand', 'barcode', 'movement_type', 'quantity', 'unit_cost', 'total_value', 'location', 'reason', 'batch_date', 'batch_store'];
    const rows: string[][] = [];

    filteredTransactions.forEach(t => {
      const unitCost = t.product ? (purchaseItems.find(pi => pi.product_id === t.product_id)?.unit_cost || 0) : 0;
      rows.push([
        t.created_at.split('T')[0],
        t.product?.name || 'Unknown',
        t.product?.brand || '',
        t.product?.barcode || '',
        t.movement_type,
        String(t.quantity),
        unitCost.toFixed(2),
        (Math.abs(t.quantity) * unitCost).toFixed(2),
        t.propertyName || '',
        t.notes || t.reason || '',
        t.batchDate || '',
        t.batchStore || '',
      ]);
    });

    downloadCSV(headers, rows, 'transactions');
  };

  const downloadCSV = (headers: string[], rows: string[][], filename: string) => {
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Toggle movement type filter
  const toggleTypeFilter = (type: string) => {
    setTypeFilter(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  if (loading) {
    return (
      <AdminShell title="Receipts & Transactions">
        <div className={styles.inventoryPage}>
          <div className={styles.loading}><div className={styles.spinner} /></div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Receipts & Transactions">
      <div className={styles.inventoryPage}>
        <Link href="/admin/inventory/stock" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: '#6b7280', fontSize: '14px', marginBottom: '16px', textDecoration: 'none' }}>
          ← Back to Stock
        </Link>

        {error && (
          <div style={{ background: '#fef2f2', color: '#dc2626', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>
        )}

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '16px', borderBottom: '2px solid #e5e7eb' }}>
          <button
            onClick={() => setActiveTab('receipts')}
            style={{
              padding: '12px 24px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'receipts' ? '2px solid #FF580F' : '2px solid transparent',
              marginBottom: '-2px',
              fontWeight: activeTab === 'receipts' ? 600 : 400,
              color: activeTab === 'receipts' ? '#FF580F' : '#6b7280',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Receipts
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            style={{
              padding: '12px 24px',
              background: 'none',
              border: 'none',
              borderBottom: activeTab === 'transactions' ? '2px solid #FF580F' : '2px solid transparent',
              marginBottom: '-2px',
              fontWeight: activeTab === 'transactions' ? 600 : 400,
              color: activeTab === 'transactions' ? '#FF580F' : '#6b7280',
              cursor: 'pointer',
              fontSize: '14px',
            }}
          >
            Transactions
          </button>
        </div>

        {/* RECEIPTS TAB */}
        {activeTab === 'receipts' && (
          <div>
            {/* Summary & Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                <strong>{receiptsSummary.count}</strong> receipts — <strong>${receiptsSummary.total.toFixed(2)}</strong> total purchases
              </div>
              <button onClick={exportReceiptsCSV} style={{ padding: '8px 16px', background: '#f3f4f6', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
                ⬇ Export CSV
              </button>
            </div>

            {/* Filters */}
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
              <input
                type="text"
                placeholder="Search store..."
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', minWidth: '150px' }}
              />
              <input
                type="date"
                value={dateFromReceipts}
                onChange={(e) => setDateFromReceipts(e.target.value)}
                style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
              />
              <span style={{ alignSelf: 'center', color: '#6b7280' }}>to</span>
              <input
                type="date"
                value={dateToReceipts}
                onChange={(e) => setDateToReceipts(e.target.value)}
                style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
              />
              {(storeFilter || dateFromReceipts || dateToReceipts) && (
                <button
                  onClick={() => { setStoreFilter(''); setDateFromReceipts(''); setDateToReceipts(''); }}
                  style={{ padding: '8px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Receipt List */}
            {filteredReceipts.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>No receipts found</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {filteredReceipts.map(receipt => (
                  <div key={receipt.id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', overflow: 'hidden' }}>
                    {/* Receipt Header */}
                    <div
                      onClick={() => toggleReceipt(receipt.id)}
                      style={{ padding: '16px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}
                    >
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '15px' }}>
                          {formatDate(receipt.purchase_date)} — {receipt.store_name}
                        </div>
                        <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                          {receipt.itemCount} item{receipt.itemCount !== 1 ? 's' : ''} — ${(receipt.receipt_total || receipt.calculatedTotal).toFixed(2)} total
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {receipt.receipt_image_url ? (
                          <button
                            onClick={(e) => { e.stopPropagation(); setReceiptModal(receipt.receipt_image_url); }}
                            style={{ padding: '6px 12px', background: '#dbeafe', color: '#2563eb', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: 500 }}
                          >
                            View Receipt
                          </button>
                        ) : (
                          <span style={{ fontSize: '12px', color: '#9ca3af' }}>No image</span>
                        )}
                        <span style={{ color: '#6b7280', fontSize: '14px' }}>
                          {expandedReceipts.has(receipt.id) ? '▲' : '▼'}
                        </span>
                      </div>
                    </div>

                    {/* Receipt Items */}
                    {expandedReceipts.has(receipt.id) && (
                      <div style={{ borderTop: '1px solid #e5e7eb', padding: '12px 16px', background: '#f9fafb' }}>
                        {receipt.items.map(item => {
                          const pkgQty = item.quantity; // quantity is now PACKAGES
                          const unitsPerPkg = item.product.units_per_package || 1;
                          const totalUnits = pkgQty * unitsPerPkg;
                          const pkgPrice = item.package_price || (item.unit_cost ? item.unit_cost * totalUnits : 0);
                          const unitCost = item.unit_cost || (totalUnits > 0 ? pkgPrice / totalUnits : 0);

                          return (
                            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #e5e7eb' }}>
                              <div>
                                {item.product.brand && (
                                  <span style={{ color: '#FF580F', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase' }}>{item.product.brand} </span>
                                )}
                                <span style={{ fontWeight: 500 }}>{item.product.name}</span>
                                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                  {pkgQty} {item.product.package_name}{pkgQty !== 1 ? 's' : ''}
                                  {unitsPerPkg > 1 && ` (${totalUnits} ${item.product.unit_name}s)`}
                                </div>
                              </div>
                              <div style={{ textAlign: 'right' }}>
                                <div style={{ fontWeight: 600 }}>${pkgPrice.toFixed(2)}</div>
                                <div style={{ fontSize: '11px', color: '#6b7280' }}>${unitCost.toFixed(2)}/{item.product.unit_name}</div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TRANSACTIONS TAB */}
        {activeTab === 'transactions' && (
          <div>
            {/* Summary & Actions */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
              <div style={{ fontSize: '14px', color: '#6b7280' }}>
                <strong>{transactionsSummary.count}</strong> transactions —
                <span style={{ color: '#16a34a' }}> {transactionsSummary.purchased} purchased</span> —
                <span style={{ color: '#ea580c' }}> {transactionsSummary.restocked} restocked</span> —
                <span style={{ color: '#dc2626' }}> {transactionsSummary.shrinkage} shrinkage</span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={styles.btnSecondary}
                  style={{ padding: '8px 16px', fontSize: '13px' }}
                >
                  {showFilters ? 'Hide Filters' : 'Filters'}
                </button>
                <button onClick={exportTransactionsCSV} style={{ padding: '8px 16px', background: '#f3f4f6', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
                  ⬇ Export CSV
                </button>
              </div>
            </div>

            {/* Filters */}
            {showFilters && (
              <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '16px', padding: '16px', background: '#f9fafb', borderRadius: '8px' }}>
                <select
                  value={productFilter}
                  onChange={(e) => setProductFilter(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', minWidth: '150px' }}
                >
                  <option value="">All Products</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.brand ? `${p.brand} ` : ''}{p.name}</option>
                  ))}
                </select>

                <select
                  value={locationFilter}
                  onChange={(e) => setLocationFilter(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px', minWidth: '150px' }}
                >
                  <option value="">All Locations</option>
                  {uniqueLocations.map(l => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>

                <input
                  type="date"
                  value={dateFromTx}
                  onChange={(e) => setDateFromTx(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                />
                <span style={{ alignSelf: 'center', color: '#6b7280' }}>to</span>
                <input
                  type="date"
                  value={dateToTx}
                  onChange={(e) => setDateToTx(e.target.value)}
                  style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '14px' }}
                />

                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                  {Object.entries(MOVEMENT_TYPE_CONFIG).map(([type, config]) => (
                    <button
                      key={type}
                      onClick={() => toggleTypeFilter(type)}
                      style={{
                        padding: '4px 10px',
                        background: typeFilter.includes(type) ? config.bgColor : '#fff',
                        color: typeFilter.includes(type) ? config.color : '#6b7280',
                        border: `1px solid ${typeFilter.includes(type) ? config.color : '#d1d5db'}`,
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        fontWeight: 500,
                      }}
                    >
                      {config.label}
                    </button>
                  ))}
                </div>

                {(productFilter || locationFilter || dateFromTx || dateToTx || typeFilter.length > 0) && (
                  <button
                    onClick={() => { setProductFilter(''); setLocationFilter(''); setDateFromTx(''); setDateToTx(''); setTypeFilter([]); }}
                    style={{ padding: '8px 12px', background: '#fee2e2', color: '#dc2626', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}
                  >
                    Clear All
                  </button>
                )}
              </div>
            )}

            {/* Transactions Table */}
            {filteredTransactions.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>No transactions found</div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                  <thead>
                    <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Date</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Product</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Type</th>
                      <th style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Qty</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Location</th>
                      <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#6b7280', fontSize: '11px', textTransform: 'uppercase' }}>Batch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map(tx => {
                      const typeConfig = MOVEMENT_TYPE_CONFIG[tx.movement_type] || { label: tx.movement_type, color: '#6b7280', bgColor: '#f3f4f6', prefix: '' };
                      const qty = tx.quantity;
                      const displayQty = typeConfig.prefix + Math.abs(qty);

                      return (
                        <tr key={tx.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                          <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                            {formatDateShort(tx.created_at.split('T')[0])}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            {tx.product?.brand && (
                              <span style={{ color: '#FF580F', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>{tx.product.brand} </span>
                            )}
                            <span style={{ fontWeight: 500 }}>{tx.product?.name || 'Unknown'}</span>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              background: typeConfig.bgColor,
                              color: typeConfig.color,
                            }}>
                              {typeConfig.label}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: typeConfig.color }}>
                            {displayQty}
                          </td>
                          <td style={{ padding: '10px 12px', color: '#6b7280' }}>
                            {tx.propertyName || '—'}
                          </td>
                          <td style={{ padding: '10px 12px', fontSize: '12px', color: '#6b7280' }}>
                            {tx.batchDate && tx.batchStore ? (
                              <span>{formatDate(tx.batchDate)} {tx.batchStore}</span>
                            ) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Receipt Image Modal */}
        {receiptModal && (
          <div
            onClick={() => setReceiptModal(null)}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
              padding: '20px',
            }}
          >
            <div style={{ maxWidth: '600px', maxHeight: '90vh', overflow: 'auto', background: '#fff', borderRadius: '12px', padding: '4px' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={receiptModal} alt="Receipt" style={{ width: '100%', display: 'block' }} />
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
