'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminAuth } from '@/lib/contexts/AdminAuthContext';
import styles from './admin.module.css';

// Navigation items - renamed Projects to Installs
const navItems = [
  { href: '/admin', label: 'Dashboard', icon: 'dashboard' },
  { href: '/admin/projects', label: 'Installs', icon: 'projects' },
  { href: '/admin/property-managers', label: 'Property Managers', icon: 'users' },
  { href: '/admin/messages', label: 'Messages', icon: 'messages', badge: 0 },
  { href: '/admin/documents', label: 'Documents', icon: 'documents' },
  { href: '/admin/templates', label: 'Email Templates', icon: 'templates' },
  { href: '/admin/activity', label: 'Activity Log', icon: 'activity' },
  { href: '/admin/temperature', label: 'Temp Logs', icon: 'temperature' },
  { href: '/admin/migrations', label: 'Migrations', icon: 'database' },
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
    case 'database':
      return (
        <svg className={styles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" />
          <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
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

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [projectsRes, propertiesRes, locationsRes, managersRes] = await Promise.all([
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
      ]);

      const [projectsData, propertiesData, locationsData, managersData] = await Promise.all([
        projectsRes.json(),
        propertiesRes.json(),
        locationsRes.json(),
        managersRes.json(),
      ]);

      setProjects(projectsData.data || []);
      setProperties(propertiesData.data || []);
      setLocations(locationsData.data || []);
      setManagers(managersData.data || []);
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
  const completedProjects = projects.filter((p) => p.overall_progress === 100).length;

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
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Active Installs</p>
              <p className={styles.statValue}>{loading ? '--' : activeProjects}</p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Completed</p>
              <p className={styles.statValue}>{loading ? '--' : completedProjects}</p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Properties</p>
              <p className={styles.statValue}>{loading ? '--' : properties.length}</p>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Property Managers</p>
              <p className={styles.statValue}>{loading ? '--' : managers.length}</p>
            </div>
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
                const { location, property } = getLocationInfo(project);
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
