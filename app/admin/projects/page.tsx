'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAdminAuth } from '@/lib/contexts/AdminAuthContext';
import {
  fetchProjects,
  fetchLocations,
  fetchProperties,
  fetchPropertyManagers,
  deleteProject,
} from '@/lib/api/admin';
import type { Project, Location, Property, PropertyManager } from '@/types/database';
import { CreateProjectModal } from './components/CreateProjectModal';
import styles from './projects.module.css';
import adminStyles from '../admin.module.css';

// Navigation items for sidebar
const navItems = [
  { href: '/admin', label: 'Dashboard', icon: 'dashboard' },
  { href: '/admin/projects', label: 'Projects', icon: 'projects' },
  { href: '/admin/messages', label: 'Messages', icon: 'messages' },
];

function NavIcon({ name }: { name: string }) {
  switch (name) {
    case 'dashboard':
      return (
        <svg className={adminStyles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
    case 'projects':
      return (
        <svg className={adminStyles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
        </svg>
      );
    case 'equipment':
      return (
        <svg className={adminStyles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      );
    case 'surveys':
      return (
        <svg className={adminStyles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
      );
    case 'messages':
      return (
        <svg className={adminStyles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    default:
      return null;
  }
}

interface ProjectWithRelations extends Project {
  location?: Location;
  property?: Property;
  propertyManager?: PropertyManager;
}

export default function ProjectsListPage() {
  const { isAuthenticated, isLoading: authLoading, logout } = useAdminAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [projects, setProjects] = useState<Project[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [managers, setManagers] = useState<PropertyManager[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Redirect to login if not authenticated
  useEffect(() => {
    console.log('[PROJECTS PAGE] Auth state:', { authLoading, isAuthenticated });
    if (!authLoading && !isAuthenticated) {
      console.log('[PROJECTS PAGE] Would redirect - BUT DISABLED FOR DEBUG');
      // TEMPORARILY DISABLED FOR DEBUGGING
      // router.replace('/admin/login');
    }
  }, [isAuthenticated, authLoading, router]);

  // Load data
  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [isAuthenticated]);

  async function loadData() {
    console.log('[PROJECTS PAGE] loadData() called');
    try {
      setLoading(true);
      setError(null);
      const [projectsData, locationsData, propertiesData, managersData] = await Promise.all([
        fetchProjects(),
        fetchLocations(),
        fetchProperties(),
        fetchPropertyManagers(),
      ]);
      setProjects(projectsData);
      setLocations(locationsData);
      setProperties(propertiesData);
      setManagers(managersData);
    } catch (err) {
      console.error('[PROJECTS PAGE] loadData error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  // Enrich projects with relations
  const enrichedProjects = useMemo<ProjectWithRelations[]>(() => {
    return projects.map((project) => {
      const location = locations.find((l) => l.id === project.location_id);
      const property = location ? properties.find((p) => p.id === location.property_id) : undefined;
      const propertyManager = property
        ? managers.find((m) => m.id === property.property_manager_id)
        : undefined;
      return { ...project, location, property, propertyManager };
    });
  }, [projects, locations, properties, managers]);

  // Filter projects
  const filteredProjects = useMemo(() => {
    return enrichedProjects.filter((project) => {
      // Status filter
      if (statusFilter === 'active' && project.status !== 'in_progress') return false;
      if (statusFilter === 'inactive' && project.status === 'in_progress') return false;

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = project.name?.toLowerCase().includes(query);
        const matchesProperty = project.property?.name?.toLowerCase().includes(query);
        const matchesLocation = project.location?.name?.toLowerCase().includes(query);
        const matchesPM = project.propertyManager?.name?.toLowerCase().includes(query);
        if (!matchesName && !matchesProperty && !matchesLocation && !matchesPM) return false;
      }

      return true;
    });
  }, [enrichedProjects, statusFilter, searchQuery]);

  async function handleDeleteProject(e: React.MouseEvent, projectId: string) {
    e.stopPropagation();
    if (
      !window.confirm(
        'Delete this install? This will also delete all phases, tasks, and equipment. This cannot be undone.'
      )
    )
      return;
    try {
      await deleteProject(projectId);
      await loadData();
    } catch (err) {
      alert('Error deleting install: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }
  }

  function handleProjectClick(projectId: string) {
    router.push(`/admin/projects/${projectId}`);
  }

  const handleLogout = () => {
    logout();
    router.replace('/admin/login');
  };

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className={adminStyles.loadingContainer}>
        <div className={adminStyles.loadingSpinner} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className={adminStyles.adminLayout}>
      {/* Mobile Overlay */}
      <div
        className={`${adminStyles.sidebarOverlay} ${sidebarOpen ? adminStyles.sidebarOverlayVisible : ''}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`${adminStyles.sidebar} ${sidebarOpen ? adminStyles.sidebarVisible : ''}`}>
        <div className={adminStyles.sidebarHeader}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-light.png" alt="Raptor Vending" className={adminStyles.sidebarLogo} />
        </div>

        <nav className={adminStyles.sidebarNav}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${adminStyles.navItem} ${item.href === '/admin/projects' ? adminStyles.navItemActive : ''}`}
              onClick={() => setSidebarOpen(false)}
            >
              <NavIcon name={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={adminStyles.sidebarFooter}>
          <button onClick={handleLogout} className={adminStyles.logoutButton}>
            <svg className={adminStyles.navIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={adminStyles.mainContent}>
        {/* Topbar */}
        <header className={adminStyles.topbar}>
          <div className={adminStyles.topbarLeft}>
            <button className={adminStyles.menuToggle} onClick={() => setSidebarOpen(!sidebarOpen)}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
            <h1 className={adminStyles.pageTitle}>Projects</h1>
          </div>
          <div className={adminStyles.topbarRight}>
            <div className={adminStyles.userInfo}>
              <div className={adminStyles.userAvatar}>A</div>
              <span>Admin</span>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className={adminStyles.pageContent}>
          <div className={styles.projectsPage}>
            {/* Header */}
            <div className={styles.pageHeader}>
              <h2 className={styles.pageTitle}>Installs</h2>
              <div className={styles.headerActions}>
                <button className={styles.createButton} onClick={() => setShowCreateModal(true)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  New Install
                </button>
              </div>
            </div>

            {/* Filters */}
            <div className={styles.filters}>
              <input
                type="text"
                className={styles.searchInput}
                placeholder="Search by property, location, or PM..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <select
                className={styles.filterSelect}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>

            {/* Error */}
            {error && <div className={styles.error}>{error}</div>}

            {/* Loading */}
            {loading && (
              <div className={styles.loading}>
                <div className={styles.spinner} />
              </div>
            )}

            {/* Projects Grid */}
            {!loading && filteredProjects.length > 0 && (
              <div className={styles.projectsGrid}>
                {filteredProjects.map((project) => (
                  <div
                    key={project.id}
                    className={styles.projectCard}
                    onClick={() => handleProjectClick(project.id)}
                  >
                    <div className={styles.cardActions}>
                      <button
                        className={`${styles.iconButton} ${styles.delete}`}
                        onClick={(e) => handleDeleteProject(e, project.id)}
                        title="Delete"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          width="16"
                          height="16"
                        >
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                    <div className={styles.cardHeader}>
                      <span className={styles.projectNumber}>{project.name}</span>
                      <span
                        className={`${styles.statusBadge} ${project.status === 'in_progress' ? styles.active : styles.inactive}`}
                      >
                        {project.status === 'in_progress' ? 'Active' : project.status}
                      </span>
                    </div>
                    <div className={styles.cardBody}>
                      <h3 className={styles.propertyName}>{project.property?.name || 'Unknown Property'}</h3>
                      <p className={styles.locationName}>{project.location?.name || 'Unknown Location'}</p>
                      {project.propertyManager && (
                        <p className={styles.pmName}>PM: {project.propertyManager.name}</p>
                      )}
                      <div className={styles.progressBar}>
                        <div className={styles.progressTrack}>
                          <div className={styles.progressFill} style={{ width: '0%' }} />
                        </div>
                        <span className={styles.progressText}>0%</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty State */}
            {!loading && filteredProjects.length === 0 && (
              <div className={styles.emptyState}>
                <p>No projects found. Create a new install to get started.</p>
                <button className={styles.btnPrimary} onClick={() => setShowCreateModal(true)}>
                  Create Install
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Create Project Modal */}
      {showCreateModal && (
        <CreateProjectModal
          locations={locations}
          properties={properties}
          managers={managers}
          onClose={() => setShowCreateModal(false)}
          onSave={async () => {
            await loadData();
            setShowCreateModal(false);
          }}
        />
      )}
    </div>
  );
}
