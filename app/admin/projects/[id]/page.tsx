'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { useAdminAuth } from '@/lib/contexts/AdminAuthContext';
import {
  fetchProject,
  fetchPhases,
  fetchLocations,
  fetchProperties,
  fetchPropertyManagers,
  updateProject,
  createPhase,
  deleteProject,
} from '@/lib/api/admin';
import type { Project, Phase, Location, Property, PropertyManager } from '@/types/database';
import { PhaseEditor } from './components/PhaseEditor';
import { EquipmentManager } from './components/EquipmentManager';
import { ActivityLogPanel } from './components/ActivityLogPanel';
import styles from './editor.module.css';
import adminStyles from '../../admin.module.css';

// Navigation items
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

interface PhaseWithTasks extends Phase {
  tasks?: Array<{
    id: string;
    phase_id: string;
    label: string;
    completed: boolean;
    sort_order: number;
    scheduled_date: string | null;
    upload_speed: string | null;
    download_speed: string | null;
    enclosure_type: string | null;
    enclosure_color: string | null;
    custom_color_name: string | null;
    smartfridge_qty: number | null;
    smartcooker_qty: number | null;
    deliveries: unknown[] | null;
    document_url: string | null;
    pm_text_value: string | null;
    pm_text_response: string | null;
    notes: string | null;
  }>;
}

