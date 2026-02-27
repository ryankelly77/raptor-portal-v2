'use client';

import { useState, useEffect } from 'react';
import {
  createProject,
  createPhase,
  createTask,
  createPropertyManager,
  createProperty,
  createLocation,
} from '@/lib/api/admin';
import type { Location, Property, PropertyManager } from '@/types/database';
import styles from '../projects.module.css';

interface CreateProjectModalProps {
  locations: Location[];
  properties: Property[];
  managers: PropertyManager[];
  onClose: () => void;
  onSave: () => Promise<void>;
}

type Step = 'pm' | 'property' | 'location' | 'details';

export function CreateProjectModal({
  locations,
  properties,
  managers,
  onClose,
  onSave,
}: CreateProjectModalProps) {
  const [step, setStep] = useState<Step>('pm');
  const [saving, setSaving] = useState(false);

  // Selected IDs
  const [selectedPmId, setSelectedPmId] = useState<string | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);

  // New entity forms
  const [showNewPm, setShowNewPm] = useState(false);
  const [showNewProperty, setShowNewProperty] = useState(false);
  const [showNewLocation, setShowNewLocation] = useState(false);

  const [newPm, setNewPm] = useState({ name: '', email: '', phone: '', company: '' });
  const [newProperty, setNewProperty] = useState({ name: '', address: '', city: '', state: '', zip: '' });
  const [newLocation, setNewLocation] = useState({ name: '', floor: '' });

  // Project details
  const [projectNumber, setProjectNumber] = useState('');
  const [smartFridgeQty, setSmartFridgeQty] = useState(2);
  const [smartCookerQty, setSmartCookerQty] = useState(1);
  const [enclosureType, setEnclosureType] = useState<'wrap' | 'custom' | ''>('wrap');
  const [enclosureColor, setEnclosureColor] = useState('');

  // Generate next project number on mount
  useEffect(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const random = String(Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    setProjectNumber(`RV-${year}-${month}${random}`);
  }, []);

  // Filter properties by selected PM
  const filteredProperties = selectedPmId
    ? properties.filter((p) => p.property_manager_id === selectedPmId)
    : properties;

  // Filter locations by selected property
  const filteredLocations = selectedPropertyId
    ? locations.filter((l) => l.property_id === selectedPropertyId)
    : locations;

  function buildConfiguration() {
    const parts: string[] = [];
    if (smartFridgeQty > 0) parts.push(`(${smartFridgeQty}) SmartFridge`);
    if (smartCookerQty > 0) parts.push(`(${smartCookerQty}) SmartCooker`);
    if (enclosureType === 'custom' && enclosureColor) {
      parts.push(`Custom Architectural Enclosure (${enclosureColor})`);
    } else if (enclosureType === 'wrap') {
      parts.push('Magnetic Wrap');
    }
    return parts.join(' + ');
  }

  async function handleCreateNewPm() {
    if (!newPm.name.trim()) return;
    try {
      const created = await createPropertyManager({
        name: newPm.name,
        email: newPm.email || null,
        phone: newPm.phone || null,
        company: newPm.company || null,
        access_token: Math.random().toString(36).substring(2, 15),
        is_active: true,
        notes: null,
      });
      setSelectedPmId(created.id);
      setShowNewPm(false);
      setNewPm({ name: '', email: '', phone: '', company: '' });
    } catch (err) {
      alert('Error creating PM: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleCreateNewProperty() {
    if (!newProperty.name.trim() || !selectedPmId) return;
    try {
      const created = await createProperty({
        name: newProperty.name,
        property_manager_id: selectedPmId,
        address: newProperty.address || null,
        city: newProperty.city || null,
        state: newProperty.state || null,
        zip: newProperty.zip || null,
        notes: null,
      });
      setSelectedPropertyId(created.id);
      setShowNewProperty(false);
      setNewProperty({ name: '', address: '', city: '', state: '', zip: '' });
    } catch (err) {
      alert('Error creating property: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleCreateNewLocation() {
    if (!newLocation.name.trim() || !selectedPropertyId) return;
    try {
      const created = await createLocation({
        name: newLocation.name,
        property_id: selectedPropertyId,
        floor: newLocation.floor || null,
        notes: null,
      });
      setSelectedLocationId(created.id);
      setShowNewLocation(false);
      setNewLocation({ name: '', floor: '' });
    } catch (err) {
      alert('Error creating location: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleSave() {
    if (!selectedLocationId || !selectedPropertyId) return;
    setSaving(true);

    try {
      // Create project
      const project = await createProject({
        property_id: selectedPropertyId,
        location_id: selectedLocationId,
        name: projectNumber,
        status: 'planning',
        description: buildConfiguration(),
        target_install_date: null,
        actual_install_date: null,
        notes: null,
        property_manager_id: selectedPmId || null,
      });

      // Create template phases with tasks
      const templatePhases = [
        {
          phase_number: 1,
          title: 'Site Assessment & Planning',
          status: 'not_started' as const,
          description: 'Site survey to identify optimal placement.',
          tasks: [
            'Initial site survey and measurements',
            'Optimal placement location identified',
            'Cellular signal strength verification',
            '[ADMIN-SPEED] Speed test conducted in proposed location',
            'Space and traffic flow assessment',
            'Infrastructure specifications delivered',
          ],
        },
        {
          phase_number: 2,
          title: 'Contract Signature',
          status: 'not_started' as const,
          description: 'Service agreement reviewed and signed.',
          tasks: ['Agreement sent for review', 'Contract signed and returned'],
        },
        {
          phase_number: 3,
          title: 'Employee Preference Survey',
          status: 'not_started' as const,
          description: 'Survey distributed to building employees.',
          tasks: [
            'Survey link distributed to property management',
            '[PM-TEXT] Allow retractable banners on site',
            '[PM] Survey link distributed to tenants',
            'Snack preferences compiled',
            'Hot meal preferences compiled',
            'Custom menu recommendations finalized',
          ],
        },
        {
          phase_number: 4,
          title: 'Electrical & Networking Preparation',
          status: 'not_started' as const,
          description: 'Property responsible for infrastructure prep.',
          tasks: [
            'Electrical & networking specs provided',
            '[PM] Property obtained contractor quotes',
            '[PM-DATE] Property scheduled electrical install',
            '[PM] All electrical and networking installed',
          ],
        },
        {
          phase_number: 5,
          title: 'Building Access & Coordination',
          status: 'not_started' as const,
          description: 'Final coordination with property management.',
          tasks: [
            '[PM] Raptor Vending added to approved vendor list',
            'Certificate of Insurance submitted',
            '[ADMIN-DATE] Install date confirmed',
            'Loading dock/freight elevator access scheduled',
            'Secure storage location confirmed',
            'Electrical and networking verified',
            '[PM] Security badges provided',
            '[PM] Emergency contact list provided',
          ],
        },
        {
          phase_number: 6,
          title: 'Equipment Ordering & Delivery',
          status: 'not_started' as const,
          description: 'Equipment ordered and delivery scheduled.',
          tasks: [
            '[ADMIN-EQUIPMENT] SmartFridge and SmartCooker ordered',
            '[ADMIN-ENCLOSURE] Enclosure ordered',
            '[PM] Enclosure configuration confirmed',
            '[ADMIN-DELIVERY] Delivery scheduled',
            'All equipment delivered and prepped',
            'City Health Inspection scheduled',
            'Health inspection PASSED',
          ],
        },
        {
          phase_number: 7,
          title: 'System Installation & Integration',
          status: 'not_started' as const,
          description: 'Equipment delivery and installation.',
          tasks: [
            'Smart Fridge units positioning',
            'Smart Cooker installation',
            'Custom enclosure installation',
            'Payment system activation',
            'Cellular transaction testing',
          ],
        },
        {
          phase_number: 8,
          title: 'Testing, Stocking & Launch',
          status: 'not_started' as const,
          description: 'Full system testing and launch.',
          tasks: [
            'AI vision system calibration',
            'Payment processing verification',
            'Initial meal inventory',
            'Snack inventory based on preferences',
            'Property management dashboard access',
            'Tenant communication materials',
            'Official infrastructure launch',
          ],
        },
      ];

      // Create phases and tasks
      for (const phaseTemplate of templatePhases) {
        const { tasks, ...phaseData } = phaseTemplate;
        const phase = await createPhase({
          project_id: project.id,
          title: phaseData.title,
          phase_number: phaseData.phase_number,
          status: phaseData.status,
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

        for (let i = 0; i < tasks.length; i++) {
          await createTask({
            phase_id: phase.id,
            label: tasks[i],
            completed: false,
            sort_order: i + 1,
            scheduled_date: null,
            upload_speed: null,
            download_speed: null,
            enclosure_type: null,
            enclosure_color: null,
            custom_color_name: null,
            smartfridge_qty: null,
            smartcooker_qty: null,
            delivery_carrier: null,
            tracking_number: null,
            deliveries: null,
            document_url: null,
            pm_text_value: null,
            pm_text_response: null,
            notes: null,
          });
        }
      }

      await onSave();
    } catch (err) {
      alert('Error creating install: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setSaving(false);
    }
  }

  function canProceed() {
    switch (step) {
      case 'pm':
        return selectedPmId !== null;
      case 'property':
        return selectedPropertyId !== null;
      case 'location':
        return selectedLocationId !== null;
      case 'details':
        return projectNumber.trim() !== '';
      default:
        return false;
    }
  }

  function nextStep() {
    switch (step) {
      case 'pm':
        setStep('property');
        break;
      case 'property':
        setStep('location');
        break;
      case 'location':
        setStep('details');
        break;
      case 'details':
        handleSave();
        break;
    }
  }

  function prevStep() {
    switch (step) {
      case 'property':
        setStep('pm');
        break;
      case 'location':
        setStep('property');
        break;
      case 'details':
        setStep('location');
        break;
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        {saving && (
          <div className={styles.savingOverlay}>
            <div className={styles.spinner} />
            <p>Creating Install...</p>
            <span>Setting up phases and tasks</span>
          </div>
        )}

        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>New Install</h3>
        </div>

        {/* Steps */}
        <div className={styles.steps}>
          <div className={`${styles.step} ${step === 'pm' ? styles.active : ''} ${selectedPmId ? styles.completed : ''}`}>
            1. Property Manager
          </div>
          <div className={`${styles.step} ${step === 'property' ? styles.active : ''} ${selectedPropertyId ? styles.completed : ''}`}>
            2. Property
          </div>
          <div className={`${styles.step} ${step === 'location' ? styles.active : ''} ${selectedLocationId ? styles.completed : ''}`}>
            3. Location
          </div>
          <div className={`${styles.step} ${step === 'details' ? styles.active : ''}`}>
            4. Details
          </div>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.stepContent}>
            {/* Step 1: Property Manager */}
            {step === 'pm' && (
              <>
                <label className={styles.formLabel}>Select Property Manager</label>
                {!showNewPm && (
                  <div className={styles.optionList}>
                    {managers.map((pm) => (
                      <button
                        key={pm.id}
                        className={`${styles.optionButton} ${selectedPmId === pm.id ? styles.selected : ''}`}
                        onClick={() => setSelectedPmId(pm.id)}
                      >
                        <span>{pm.name}</span>
                        {pm.company && <span style={{ color: '#6b7280', fontSize: '12px' }}>{pm.company}</span>}
                      </button>
                    ))}
                    <button className={styles.createNewButton} onClick={() => setShowNewPm(true)}>
                      + Create New Property Manager
                    </button>
                  </div>
                )}
                {showNewPm && (
                  <div style={{ marginTop: '16px' }}>
                    <div className={styles.formGroup}>
                      <input
                        className={styles.formInput}
                        placeholder="Name *"
                        value={newPm.name}
                        onChange={(e) => setNewPm({ ...newPm, name: e.target.value })}
                      />
                    </div>
                    <div className={styles.formRow}>
                      <input
                        className={styles.formInput}
                        placeholder="Email"
                        value={newPm.email}
                        onChange={(e) => setNewPm({ ...newPm, email: e.target.value })}
                      />
                      <input
                        className={styles.formInput}
                        placeholder="Phone"
                        value={newPm.phone}
                        onChange={(e) => setNewPm({ ...newPm, phone: e.target.value })}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <input
                        className={styles.formInput}
                        placeholder="Company"
                        value={newPm.company}
                        onChange={(e) => setNewPm({ ...newPm, company: e.target.value })}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                      <button className={styles.btnPrimary} onClick={handleCreateNewPm}>
                        Create
                      </button>
                      <button className={styles.btnSecondary} onClick={() => setShowNewPm(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Step 2: Property */}
            {step === 'property' && (
              <>
                <label className={styles.formLabel}>Select Property</label>
                {!showNewProperty && (
                  <div className={styles.optionList}>
                    {filteredProperties.map((prop) => (
                      <button
                        key={prop.id}
                        className={`${styles.optionButton} ${selectedPropertyId === prop.id ? styles.selected : ''}`}
                        onClick={() => setSelectedPropertyId(prop.id)}
                      >
                        <span>{prop.name}</span>
                        {prop.city && (
                          <span style={{ color: '#6b7280', fontSize: '12px' }}>
                            {prop.city}, {prop.state}
                          </span>
                        )}
                      </button>
                    ))}
                    <button className={styles.createNewButton} onClick={() => setShowNewProperty(true)}>
                      + Create New Property
                    </button>
                  </div>
                )}
                {showNewProperty && (
                  <div style={{ marginTop: '16px' }}>
                    <div className={styles.formGroup}>
                      <input
                        className={styles.formInput}
                        placeholder="Property Name *"
                        value={newProperty.name}
                        onChange={(e) => setNewProperty({ ...newProperty, name: e.target.value })}
                      />
                    </div>
                    <div className={styles.formGroup}>
                      <input
                        className={styles.formInput}
                        placeholder="Street Address"
                        value={newProperty.address}
                        onChange={(e) => setNewProperty({ ...newProperty, address: e.target.value })}
                      />
                    </div>
                    <div className={styles.formRow}>
                      <input
                        className={styles.formInput}
                        placeholder="City"
                        value={newProperty.city}
                        onChange={(e) => setNewProperty({ ...newProperty, city: e.target.value })}
                      />
                      <input
                        className={styles.formInput}
                        placeholder="State"
                        value={newProperty.state}
                        onChange={(e) => setNewProperty({ ...newProperty, state: e.target.value })}
                        style={{ maxWidth: '80px' }}
                      />
                      <input
                        className={styles.formInput}
                        placeholder="ZIP"
                        value={newProperty.zip}
                        onChange={(e) => setNewProperty({ ...newProperty, zip: e.target.value })}
                        style={{ maxWidth: '100px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                      <button className={styles.btnPrimary} onClick={handleCreateNewProperty}>
                        Create
                      </button>
                      <button className={styles.btnSecondary} onClick={() => setShowNewProperty(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Step 3: Location */}
            {step === 'location' && (
              <>
                <label className={styles.formLabel}>Select Location</label>
                {!showNewLocation && (
                  <div className={styles.optionList}>
                    {filteredLocations.map((loc) => (
                      <button
                        key={loc.id}
                        className={`${styles.optionButton} ${selectedLocationId === loc.id ? styles.selected : ''}`}
                        onClick={() => setSelectedLocationId(loc.id)}
                      >
                        <span>{loc.name}</span>
                        {loc.floor && <span style={{ color: '#6b7280', fontSize: '12px' }}>Floor {loc.floor}</span>}
                      </button>
                    ))}
                    <button className={styles.createNewButton} onClick={() => setShowNewLocation(true)}>
                      + Create New Location
                    </button>
                  </div>
                )}
                {showNewLocation && (
                  <div style={{ marginTop: '16px' }}>
                    <div className={styles.formRow}>
                      <input
                        className={styles.formInput}
                        placeholder="Location Name *"
                        value={newLocation.name}
                        onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })}
                      />
                      <input
                        className={styles.formInput}
                        placeholder="Floor"
                        value={newLocation.floor}
                        onChange={(e) => setNewLocation({ ...newLocation, floor: e.target.value })}
                        style={{ maxWidth: '100px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                      <button className={styles.btnPrimary} onClick={handleCreateNewLocation}>
                        Create
                      </button>
                      <button className={styles.btnSecondary} onClick={() => setShowNewLocation(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Step 4: Details */}
            {step === 'details' && (
              <>
                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Project Number</label>
                  <input
                    className={styles.formInput}
                    value={projectNumber}
                    onChange={(e) => setProjectNumber(e.target.value)}
                  />
                </div>

                <div className={styles.configSection}>
                  <label className={styles.formLabel}>Configuration</label>
                  <div className={styles.configRow}>
                    <div className={styles.configItem}>
                      <select
                        value={smartFridgeQty}
                        onChange={(e) => setSmartFridgeQty(parseInt(e.target.value))}
                      >
                        {[0, 1, 2, 3, 4].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                      <span>SmartFridge</span>
                    </div>
                    <div className={styles.configItem}>
                      <select
                        value={smartCookerQty}
                        onChange={(e) => setSmartCookerQty(parseInt(e.target.value))}
                      >
                        {[0, 1, 2, 3, 4].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                      <span>SmartCooker</span>
                    </div>
                  </div>
                  <div className={styles.configRow}>
                    <div className={styles.configItem}>
                      <select
                        value={enclosureType}
                        onChange={(e) => {
                          setEnclosureType(e.target.value as 'wrap' | 'custom' | '');
                          if (e.target.value !== 'custom') setEnclosureColor('');
                        }}
                      >
                        <option value="">No Enclosure</option>
                        <option value="custom">Custom Architectural Enclosure</option>
                        <option value="wrap">Magnetic Wrap</option>
                      </select>
                    </div>
                  </div>
                  {enclosureType === 'custom' && (
                    <div className={styles.configRow}>
                      <div className={styles.configItem}>
                        <select value={enclosureColor} onChange={(e) => setEnclosureColor(e.target.value)}>
                          <option value="">Select color...</option>
                          <option value="Dove Grey">Dove Grey</option>
                          <option value="Macchiato">Macchiato</option>
                          <option value="Custom">Custom</option>
                        </select>
                      </div>
                    </div>
                  )}
                  {buildConfiguration() && (
                    <div className={styles.configPreview}>
                      <strong>Preview: </strong>
                      {buildConfiguration()}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <div className={styles.modalFooter}>
          {step !== 'pm' && (
            <button className={styles.btnSecondary} onClick={prevStep} disabled={saving}>
              Back
            </button>
          )}
          <button className={styles.btnSecondary} onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className={styles.btnPrimary} onClick={nextStep} disabled={!canProceed() || saving}>
            {step === 'details' ? (saving ? 'Creating...' : 'Create Install') : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
}
