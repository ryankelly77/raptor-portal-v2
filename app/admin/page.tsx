'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminAuth } from '@/lib/contexts/AdminAuthContext';
import styles from './admin.module.css';

// Navigation items
const navItems = [
  { href: '/admin', label: 'Dashboard', icon: 'dashboard' },
  { href: '/admin/projects', label: 'Installs', icon: 'projects' },
  { href: '/admin/property-managers', label: 'Property Managers', icon: 'users' },
  { href: '/admin/inventory', label: 'Inventory', icon: 'inventory' },
  { href: '/admin/messages', label: 'Messages', icon: 'messages', badge: 0 },
  { href: '/admin/documents', label: 'Documents', icon: 'documents' },
  { href: '/admin/templates', label: 'Email Templates', icon: 'templates' },
  { href: '/admin/activity', label: 'Activity Log', icon: 'activity' },
  { href: '/admin/temperature', label: 'Temp Logs', icon: 'temperature' },
  { href: '/admin/users', label: 'Admin Users', icon: 'admin-users' },
  { href: '/admin/drivers', label: 'Drivers', icon: 'truck' },
  { href: '/admin/settings', label: 'Settings', icon: 'settings' },
];

interface Project {
  id: string;
  project_number: string | null;
  location_id: string | null;
  property_id: string;
  overall_progress: number;
  is_active: boolean;
  public_token: string;
  status: string;
}

interface Property {
  id: string;
  name: string;
  property_manager_id: string | null;
}

interface Location {
  id: string;
  name: string;
  property_id: string;
}

interface PropertyManager {
  id: string;
  name: string;
  company: string | null;
}

interface InventoryStats {
  totalOnHand: number;
  totalValue: number;
  productCount: number;
}