export default function ProjectEditorPage() {
  const { isAuthenticated, isLoading: authLoading, logout } = useAdminAuth();
  const router = useRouter();
  const params = useParams();
  const projectId = params.id as string;
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [project, setProject] = useState<Project | null>(null);
  const [phases, setPhases] = useState<PhaseWithTasks[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [managers, setManagers] = useState<PropertyManager[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'phases' | 'equipment' | 'activity'>('phases');
  const [editingProject, setEditingProject] = useState(false);
  const [projectForm, setProjectForm] = useState({
    name: '',
    status: 'planning' as Project['status'],
    description: '',
    target_install_date: '',
  });
  const [savingProject, setSavingProject] = useState(false);
  const [showPhaseModal, setShowPhaseModal] = useState(false);

  // Derived data
  const location = locations.find((l) => l.id === project?.location_id);
  const property = location ? properties.find((p) => p.id === location.property_id) : undefined;
  const propertyManager = property
    ? managers.find((m) => m.id === property.property_manager_id)
    : undefined;

  // Redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/admin/login');
    }
  }, [isAuthenticated, authLoading, router]);

  // Load data
  const loadData = useCallback(async () => {
    if (!projectId) return;
    try {
      setLoading(true);
      setError(null);

      const [projectData, phasesData, locationsData, propertiesData, managersData] = await Promise.all([
        fetchProject(projectId),
        fetchPhases(projectId),
        fetchLocations(),
        fetchProperties(),
        fetchPropertyManagers(),
      ]);

      if (!projectData) {
        setError('Project not found');
        return;
      }

      setProject(projectData);
      setPhases(phasesData as PhaseWithTasks[]);
      setLocations(locationsData);
      setProperties(propertiesData);
      setManagers(managersData);

      // Initialize form
      setProjectForm({
        name: projectData.name || '',
        status: projectData.status || 'planning',
        description: projectData.description || '',
        target_install_date: projectData.target_install_date || '',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (isAuthenticated && projectId) {
      loadData();
    }
  }, [isAuthenticated, projectId, loadData]);

  async function handleSaveProject() {
    if (!project) return;
    setSavingProject(true);
    try {
      await updateProject(project.id, {
        name: projectForm.name,
        status: projectForm.status,
        description: projectForm.description,
        target_install_date: projectForm.target_install_date || null,
      });
      await loadData();
      setEditingProject(false);
    } catch (err) {
      alert('Error saving project: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setSavingProject(false);
    }
  }

  async function handleDeleteProject() {
    if (!project) return;
    if (!window.confirm('Delete this project? This will also delete all phases, tasks, and equipment. This cannot be undone.')) {
      return;
    }
    try {
      await deleteProject(project.id);
      router.push('/admin/projects');
    } catch (err) {
      alert('Error deleting project: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleAddPhase(phaseData: { title: string; description: string }) {
    if (!project) return;
    try {
      await createPhase({
        project_id: project.id,
        title: phaseData.title,
        phase_number: phases.length + 1,
        status: 'not_started',
        description: phaseData.description,
        start_date: null,
        end_date: null,
        is_approximate: false,
        property_responsibility: null,
        contractor_name: null,
        contractor_scheduled_date: null,
        contractor_status: null,
        survey_response_rate: null,
        survey_top_meals: null,
        survey_top_snacks: null,
        survey_dietary_notes: null,
        document_url: null,
        document_label: null,
        documents: [],
      });
      setShowPhaseModal(false);
      await loadData();
    } catch (err) {
      alert('Error creating phase: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text);
    alert(`${label} copied to clipboard!`);
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
            <h1 className={adminStyles.pageTitle}>Project Editor</h1>
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
          <div className={styles.editorPage}>
            {/* Error */}
            {error && <div className={styles.error}>{error}</div>}

            {/* Loading */}
            {loading && (
              <div className={styles.loading}>
                <div className={styles.spinner} />
              </div>
            )}

            {!loading && project && (
              <>
                {/* Sticky Header */}
                <div className={styles.stickyHeader}>
                  You are editing: <strong>{property?.name || 'Unknown Property'}</strong> &mdash;{' '}
                  <strong>{location?.name || 'Unknown Location'}</strong>
                </div>

                {/* Page Header */}
                <div className={styles.pageHeader}>
                  <button className={styles.backButton} onClick={() => router.push('/admin/projects')}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 12H5M12 19l-7-7 7-7" />
                    </svg>
                    Back to Projects
                  </button>
                  <h2 className={styles.pageTitle}>{project.name}</h2>
                  <div className={styles.headerActions}>
                    <a
                      href={`/project/${project.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.btnSecondary}
                    >
                      View Public Page
                    </a>
                    <button
                      className={styles.btnSecondary}
                      onClick={() => copyToClipboard(`${window.location.origin}/project/${project.id}`, 'Public link')}
                    >
                      Copy Public Link
                    </button>
                    {propertyManager && (
                      <button
                        className={styles.btnSecondary}
                        onClick={() =>
                          copyToClipboard(
                            `${window.location.origin}/pm/${propertyManager.access_token}`,
                            'PM Portal link'
                          )
                        }
                      >
                        Copy PM Link
                      </button>
                    )}
                    <button className={styles.btnDanger} onClick={handleDeleteProject}>
                      Delete
                    </button>
                  </div>
                </div>

                {/* Project Details Card */}
                <div className={styles.editorCard}>
                  <div className={styles.cardHeader}>
                    <h3 className={styles.cardTitle}>Project Details</h3>
                    {!editingProject ? (
                      <button className={styles.btnEdit} onClick={() => setEditingProject(true)}>
                        Edit
                      </button>
                    ) : (
                      <div className={styles.btnGroup}>
                        <button className={styles.btnSave} onClick={handleSaveProject} disabled={savingProject}>
                          {savingProject ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          className={styles.btnCancel}
                          onClick={() => setEditingProject(false)}
                          disabled={savingProject}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                  <div className={styles.cardBody}>
                    {editingProject ? (
                      <div className={styles.formGrid}>
                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>Project Number</label>
                          <input
                            className={styles.formInput}
                            value={projectForm.name}
                            onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                          />
                        </div>
                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>Status</label>
                          <select
                            className={styles.formSelect}
                            value={projectForm.status}
                            onChange={(e) =>
                              setProjectForm({ ...projectForm, status: e.target.value as Project['status'] })
                            }
                          >
                            <option value="planning">Planning</option>
                            <option value="in_progress">In Progress</option>
                            <option value="completed">Completed</option>
                            <option value="on_hold">On Hold</option>
                            <option value="cancelled">Cancelled</option>
                          </select>
                        </div>
                        <div className={styles.formGroup}>
                          <label className={styles.formLabel}>Target Install Date</label>
                          <input
                            type="date"
                            className={styles.formInput}
                            value={projectForm.target_install_date}
                            onChange={(e) => setProjectForm({ ...projectForm, target_install_date: e.target.value })}
                          />
                        </div>
                        <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                          <label className={styles.formLabel}>Configuration</label>
                          <input
                            className={styles.formInput}
                            value={projectForm.description}
                            onChange={(e) => setProjectForm({ ...projectForm, description: e.target.value })}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className={styles.detailsGrid}>
                        <div>
                          <strong>Property:</strong> {property?.name || 'Unknown'}
                        </div>
                        <div>
                          <strong>Location:</strong> {location?.name || 'Unknown'}
                          {location?.floor ? ` (Floor ${location.floor})` : ''}
                        </div>
                        <div>
                          <strong>Property Manager:</strong> {propertyManager?.name || 'Not assigned'}
                          {propertyManager?.company ? ` (${propertyManager.company})` : ''}
                        </div>
                        <div>
                          <strong>Configuration:</strong> {project.description || 'Not set'}
                        </div>
                        <div>
                          <strong>Target Install:</strong> {project.target_install_date || 'Not set'}
                        </div>
                        <div>
                          <strong>Status:</strong> {project.status}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tabs */}
                <div className={styles.tabs}>
                  <button
                    className={`${styles.tab} ${activeTab === 'phases' ? styles.active : ''}`}
                    onClick={() => setActiveTab('phases')}
                  >
                    Phases & Tasks
                  </button>
                  <button
                    className={`${styles.tab} ${activeTab === 'equipment' ? styles.active : ''}`}
                    onClick={() => setActiveTab('equipment')}
                  >
                    Equipment
                  </button>
                  <button
                    className={`${styles.tab} ${activeTab === 'activity' ? styles.active : ''}`}
                    onClick={() => setActiveTab('activity')}
                  >
                    Activity Log
                  </button>
                </div>

                {/* Phases Tab */}
                {activeTab === 'phases' && (
                  <div className={styles.editorCard}>
                    <div className={styles.cardHeader}>
                      <h3 className={styles.cardTitle}>Phases & Tasks</h3>
                      <button className={styles.btnPrimary} onClick={() => setShowPhaseModal(true)}>
                        + Add Phase
                      </button>
                    </div>
                    <div className={styles.cardBody}>
                      {phases.map((phase, idx) => (
                        <PhaseEditor
                          key={phase.id}
                          phase={phase}
                          phaseNumber={idx + 1}
                          projectId={project.id}
                          onRefresh={loadData}
                        />
                      ))}
                      {phases.length === 0 && (
                        <div className={styles.emptyState}>No phases yet. Add a phase to get started.</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Equipment Tab */}
                {activeTab === 'equipment' && <EquipmentManager projectId={project.id} />}

                {/* Activity Tab */}
                {activeTab === 'activity' && <ActivityLogPanel projectId={project.id} />}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Add Phase Modal */}
      {showPhaseModal && (
        <AddPhaseModal
          onClose={() => setShowPhaseModal(false)}
          onSave={handleAddPhase}
        />
      )}
    </div>
  );
}

// Add Phase Modal
function AddPhaseModal({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (data: { title: string; description: string }) => void;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Add New Phase</h3>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Title</label>
            <input
              className={styles.formInput}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Phase title"
            />
          </div>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Description</label>
            <textarea
              className={styles.formTextarea}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Phase description"
            />
          </div>
        </div>
        <div className={styles.modalFooter}>
          <button className={styles.btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <button
            className={styles.btnPrimary}
            onClick={() => onSave({ title, description })}
            disabled={!title.trim()}
          >
            Add Phase
          </button>
        </div>
      </div>
    </div>
  );
}
