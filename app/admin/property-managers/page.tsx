'use client';

import { useState, useEffect, useCallback } from 'react';
import { AdminShell } from '../components/AdminShell';
import styles from './pm.module.css';

interface Location {
  id: string;
  property_id: string;
  name: string;
  created_at: string;
}

interface Property {
  id: string;
  property_manager_id: string;
  name: string;
  created_at: string;
  locations?: Location[];
}

interface PropertyManager {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  is_active: boolean;
  access_token: string;
  created_at: string;
  properties?: Property[];
}

// Get auth headers for API calls
function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('adminToken') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function PropertyManagersPage() {
  const [managers, setManagers] = useState<PropertyManager[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [expandedPM, setExpandedPM] = useState<string | null>(null);
  const [expandedProperty, setExpandedProperty] = useState<string | null>(null);

  // Edit states
  const [editingPM, setEditingPM] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', company: '' });

  // Add states
  const [showAddPM, setShowAddPM] = useState(false);
  const [newPMForm, setNewPMForm] = useState({ name: '', email: '', phone: '', company: '' });
  const [addingPropertyFor, setAddingPropertyFor] = useState<string | null>(null);
  const [newPropertyName, setNewPropertyName] = useState('');
  const [addingLocationFor, setAddingLocationFor] = useState<string | null>(null);
  const [newLocationName, setNewLocationName] = useState('');

  // Edit property/location states
  const [editingProperty, setEditingProperty] = useState<string | null>(null);
  const [editPropertyName, setEditPropertyName] = useState('');
  const [editingLocation, setEditingLocation] = useState<string | null>(null);
  const [editLocationName, setEditLocationName] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      // Load property managers
      const pmRes = await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ table: 'property_managers', action: 'read' }),
      });
      const pmData = await pmRes.json();
      const pms: PropertyManager[] = pmData.data || [];

      // Load properties
      const propRes = await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ table: 'properties', action: 'read' }),
      });
      const propData = await propRes.json();
      const properties: Property[] = propData.data || [];

      // Load locations
      const locRes = await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ table: 'locations', action: 'read' }),
      });
      const locData = await locRes.json();
      const locations: Location[] = locData.data || [];

      // Nest locations into properties
      const propsWithLocs = properties.map((prop) => ({
        ...prop,
        locations: locations.filter((loc) => loc.property_id === prop.id),
      }));

      // Nest properties into PMs
      const pmsWithProps = pms.map((pm) => ({
        ...pm,
        properties: propsWithLocs.filter((prop) => prop.property_manager_id === pm.id),
      }));

      setManagers(pmsWithProps);
    } catch (err) {
      console.error('Error loading data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filter managers
  const filteredManagers = managers.filter((pm) => {
    const matchesSearch =
      pm.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pm.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      pm.company?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && pm.is_active) ||
      (statusFilter === 'inactive' && !pm.is_active);
    return matchesSearch && matchesStatus;
  });

  // PM CRUD
  async function handleCreatePM() {
    if (!newPMForm.name.trim()) return;
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'property_managers',
          action: 'create',
          data: {
            name: newPMForm.name.trim(),
            email: newPMForm.email.trim() || null,
            phone: newPMForm.phone.trim() || null,
            company: newPMForm.company.trim() || null,
            is_active: true,
          },
        }),
      });
      setNewPMForm({ name: '', email: '', phone: '', company: '' });
      setShowAddPM(false);
      await loadData();
    } catch (err) {
      alert('Error creating PM: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleUpdatePM(id: string) {
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'property_managers',
          action: 'update',
          id,
          data: {
            name: editForm.name.trim(),
            email: editForm.email.trim() || null,
            phone: editForm.phone.trim() || null,
            company: editForm.company.trim() || null,
          },
        }),
      });
      setEditingPM(null);
      await loadData();
    } catch (err) {
      alert('Error updating PM: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleDeletePM(id: string) {
    if (!window.confirm('Delete this property manager and all their properties/locations?')) return;
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ table: 'property_managers', action: 'delete', id }),
      });
      await loadData();
    } catch (err) {
      alert('Error deleting PM: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleTogglePMActive(pm: PropertyManager) {
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'property_managers',
          action: 'update',
          id: pm.id,
          data: { is_active: !pm.is_active },
        }),
      });
      await loadData();
    } catch (err) {
      alert('Error updating PM: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  function startEditingPM(pm: PropertyManager) {
    setEditingPM(pm.id);
    setEditForm({
      name: pm.name,
      email: pm.email || '',
      phone: pm.phone || '',
      company: pm.company || '',
    });
  }

  function copyPMLink(token: string) {
    const url = `${window.location.origin}/pm/${token}`;
    navigator.clipboard.writeText(url);
    alert('PM portal link copied to clipboard!');
  }

  // Property CRUD
  async function handleCreateProperty(pmId: string) {
    if (!newPropertyName.trim()) return;
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'properties',
          action: 'create',
          data: {
            property_manager_id: pmId,
            name: newPropertyName.trim(),
          },
        }),
      });
      setNewPropertyName('');
      setAddingPropertyFor(null);
      await loadData();
    } catch (err) {
      alert('Error creating property: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleUpdateProperty(id: string) {
    if (!editPropertyName.trim()) return;
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'properties',
          action: 'update',
          id,
          data: { name: editPropertyName.trim() },
        }),
      });
      setEditingProperty(null);
      await loadData();
    } catch (err) {
      alert('Error updating property: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleDeleteProperty(id: string) {
    if (!window.confirm('Delete this property and all its locations?')) return;
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ table: 'properties', action: 'delete', id }),
      });
      await loadData();
    } catch (err) {
      alert('Error deleting property: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  // Location CRUD
  async function handleCreateLocation(propertyId: string) {
    if (!newLocationName.trim()) return;
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'locations',
          action: 'create',
          data: {
            property_id: propertyId,
            name: newLocationName.trim(),
          },
        }),
      });
      setNewLocationName('');
      setAddingLocationFor(null);
      await loadData();
    } catch (err) {
      alert('Error creating location: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleUpdateLocation(id: string) {
    if (!editLocationName.trim()) return;
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'locations',
          action: 'update',
          id,
          data: { name: editLocationName.trim() },
        }),
      });
      setEditingLocation(null);
      await loadData();
    } catch (err) {
      alert('Error updating location: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleDeleteLocation(id: string) {
    if (!window.confirm('Delete this location?')) return;
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ table: 'locations', action: 'delete', id }),
      });
      await loadData();
    } catch (err) {
      alert('Error deleting location: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  if (loading) {
    return (
      <AdminShell title="Property Managers">
        <div className={styles.pmPage}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Property Managers">
      <div className={styles.pmPage}>
        <div className={styles.pageHeader}>
        <div className={styles.headerActions}>
          <button className={styles.createButton} onClick={() => setShowAddPM(true)}>
            + Add Property Manager
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <input
          className={styles.searchInput}
          placeholder="Search by name, email, or company..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
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

      {/* Add PM Form */}
      {showAddPM && (
        <div className={styles.inlineForm}>
          <input
            placeholder="Name *"
            value={newPMForm.name}
            onChange={(e) => setNewPMForm({ ...newPMForm, name: e.target.value })}
          />
          <input
            placeholder="Email"
            value={newPMForm.email}
            onChange={(e) => setNewPMForm({ ...newPMForm, email: e.target.value })}
          />
          <input
            placeholder="Phone"
            value={newPMForm.phone}
            onChange={(e) => setNewPMForm({ ...newPMForm, phone: e.target.value })}
          />
          <input
            placeholder="Company"
            value={newPMForm.company}
            onChange={(e) => setNewPMForm({ ...newPMForm, company: e.target.value })}
          />
          <button className={styles.btnSave} onClick={handleCreatePM}>
            Create
          </button>
          <button className={styles.btnCancel} onClick={() => setShowAddPM(false)}>
            Cancel
          </button>
        </div>
      )}

      {/* PM List */}
      <div className={styles.pmList}>
        {filteredManagers.map((pm) => (
          <div key={pm.id} className={styles.pmCard}>
            <div className={styles.pmHeader} onClick={() => setExpandedPM(expandedPM === pm.id ? null : pm.id)}>
              <span className={`${styles.expandIcon} ${expandedPM === pm.id ? styles.expanded : ''}`}>▶</span>

              {editingPM === pm.id ? (
                <div className={styles.pmEditForm} onClick={(e) => e.stopPropagation()}>
                  <input
                    value={editForm.name}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    placeholder="Name"
                  />
                  <input
                    value={editForm.email}
                    onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                    placeholder="Email"
                  />
                  <input
                    value={editForm.phone}
                    onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    placeholder="Phone"
                  />
                  <input
                    value={editForm.company}
                    onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                    placeholder="Company"
                  />
                  <div className={styles.editActions}>
                    <button className={styles.btnSave} onClick={() => handleUpdatePM(pm.id)}>
                      Save
                    </button>
                    <button className={styles.btnCancel} onClick={() => setEditingPM(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.pmInfo}>
                    <span className={styles.pmName}>{pm.name}</span>
                    <span className={styles.pmEmail}>{pm.email || '—'}</span>
                    <span className={styles.pmPhone}>{pm.phone || '—'}</span>
                    <span className={styles.pmCompany}>{pm.company || '—'}</span>
                    <div className={styles.pmStats}>
                      <span className={`${styles.badge} ${pm.is_active ? styles.badgeActive : styles.badgeInactive}`}>
                        {pm.is_active ? 'Active' : 'Inactive'}
                      </span>
                      <span className={`${styles.badge} ${styles.badgeCount}`}>
                        {pm.properties?.length || 0} properties
                      </span>
                    </div>
                  </div>
                  <div className={styles.pmActions} onClick={(e) => e.stopPropagation()}>
                    <button className={styles.btnCopyLink} onClick={() => copyPMLink(pm.access_token)}>
                      Copy Link
                    </button>
                    <button className={styles.btnEdit} onClick={() => startEditingPM(pm)}>
                      Edit
                    </button>
                    <button className={styles.btnToggle} onClick={() => handleTogglePMActive(pm)}>
                      {pm.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button className={styles.btnDelete} onClick={() => handleDeletePM(pm.id)}>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Expanded PM Content */}
            {expandedPM === pm.id && (
              <div className={styles.pmContent}>
                {/* Add Property Form */}
                {addingPropertyFor === pm.id && (
                  <div className={styles.inlineForm}>
                    <input
                      placeholder="Property name"
                      value={newPropertyName}
                      onChange={(e) => setNewPropertyName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCreateProperty(pm.id);
                      }}
                    />
                    <button className={styles.btnSave} onClick={() => handleCreateProperty(pm.id)}>
                      Add
                    </button>
                    <button className={styles.btnCancel} onClick={() => setAddingPropertyFor(null)}>
                      Cancel
                    </button>
                  </div>
                )}

                {/* Properties List */}
                <div className={styles.propertiesList}>
                  {pm.properties?.map((property) => (
                    <div key={property.id} className={styles.propertyCard}>
                      <div
                        className={styles.propertyHeader}
                        onClick={() => setExpandedProperty(expandedProperty === property.id ? null : property.id)}
                      >
                        <span className={`${styles.expandIcon} ${expandedProperty === property.id ? styles.expanded : ''}`}>
                          ▶
                        </span>
                        <div className={styles.propertyInfo}>
                          {editingProperty === property.id ? (
                            <div className={styles.inlineForm} onClick={(e) => e.stopPropagation()}>
                              <input
                                value={editPropertyName}
                                onChange={(e) => setEditPropertyName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleUpdateProperty(property.id);
                                }}
                              />
                              <button className={styles.btnSave} onClick={() => handleUpdateProperty(property.id)}>
                                Save
                              </button>
                              <button className={styles.btnCancel} onClick={() => setEditingProperty(null)}>
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <>
                              <span className={styles.propertyName}>{property.name}</span>
                              <span className={styles.locationCount}>{property.locations?.length || 0} locations</span>
                            </>
                          )}
                        </div>
                        {editingProperty !== property.id && (
                          <div className={styles.propertyActions} onClick={(e) => e.stopPropagation()}>
                            <button
                              className={`${styles.btnSmall} ${styles.edit}`}
                              onClick={() => {
                                setEditingProperty(property.id);
                                setEditPropertyName(property.name);
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className={`${styles.btnSmall} ${styles.delete}`}
                              onClick={() => handleDeleteProperty(property.id)}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Locations */}
                      {expandedProperty === property.id && (
                        <div className={styles.locationsContent}>
                          {/* Add Location Form */}
                          {addingLocationFor === property.id && (
                            <div className={styles.inlineForm}>
                              <input
                                placeholder="Location name"
                                value={newLocationName}
                                onChange={(e) => setNewLocationName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleCreateLocation(property.id);
                                }}
                              />
                              <button className={styles.btnSave} onClick={() => handleCreateLocation(property.id)}>
                                Add
                              </button>
                              <button className={styles.btnCancel} onClick={() => setAddingLocationFor(null)}>
                                Cancel
                              </button>
                            </div>
                          )}

                          <div className={styles.locationsList}>
                            {property.locations?.map((location) => (
                              <div key={location.id} className={styles.locationItem}>
                                {editingLocation === location.id ? (
                                  <div className={styles.inlineForm} style={{ flex: 1, margin: 0 }}>
                                    <input
                                      value={editLocationName}
                                      onChange={(e) => setEditLocationName(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleUpdateLocation(location.id);
                                      }}
                                    />
                                    <button className={styles.btnSave} onClick={() => handleUpdateLocation(location.id)}>
                                      Save
                                    </button>
                                    <button className={styles.btnCancel} onClick={() => setEditingLocation(null)}>
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <span className={styles.locationName}>{location.name}</span>
                                    <div className={styles.locationActions}>
                                      <button
                                        className={`${styles.btnSmall} ${styles.edit}`}
                                        onClick={() => {
                                          setEditingLocation(location.id);
                                          setEditLocationName(location.name);
                                        }}
                                      >
                                        Edit
                                      </button>
                                      <button
                                        className={`${styles.btnSmall} ${styles.delete}`}
                                        onClick={() => handleDeleteLocation(location.id)}
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}

                            {property.locations?.length === 0 && (
                              <div className={styles.emptyLocations}>No locations yet.</div>
                            )}
                          </div>

                          {addingLocationFor !== property.id && (
                            <button
                              className={styles.addLocationBtn}
                              onClick={() => setAddingLocationFor(property.id)}
                            >
                              + Add Location
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {pm.properties?.length === 0 && <div className={styles.emptyProperties}>No properties yet.</div>}
                </div>

                {addingPropertyFor !== pm.id && (
                  <button className={styles.addPropertyBtn} onClick={() => setAddingPropertyFor(pm.id)}>
                    + Add Property
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {filteredManagers.length === 0 && (
          <div className={styles.emptyState}>
            {searchTerm || statusFilter !== 'all'
              ? 'No property managers match your filters.'
              : 'No property managers yet. Click "+ Add Property Manager" to create one.'}
          </div>
        )}
      </div>
    </div>
    </AdminShell>
  );
}
