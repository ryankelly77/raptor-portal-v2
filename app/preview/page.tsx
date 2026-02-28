'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';

interface Project {
  id: string;
  public_token: string;
  project_number: string | null;
  is_active: boolean;
  locationName: string;
  propertyName: string;
}

interface GroupedProjects {
  [propertyName: string]: Project[];
}

export default function PublicPreviewPage() {
  const [projects, setProjects] = useState<GroupedProjects>({});
  const [loading, setLoading] = useState(true);
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const loadProjects = useCallback(async () => {
    try {
      // Fetch projects with related data
      const response = await fetch('/api/admin/crud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table: 'projects',
          action: 'read',
          filters: { is_active: true },
        }),
      });
      const projectsResult = await response.json();

      // Fetch locations
      const locationsRes = await fetch('/api/admin/crud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'locations', action: 'read' }),
      });
      const locationsResult = await locationsRes.json();

      // Fetch properties
      const propertiesRes = await fetch('/api/admin/crud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'properties', action: 'read' }),
      });
      const propertiesResult = await propertiesRes.json();

      const rawProjects = projectsResult.data || [];
      const locations = locationsResult.data || [];
      const properties = propertiesResult.data || [];

      // Group projects by property
      const grouped: GroupedProjects = {};

      rawProjects.forEach((project: { id: string; public_token: string; project_number: string | null; is_active: boolean; location_id: string | null; property_id: string }) => {
        const location = locations.find((l: { id: string; name: string; property_id: string }) => l.id === project.location_id);
        const property = location
          ? properties.find((p: { id: string; name: string }) => p.id === location.property_id)
          : properties.find((p: { id: string; name: string }) => p.id === project.property_id);

        const propertyName = property?.name || 'Unknown Property';
        const locationName = location?.name || 'Unknown Location';

        if (!grouped[propertyName]) {
          grouped[propertyName] = [];
        }

        grouped[propertyName].push({
          id: project.id,
          public_token: project.public_token,
          project_number: project.project_number,
          is_active: project.is_active,
          locationName,
          propertyName,
        });
      });

      setProjects(grouped);

      // Default to first project
      const sortedProps = Object.keys(grouped).sort();
      if (sortedProps.length > 0 && grouped[sortedProps[0]].length > 0) {
        setSelectedToken(grouped[sortedProps[0]][0].public_token);
      }
    } catch (err) {
      console.error('Error loading projects:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  if (loading) {
    return (
      <div style={styles.loading}>
        <div style={styles.spinner} />
        <p>Loading...</p>
      </div>
    );
  }

  const sortedProperties = Object.keys(projects).sort();
  const allProjects = sortedProperties.flatMap((p) => projects[p]);
  const currentProject = allProjects.find((p) => p.public_token === selectedToken);

  return (
    <div style={styles.previewPane}>
      {/* Desktop Sidebar */}
      <div style={styles.sidebar}>
        <div style={styles.sidebarHeader}>
          <Image src="/logo-light.png" alt="Raptor Vending" width={160} height={64} style={{ objectFit: 'contain' }} />
        </div>
        <nav style={styles.sidebarNav}>
          <h3 style={styles.navTitle}>Properties</h3>
          {sortedProperties.map((propertyName) => (
            <div key={propertyName} style={styles.propertyGroup}>
              <div style={styles.propertyName}>{propertyName}</div>
              {projects[propertyName].map((project) => (
                <button
                  key={project.id}
                  onClick={() => setSelectedToken(project.public_token)}
                  style={{
                    ...styles.projectBtn,
                    ...(selectedToken === project.public_token ? styles.projectBtnActive : {}),
                  }}
                >
                  <span style={styles.locationText}>{project.locationName}</span>
                  {project.project_number && (
                    <span style={styles.projectNumber}>#{project.project_number}</span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
      </div>

      {/* Mobile Header */}
      <div style={styles.mobileHeader}>
        <Image src="/logo-dark.png" alt="Raptor Vending" width={120} height={32} />
        <span style={styles.mobileTitle}>Preview</span>
      </div>

      {/* Mobile Selector */}
      <div style={styles.mobileSelector}>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          style={styles.mobileToggle}
        >
          <span>{currentProject?.propertyName || 'Select Property'}</span>
          <span style={{ transform: mobileMenuOpen ? 'rotate(180deg)' : 'none' }}>▼</span>
        </button>
        {mobileMenuOpen && (
          <div style={styles.mobileMenu}>
            {sortedProperties.map((propertyName) => (
              <div key={propertyName} style={styles.mobileGroup}>
                <div style={styles.mobileProperty}>{propertyName}</div>
                {projects[propertyName].map((project) => (
                  <button
                    key={project.id}
                    onClick={() => {
                      setSelectedToken(project.public_token);
                      setMobileMenuOpen(false);
                    }}
                    style={{
                      ...styles.mobileItem,
                      ...(selectedToken === project.public_token ? styles.mobileItemActive : {}),
                    }}
                  >
                    {project.locationName}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Content */}
      <div style={styles.content}>
        {selectedToken ? (
          <iframe
            src={`/project/${selectedToken}`}
            style={styles.iframe}
            title="Project Preview"
          />
        ) : (
          <div style={styles.placeholder}>
            Select a project to preview
          </div>
        )}
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  previewPane: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    display: 'flex',
    background: '#f0f2f5',
  },
  sidebar: {
    width: '280px',
    minWidth: '280px',
    background: 'linear-gradient(180deg, #202020 0%, #1a1a1a 100%)',
    color: 'white',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  sidebarHeader: {
    padding: '25px 20px',
    textAlign: 'center',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  sidebarNav: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 0',
  },
  navTitle: {
    padding: '0 20px 15px',
    margin: 0,
    fontSize: '0.75em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: '1px',
  },
  propertyGroup: {
    marginTop: '15px',
  },
  propertyName: {
    padding: '8px 20px',
    fontSize: '0.85em',
    fontWeight: 600,
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  projectBtn: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    padding: '12px 20px',
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    color: 'white',
  },
  projectBtnActive: {
    background: '#FF580F',
  },
  locationText: {
    fontSize: '0.95em',
    fontWeight: 500,
  },
  projectNumber: {
    fontSize: '0.8em',
    color: 'rgba(255,255,255,0.6)',
    marginTop: '2px',
  },
  content: {
    flex: 1,
    background: '#f0f2f5',
    overflow: 'hidden',
  },
  iframe: {
    width: '100%',
    height: '100%',
    border: 'none',
  },
  placeholder: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    color: '#888',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    color: '#888',
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #e5e7eb',
    borderTopColor: '#ea580c',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    marginBottom: '16px',
  },
  mobileHeader: {
    display: 'none',
  },
  mobileSelector: {
    display: 'none',
  },
  mobileToggle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '16px 20px',
    background: 'transparent',
    border: 'none',
    color: 'white',
    fontSize: '1em',
    fontWeight: 600,
    cursor: 'pointer',
  },
  mobileMenu: {
    position: 'absolute',
    bottom: '100%',
    left: 0,
    right: 0,
    background: '#202020',
    borderTop: '1px solid rgba(255,255,255,0.1)',
    maxHeight: '60vh',
    overflowY: 'auto',
  },
  mobileGroup: {
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  mobileProperty: {
    padding: '12px 20px 8px',
    fontSize: '0.75em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: '0.5px',
  },
  mobileItem: {
    display: 'block',
    width: '100%',
    padding: '12px 20px',
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
    color: 'white',
    fontSize: '0.95em',
    cursor: 'pointer',
  },
  mobileItemActive: {
    background: '#FF580F',
  },
};
