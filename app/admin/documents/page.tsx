'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { AdminShell } from '../components/AdminShell';
import styles from './documents.module.css';

interface Phase {
  id: string;
  project_id: string;
  name: string;
  document_url: string | null;
  document_label: string | null;
  documents: PhaseDocument[] | null;
}

interface PhaseDocument {
  id: string;
  name: string;
  url: string;
  uploadedAt?: string;
}

interface Project {
  id: string;
  project_number: string | null;
  name: string | null;
  location_id: string | null;
}

interface Location {
  id: string;
  name: string;
  property_id: string | null;
}

interface Property {
  id: string;
  name: string;
}

interface GlobalDocument {
  id: string;
  key: string;
  label: string;
  url: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface DocumentRow {
  id: string;
  name: string;
  type: string;
  url: string;
  projectId: string | null;
  projectNumber: string | null;
  propertyName: string | null;
  phaseName: string | null;
  uploadedAt: string | null;
  isGlobal: boolean;
}

// Get auth headers for API calls
function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('adminToken') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [projects, setProjects] = useState<{ id: string; label: string }[]>([]);

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch all data in parallel
      const [phasesRes, projectsRes, locationsRes, propertiesRes, globalDocsRes] = await Promise.all([
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'phases', action: 'read' }),
        }),
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'projects', action: 'read' }),
        }),
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'locations', action: 'read' }),
        }),
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'properties', action: 'read' }),
        }),
        fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({ table: 'global_documents', action: 'read' }),
        }),
      ]);

      const [phasesData, projectsData, locationsData, propertiesData, globalDocsData] = await Promise.all([
        phasesRes.json(),
        projectsRes.json(),
        locationsRes.json(),
        propertiesRes.json(),
        globalDocsRes.json(),
      ]);

      const phases: Phase[] = phasesData.data || [];
      const projectsList: Project[] = projectsData.data || [];
      const locations: Location[] = locationsData.data || [];
      const properties: Property[] = propertiesData.data || [];
      const globalDocs: GlobalDocument[] = globalDocsData.data || [];

      // Build lookup maps
      const projectMap = new Map(projectsList.map(p => [p.id, p]));
      const locationMap = new Map(locations.map(l => [l.id, l]));
      const propertyMap = new Map(properties.map(p => [p.id, p]));

      // Get property name for a project
      function getPropertyName(projectId: string): string | null {
        const project = projectMap.get(projectId);
        if (!project?.location_id) return null;
        const location = locationMap.get(project.location_id);
        if (!location?.property_id) return null;
        const property = propertyMap.get(location.property_id);
        return property?.name || null;
      }

      // Build document rows from phases
      const docRows: DocumentRow[] = [];

      for (const phase of phases) {
        const project = projectMap.get(phase.project_id);
        const propertyName = getPropertyName(phase.project_id);

        // Single document on phase
        if (phase.document_url) {
          docRows.push({
            id: `phase-${phase.id}-single`,
            name: phase.document_label || 'Document',
            type: guessDocumentType(phase.document_label || phase.name),
            url: phase.document_url,
            projectId: phase.project_id,
            projectNumber: project?.project_number || project?.name || null,
            propertyName,
            phaseName: phase.name,
            uploadedAt: null,
            isGlobal: false,
          });
        }

        // Multiple documents array on phase
        if (phase.documents && Array.isArray(phase.documents)) {
          for (const doc of phase.documents) {
            if (doc.url) {
              docRows.push({
                id: `phase-${phase.id}-doc-${doc.id}`,
                name: doc.name || 'Document',
                type: guessDocumentType(doc.name || phase.name),
                url: doc.url,
                projectId: phase.project_id,
                projectNumber: project?.project_number || project?.name || null,
                propertyName,
                phaseName: phase.name,
                uploadedAt: doc.uploadedAt || null,
                isGlobal: false,
              });
            }
          }
        }
      }

      // Add global documents
      for (const doc of globalDocs) {
        if (doc.url) {
          docRows.push({
            id: `global-${doc.id}`,
            name: doc.label,
            type: 'Global',
            url: doc.url,
            projectId: null,
            projectNumber: null,
            propertyName: null,
            phaseName: null,
            uploadedAt: doc.updated_at,
            isGlobal: true,
          });
        }
      }

      setDocuments(docRows);

      // Build project filter options
      const projectOptions: { id: string; label: string }[] = [];
      for (const project of projectsList) {
        const propertyName = getPropertyName(project.id);
        projectOptions.push({
          id: project.id,
          label: `${project.project_number || project.name || 'Unnamed'} - ${propertyName || 'Unknown Property'}`,
        });
      }
      setProjects(projectOptions);

    } catch (err) {
      console.error('Error loading documents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Filter documents
  const filteredDocuments = useMemo(() => {
    return documents.filter((doc) => {
      // Type filter
      if (typeFilter !== 'all' && doc.type !== typeFilter) return false;

      // Project filter
      if (projectFilter === 'global' && !doc.isGlobal) return false;
      if (projectFilter !== 'all' && projectFilter !== 'global' && doc.projectId !== projectFilter) return false;

      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = doc.name.toLowerCase().includes(query);
        const matchesProject = doc.projectNumber?.toLowerCase().includes(query);
        const matchesProperty = doc.propertyName?.toLowerCase().includes(query);
        const matchesPhase = doc.phaseName?.toLowerCase().includes(query);
        const matchesType = doc.type.toLowerCase().includes(query);
        if (!matchesName && !matchesProject && !matchesProperty && !matchesPhase && !matchesType) return false;
      }

      return true;
    });
  }, [documents, typeFilter, projectFilter, searchQuery]);

  // Get unique document types for filter
  const documentTypes = useMemo(() => {
    const types = new Set(documents.map(d => d.type));
    return Array.from(types).sort();
  }, [documents]);

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return '—';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return '—';
    }
  }

  if (loading) {
    return (
      <AdminShell title="Documents">
        <div className={styles.documentsPage}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Documents">
      <div className={styles.documentsPage}>
        <div className={styles.pageHeader}>
          <p className={styles.pageDescription}>
            All documents attached to projects, phases, and global documents.
          </p>
        </div>

        {/* Filters */}
        <div className={styles.filters}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search documents..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <select
            className={styles.filterSelect}
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All Types</option>
            {documentTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
          <select
            className={styles.filterSelect}
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="all">All Projects</option>
            <option value="global">Global Documents Only</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.label}</option>
            ))}
          </select>
        </div>

        {/* Stats */}
        <div className={styles.stats}>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{filteredDocuments.length}</span>
            <span className={styles.statLabel}>Documents</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{filteredDocuments.filter(d => !d.isGlobal).length}</span>
            <span className={styles.statLabel}>Project Documents</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{filteredDocuments.filter(d => d.isGlobal).length}</span>
            <span className={styles.statLabel}>Global Documents</span>
          </div>
        </div>

        {/* Documents Table */}
        {filteredDocuments.length === 0 ? (
          <div className={styles.emptyState}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <h3>No documents found</h3>
            <p>No documents match your current filters.</p>
          </div>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Document Name</th>
                  <th>Type</th>
                  <th>Install / Project</th>
                  <th>Phase</th>
                  <th>Uploaded</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocuments.map((doc) => (
                  <tr key={doc.id}>
                    <td>
                      <div className={styles.docNameCell}>
                        <div className={styles.docIcon}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                        </div>
                        <span className={styles.docName}>{doc.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.typeBadge} ${doc.isGlobal ? styles.typeGlobal : ''}`}>
                        {doc.type}
                      </span>
                    </td>
                    <td>
                      {doc.isGlobal ? (
                        <span className={styles.globalLabel}>Global Document</span>
                      ) : (
                        <div className={styles.projectCell}>
                          <span className={styles.projectNumber}>{doc.projectNumber || '—'}</span>
                          {doc.propertyName && (
                            <span className={styles.propertyName}>{doc.propertyName}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td>
                      <span className={styles.phaseName}>{doc.phaseName || '—'}</span>
                    </td>
                    <td>
                      <span className={styles.dateValue}>{formatDate(doc.uploadedAt)}</span>
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.btnView}
                          title="View Document"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </a>
                        <a
                          href={doc.url}
                          download
                          className={styles.btnDownload}
                          title="Download"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                        </a>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

// Guess document type based on name
function guessDocumentType(name: string): string {
  const nameLower = name.toLowerCase();

  if (nameLower.includes('contract')) return 'Contract';
  if (nameLower.includes('coi') || nameLower.includes('insurance') || nameLower.includes('certificate')) return 'COI';
  if (nameLower.includes('agreement')) return 'Agreement';
  if (nameLower.includes('proposal')) return 'Proposal';
  if (nameLower.includes('invoice')) return 'Invoice';
  if (nameLower.includes('quote')) return 'Quote';
  if (nameLower.includes('permit')) return 'Permit';
  if (nameLower.includes('plan') || nameLower.includes('drawing') || nameLower.includes('layout')) return 'Plans';
  if (nameLower.includes('photo') || nameLower.includes('image')) return 'Photo';
  if (nameLower.includes('report')) return 'Report';
  if (nameLower.includes('manual') || nameLower.includes('guide')) return 'Manual';
  if (nameLower.includes('spec')) return 'Specifications';

  return 'Document';
}