// Icons component
function NavIcon({ name }: { name: string }) {
  switch (name) {
    case 'dashboard':
      return (
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case 'projects':
      return (
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'users':
      return (
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case 'messages':
      return (
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'documents':
      return (
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    case 'templates':
      return (
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
          <polyline points="22,6 12,13 2,6" />
        </svg>
      );
    case 'activity':
      return (
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    case 'temperature':
      return (
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
        </svg>
      );
    case 'inventory':
      return (
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
          <line x1="12" y1="22.08" x2="12" y2="12" />
        </svg>
      );
    case 'admin-users':
      return (
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 4.354a4 4 0 1 1 0 5.292M15 21H3v-1a6 6 0 0 1 12 0v1zm0 0h6v-1a6 6 0 0 0-9-5.197M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z" />
        </svg>
      );
    case 'truck':
      return (
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="1" y="3" width="15" height="13" rx="1" />
          <path d="M16 8h4a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-1" />
          <path d="M16 17h-1" />
          <circle cx="5.5" cy="18.5" r="2.5" />
          <circle cx="18.5" cy="18.5" r="2.5" />
        </svg>
      );
    case 'settings':
      return (
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
    default:
      return null;
  }
}

function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('adminToken') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function AdminDashboard() {
  const { isAuthenticated, isLoading, logout } = useAdminAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data
  const [projects, setProjects] = useState<Project[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [managers, setManagers] = useState<PropertyManager[]>([]);
  const [inventoryStats, setInventoryStats] = useState<InventoryStats>({
    totalOnHand: 0,
    totalValue: 0,
    productCount: 0,
  });

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [projectsRes, propertiesRes, locationsRes, managersRes, movementsRes, purchaseItemsRes, productsRes] = await Promise.all([
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'projects', action: 'read' }),
        }),
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'properties', action: 'read' }),
        }),
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'locations', action: 'read' }),
        }),
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'property_managers', action: 'read' }),
        }),
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'inventory_movements', action: 'read' }),
        }),
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'inventory_purchase_items', action: 'read' }),
        }),
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'products', action: 'read' }),
        }),
      ]);

      const [projectsData, propertiesData, locationsData, managersData, movementsData, purchaseItemsData, productsData] = await Promise.all([
        projectsRes.json(),
        propertiesRes.json(),
        locationsRes.json(),
        managersRes.json(),
        movementsRes.json(),
        purchaseItemsRes.json(),
        productsRes.json(),
      ]);

      setProjects(projectsData.data || []);
      setProperties(propertiesData.data || []);
      setLocations(locationsData.data || []);
      setManagers(managersData.data || []);

      // Calculate inventory stats from movements
      const movements = movementsData.data || [];
      const purchaseItems = purchaseItemsData.data || [];
      const products = productsData.data || [];

      // Build maps for lookups
      type PurchaseItem = { id: string; product_id: string; unit_cost: number | null };
      const purchaseItemsByProduct = new Map<string, PurchaseItem[]>();
      for (const pi of purchaseItems) {
        const existing = purchaseItemsByProduct.get(pi.product_id) || [];
        existing.push(pi);
        purchaseItemsByProduct.set(pi.product_id, existing);
      }

      // Calculate on-hand per product from movements
      // On-hand = purchase_in - restock_out - shrinkage
      const purchasedByProduct = new Map<string, number>();
      const restockedOutByProduct = new Map<string, number>();
      const shrinkageByProduct = new Map<string, number>();

      for (const m of movements) {
        const productId = m.product_id;
        const qty = Math.abs(m.quantity);

        switch (m.movement_type) {
          case 'purchase_in':
            purchasedByProduct.set(productId, (purchasedByProduct.get(productId) || 0) + qty);
            break;
          case 'restock_out':
            restockedOutByProduct.set(productId, (restockedOutByProduct.get(productId) || 0) + qty);
            break;
          case 'shrinkage':
            shrinkageByProduct.set(productId, (shrinkageByProduct.get(productId) || 0) + qty);
            break;
        }
      }

      // Calculate totals
      let totalOnHand = 0;
      let totalValue = 0;
      let productCount = 0;

      for (const product of products) {
        const purchased = purchasedByProduct.get(product.id) || 0;
        const restockedOut = restockedOutByProduct.get(product.id) || 0;
        const shrinkage = shrinkageByProduct.get(product.id) || 0;
        const onHand = purchased - restockedOut - shrinkage;

        if (onHand > 0) {
          totalOnHand += onHand;
          productCount++;

          // Calculate value using average unit cost from purchase items
          const productPurchaseItems = purchaseItemsByProduct.get(product.id) || [];
          let totalCost = 0;
          let costCount = 0;
          for (const pi of productPurchaseItems) {
            if (pi.unit_cost) {
              totalCost += pi.unit_cost;
              costCount++;
            }
          }
          if (costCount > 0) {
            const avgCost = totalCost / costCount;
            totalValue += onHand * avgCost;
          }
        }
      }

      setInventoryStats({
        totalOnHand,
        totalValue: Math.round(totalValue * 100) / 100,
        productCount,
      });
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/admin/login');
    }
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated, loadData]);

  const handleLogout = () => {
    logout();
    router.replace('/admin/login');
  };

  // Helper to get location/property info for a project
  function getLocationInfo(project: Project) {
    const location = locations.find((l) => l.id === project.location_id);
    const property = location
      ? properties.find((p) => p.id === location.property_id)
      : properties.find((p) => p.id === project.property_id);
    const pm = property ? managers.find((m) => m.id === property.property_manager_id) : null;
    return { location, property, pm };
  }

  // Calculate stats
  const activeProjects = projects.filter((p) => p.is_active).length;

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner} />
      </div>
    );
  }

  // Don't render if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className={styles.adminLayout}>
      {/* Mobile Overlay */}
      <div
        className={`${styles.sidebarOverlay} ${sidebarOpen ? styles.sidebarOverlayVisible : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarVisible : ''}`}>
        <div className={styles.sidebarHeader}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-light.png" alt="Raptor Vending" className={styles.sidebarLogo} />
        </div>

        <nav className={styles.sidebarNav}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${item.href === '/admin' ? styles.navItemActive : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <NavIcon name={item.icon} />
              {item.label}
              {item.badge !== undefined && item.badge > 0 && (
                <span className={styles.navBadge}>{item.badge}</span>
              )}
            </Link>
          ))}
        </nav>

        <div className={styles.sidebarFooter}>
          <button onClick={handleLogout} className={styles.logoutButton}>
            <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={styles.mainContent}>
        {/* Topbar */}
        <header className={styles.topbar}>
          <div className={styles.topbarLeft}>
            <button className={styles.menuToggle} onClick={() => setSidebarOpen(!sidebarOpen)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <h1 className={styles.pageTitle}>Dashboard</h1>
          </div>
          <div className={styles.topbarRight}>
            <div className={styles.userInfo}>
              <div className={styles.userAvatar}>A</div>
              <span>Admin</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className={styles.pageContent}>
          {/* Stats Grid */}
          <div className={styles.dashboardGrid}>
            {/* Active Installs */}
            <Link href="/admin/projects" className={styles.statCard} style={{ textDecoration: 'none', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <p className={styles.statLabel}>Active Installs</p>
                  <p className={styles.statValue}>{loading ? '--' : activeProjects}</p>
                </div>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                  </svg>
                </div>
              </div>
            </Link>

            {/* Properties */}
            <Link href="/admin/property-managers" className={styles.statCard} style={{ textDecoration: 'none', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <p className={styles.statLabel}>Properties</p>
                  <p className={styles.statValue}>{loading ? '--' : properties.length}</p>
                </div>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                    <polyline points="9 22 9 12 15 12 15 22" />
                  </svg>
                </div>
              </div>
            </Link>

            {/* Inventory On-Hand */}
            <Link href="/admin/inventory/stock" className={styles.statCard} style={{ textDecoration: 'none', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <p className={styles.statLabel}>Inventory On-Hand</p>
                  <p className={styles.statValue} style={{ color: '#FF580F' }}>{loading ? '--' : inventoryStats.totalOnHand}</p>
                  <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                    {loading ? '' : `${inventoryStats.productCount} products · $${inventoryStats.totalValue.toFixed(2)} value`}
                  </p>
                </div>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#fff7ed', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FF580F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                    <line x1="12" y1="22.08" x2="12" y2="12" />
                  </svg>
                </div>
              </div>
            </Link>

            {/* Revenue - TODO: Replace with actual revenue from sales_records once sales import is built */}
            <Link href="/admin/inventory/receipts" className={styles.statCard} style={{ textDecoration: 'none', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <p className={styles.statLabel}>Revenue</p>
                  <p className={styles.statValue} style={{ color: '#16a34a' }}>$0.00</p>
                  <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                    Sales tracking coming soon
                  </p>
                </div>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                  </svg>
                </div>
              </div>
            </Link>
          </div>

          {/* Installs Section */}
          <div className={styles.sectionHeader}>
            <h2>Installs</h2>
            <Link href="/admin/projects" className={styles.btnPrimary}>
              + New Install
            </Link>
          </div>

          {loading ? (
            <div className={styles.loadingContainer}>
              <div className={styles.loadingSpinner} />
            </div>
          ) : projects.length === 0 ? (
            <div className={styles.emptyState}>
              <p>No installs yet. Create your first install to get started.</p>
            </div>
          ) : (
            <div className={styles.projectsGrid}>
              {projects.map((project) => {
                const { location, property, pm } = getLocationInfo(project);
                return (
                  <Link
                    key={project.id}
                    href={`/admin/projects/${project.id}`}
                    className={styles.projectCard}
                  >
                    <div className={styles.projectCardHeader}>
                      <span className={styles.projectNumber}>{project.project_number || 'No #'}</span>
                      <span className={`${styles.statusBadge} ${project.is_active ? styles.active : styles.inactive}`}>
                        {project.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                    <div className={styles.projectCardBody}>
                      <h3>{property?.name || 'Unknown Property'}</h3>
                      <p>{location?.name || 'Unknown Location'}</p>
                      {pm && <p className={styles.projectPM}>PM: {pm.name}</p>}
                      <div className={styles.projectProgress}>
                        <div className={styles.progressBarMini}>
                          <div
                            className={styles.progressFill}
                            style={{ width: `${project.overall_progress ?? 0}%` }}
                          />
                        </div>
                        <span>{project.overall_progress ?? 0}%</span>
                      </div>
                    </div>
                    <div className={styles.projectCardFooter}>
                      <span className={styles.tokenDisplay}>Token: {project.public_token}</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
