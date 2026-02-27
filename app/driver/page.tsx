'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import styles from './driver.module.css';

interface Driver {
  id: string;
  name: string;
  email?: string;
}

interface TempLogEntry {
  id: string;
  session_id: string;
  entry_type: 'pickup' | 'delivery';
  temperature: number;
  location_name: string | null;
  notes: string | null;
  photo_url: string | null;
  stop_number: number | null;
  timestamp: string;
}

interface TempLogSession {
  id: string;
  driver_id: string;
  vehicle_type: string;
  status: 'active' | 'completed';
  created_at: string;
  completed_at: string | null;
  entries: TempLogEntry[];
}

interface Property {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
}

const VEHICLE_OPTIONS = [
  'Personal vehicle w/ electric coolers',
  'Refrigerated trailer',
  'Refrigerated van',
];

// Get auth headers for API calls
function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('driverToken') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

// API helper for temp log operations
async function tempLogApi(action: string, data?: Record<string, unknown>, id?: string) {
  const response = await fetch('/api/driver/temp-log', {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ action, data, id }),
  });

  if (response.status === 401) {
    throw new Error('SESSION_EXPIRED');
  }

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.error || 'API request failed');
  }

  return result;
}

export default function DriverPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [session, setSession] = useState<TempLogSession | null>(null);
  const [completedSession, setCompletedSession] = useState<TempLogSession | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState(VEHICLE_OPTIONS[0]);
  const [properties, setProperties] = useState<Property[]>([]);

  // Entry form state
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [entryType, setEntryType] = useState<'pickup' | 'delivery'>('pickup');
  const [temperature, setTemperature] = useState(35);
  const [locationName, setLocationName] = useState('');
  const [notes, setNotes] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  // Load driver session
  const loadDriver = useCallback(() => {
    const driverInfo = sessionStorage.getItem('driverInfo');
    if (driverInfo) {
      setDriver(JSON.parse(driverInfo));
      return true;
    }
    return false;
  }, []);

  // Load properties for location dropdown
  const loadProperties = useCallback(async () => {
    try {
      // Use admin CRUD API to get properties
      const response = await fetch('/api/admin/crud', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'properties', action: 'read' }),
      });
      const result = await response.json();
      setProperties(result.data || []);
    } catch (err) {
      console.error('Error loading properties:', err);
    }
  }, []);

  // Load active session
  const loadSession = useCallback(async () => {
    try {
      const result = await tempLogApi('getActiveSession');
      if (result.session) {
        setSession(result.session);
      }
    } catch (err) {
      if (err instanceof Error && err.message === 'SESSION_EXPIRED') {
        sessionStorage.removeItem('driverToken');
        sessionStorage.removeItem('driverInfo');
        router.push('/driver/login');
        return;
      }
      console.error('Error loading session:', err);
    }
  }, [router]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const hasDriver = loadDriver();
      if (!hasDriver) {
        router.push('/driver/login');
        return;
      }
      await Promise.all([loadSession(), loadProperties()]);
      setLoading(false);
    }
    init();
  }, [loadDriver, loadSession, loadProperties, router]);

  // Logout
  function handleLogout() {
    sessionStorage.removeItem('driverToken');
    sessionStorage.removeItem('driverInfo');
    router.push('/driver/login');
  }

  // Start new session
  async function handleStartSession() {
    try {
      setLoading(true);
      const result = await tempLogApi('createSession', { notes: selectedVehicle });
      setSession({ ...result.session, entries: [] });
      setShowAddEntry(true);
      setEntryType('pickup');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start session');
    } finally {
      setLoading(false);
    }
  }

  // Complete session
  async function handleCompleteSession() {
    if (!session) return;
    if (!window.confirm('Complete this delivery run? You will not be able to add more entries.')) {
      return;
    }

    try {
      setLoading(true);
      await tempLogApi('completeSession', undefined, session.id);
      setCompletedSession(session);
      setSession(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete session');
    } finally {
      setLoading(false);
    }
  }

  // Add entry
  async function handleAddEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;

    const temp = parseFloat(String(temperature));
    if (isNaN(temp) || temp < -40 || temp > 200) {
      alert('Please enter a valid temperature');
      return;
    }

    let photoUrl: string | null = null;

    // Upload photos if present
    if (photos.length > 0) {
      setUploading(true);
      try {
        const photoUrls: string[] = [];
        for (let i = 0; i < photos.length; i++) {
          const fileExt = photos[i].name.split('.').pop();
          const fileName = `temp-log-${session.id}-${Date.now()}-${i}.${fileExt}`;
          const filePath = `temp-logs/${fileName}`;

          const formData = new FormData();
          formData.append('file', photos[i]);
          formData.append('path', filePath);
          formData.append('bucket', 'project-files');

          const driverToken = sessionStorage.getItem('driverToken');
          const uploadRes = await fetch('/api/admin/upload', {
            method: 'POST',
            headers: driverToken ? { Authorization: `Bearer ${driverToken}` } : {},
            body: formData,
          });

          if (!uploadRes.ok) {
            throw new Error('Upload failed');
          }

          const uploadResult = await uploadRes.json();
          photoUrls.push(uploadResult.url);
        }
        photoUrl = photoUrls.join(' | ');
      } catch (err) {
        console.error('Photo upload failed:', err);
        alert('Photo upload failed. Entry will be saved without photos.');
      }
      setUploading(false);
    }

    try {
      setLoading(true);
      const result = await tempLogApi('addEntry', {
        sessionId: session.id,
        entryType,
        temperature: temp,
        locationName: locationName.trim() || null,
        notes: notes.trim() || null,
        photoUrl,
      });

      setSession((prev) => prev ? {
        ...prev,
        entries: [...(prev.entries || []), result.entry],
      } : null);

      // Reset form
      setShowAddEntry(false);
      setTemperature(35);
      setLocationName('');
      setNotes('');
      setPhotos([]);
      setPhotoPreviews([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add entry');
    } finally {
      setLoading(false);
    }
  }

  // Delete entry
  async function handleDeleteEntry(entryId: string) {
    if (!window.confirm('Delete this entry?')) return;

    try {
      await tempLogApi('deleteEntry', { entryId });
      setSession((prev) => prev ? {
        ...prev,
        entries: prev.entries.filter((e) => e.id !== entryId),
      } : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete entry');
    }
  }

  // Temperature adjustment
  function adjustTemp(amount: number) {
    setTemperature((prev) => Math.max(-40, Math.min(200, prev + amount)));
  }

  // Photo handling
  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check for HEIC and convert if needed (simplified - in production use heic2any)
    let processedFile = file;
    if (file.name.toLowerCase().endsWith('.heic')) {
      // In production, use heic2any library here
      console.log('HEIC file detected - would convert to JPEG');
    }

    setPhotos((prev) => [...prev, processedFile]);

    // Create preview
    const reader = new FileReader();
    reader.onloadend = () => setPhotoPreviews((prev) => [...prev, reader.result as string]);
    reader.readAsDataURL(processedFile);

    e.target.value = '';
  }

  function removePhoto(index: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
    setPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  // Formatting helpers
  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function getTemperatureClass(temp: number) {
    if (temp <= 41) return styles.tempOk;
    if (temp <= 45) return styles.tempWarning;
    return styles.tempDanger;
  }

  function calculateSessionStats(sess: TempLogSession) {
    const entries = sess.entries || [];
    const stops = entries.length;
    if (entries.length <= 1) return { stops, duration: null };

    const times = entries.map((e) => new Date(e.timestamp).getTime());
    const firstTime = Math.min(...times);
    const lastTime = Math.max(...times);
    const diffMs = lastTime - firstTime;
    const diffMins = Math.round(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    return {
      stops,
      duration: hours > 0 ? `${hours}h ${mins}m` : `${mins}m`,
    };
  }

  // Loading state
  if (loading && !driver) {
    return (
      <div className={styles.driverContainer}>
        <div className={styles.driverLoading}>Loading...</div>
      </div>
    );
  }

  // Main render
  return (
    <div className={styles.driverContainer}>
      {/* Header */}
      <header className={styles.driverHeader}>
        <div className={styles.driverHeaderLeft}>
          <Image src="/logo-dark.png" alt="Raptor Vending" width={32} height={32} className={styles.driverLogoSmall} />
          <span className={styles.driverName}>{driver?.name}</span>
        </div>
        <button onClick={handleLogout} className={styles.driverLogoutBtn}>
          Logout
        </button>
      </header>

      {/* Error */}
      {error && <div className={styles.driverError}>{error}</div>}

      {/* Main Content */}
      <main className={styles.driverMain}>
        {completedSession ? (
          // Session completed
          <div className={styles.driverCompleted}>
            <div className={styles.driverBranding}>
              <Image src="/logo-dark.png" alt="Raptor Vending" width={160} height={64} />
              <h1>Session complete, {driver?.name?.split(' ')[0] || 'Driver'}!</h1>
            </div>
            <div className={styles.completedSummary}>
              <div className={styles.completedStat}>
                <span className={styles.statValue}>{calculateSessionStats(completedSession).stops}</span>
                <span className={styles.statLabel}>Stops Logged</span>
              </div>
              {calculateSessionStats(completedSession).duration && (
                <div className={styles.completedStat}>
                  <span className={styles.statValue}>{calculateSessionStats(completedSession).duration}</span>
                  <span className={styles.statLabel}>Total Time</span>
                </div>
              )}
            </div>
            <p className={styles.completedMessage}>Great job! Your temperature log has been saved.</p>
            <button onClick={() => setCompletedSession(null)} className={`${styles.driverBtn} ${styles.driverBtnPrimary} ${styles.driverBtnLarge}`}>
              Start New Session
            </button>
            <button onClick={() => setCompletedSession(null)} className={`${styles.driverBtn} ${styles.driverBtnSecondary}`} style={{ marginTop: '12px' }}>
              Back to Home
            </button>
          </div>
        ) : !session ? (
          // No active session
          <div className={styles.driverNoSession}>
            <div className={styles.driverBranding}>
              <Image src="/logo-dark.png" alt="Raptor Vending" width={160} height={64} />
              <h1>Temperature Log</h1>
            </div>
            <h2>No Active Session</h2>
            <p>Start a new delivery run to begin logging temperatures.</p>
            <div className={styles.vehicleSelectGroup}>
              <label>Vehicle</label>
              <select
                value={selectedVehicle}
                onChange={(e) => setSelectedVehicle(e.target.value)}
                className={styles.driverSelect}
              >
                {VEHICLE_OPTIONS.map((vehicle) => (
                  <option key={vehicle} value={vehicle}>{vehicle}</option>
                ))}
              </select>
            </div>
            <button onClick={handleStartSession} className={`${styles.driverBtn} ${styles.driverBtnPrimary} ${styles.driverBtnLarge}`}>
              Start New Session
            </button>
          </div>
        ) : (
          // Active session
          <div className={styles.driverSession}>
            <div className={styles.driverSessionHeader}>
              <h2>Active Session</h2>
              <span className={styles.driverSessionDate}>
                {new Date(session.created_at).toLocaleDateString()}
              </span>
            </div>

            {/* Entry timeline */}
            <div className={styles.driverEntries}>
              {(!session.entries || session.entries.length === 0) ? (
                <div className={styles.driverNoEntries}>
                  <p>No entries yet. Start by logging the pickup temperature.</p>
                </div>
              ) : (
                session.entries.map((entry) => {
                  const isPickup = entry.entry_type === 'pickup';
                  const [locName, locAddress] = (entry.location_name || '').split(' | ');

                  return (
                    <div key={entry.id} className={`${styles.driverEntryCard} ${isPickup ? styles.entryPickup : styles.entryDelivery}`}>
                      <div className={styles.entryHeader}>
                        <span className={styles.entryType}>
                          {isPickup ? 'Pickup' : `Delivery #${entry.stop_number}`}
                        </span>
                        <span className={styles.entryTime}>{formatTime(entry.timestamp)}</span>
                      </div>
                      <div className={styles.entryBody}>
                        <div className={`${styles.entryTemp} ${getTemperatureClass(entry.temperature)}`}>
                          {entry.temperature}°F
                        </div>
                        {locName && (
                          <div className={styles.entryLocation}>
                            <div className={styles.entryLocationName}>{locName}</div>
                            {locAddress && <div className={styles.entryLocationAddress}>{locAddress}</div>}
                          </div>
                        )}
                        {entry.notes && <div className={styles.entryNotes}>{entry.notes}</div>}
                        {entry.photo_url && (
                          <div className={styles.entryPhotos}>
                            {entry.photo_url.split(' | ').map((url, idx) => (
                              <img key={idx} src={url} alt={`Entry photo ${idx + 1}`} className={styles.entryPhoto} />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className={styles.entryFooter}>
                        <button onClick={() => handleDeleteEntry(entry.id)} className={styles.entryDeleteBtn}>
                          Delete
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Add entry form */}
            {showAddEntry ? (
              <form onSubmit={handleAddEntry} className={styles.driverEntryForm}>
                <h3>{entryType === 'pickup' ? 'Log Pickup' : 'Log Delivery'}</h3>

                <div className={styles.formGroup}>
                  <label>Temperature (°F)</label>
                  <div className={styles.tempControl}>
                    <button type="button" className={`${styles.tempBtn} ${styles.tempMinus}`} onClick={() => adjustTemp(-1)}>−</button>
                    <input
                      type="number"
                      value={temperature}
                      onChange={(e) => setTemperature(parseFloat(e.target.value) || 0)}
                      step="1"
                      inputMode="numeric"
                      className={`${styles.driverInput} ${styles.driverInputTemp}`}
                    />
                    <button type="button" className={`${styles.tempBtn} ${styles.tempPlus}`} onClick={() => adjustTemp(1)}>+</button>
                  </div>
                  {temperature > 41 && (
                    <div className={styles.formWarning}>Temperature above 41°F</div>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label>{entryType === 'pickup' ? 'Pickup Location' : 'Delivery Location'}</label>
                  {entryType === 'pickup' ? (
                    <input
                      type="text"
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      className={styles.driverInput}
                      placeholder="Kitchen, 2020 Broadway"
                    />
                  ) : (
                    <select
                      value={locationName}
                      onChange={(e) => setLocationName(e.target.value)}
                      className={styles.driverSelect}
                    >
                      <option value="">Select property...</option>
                      {properties.map((prop) => {
                        const addr = [prop.address, prop.city, prop.state].filter(Boolean).join(', ');
                        const fullValue = addr ? `${prop.name} | ${addr}` : prop.name;
                        return (
                          <option key={prop.id} value={fullValue}>{prop.name}</option>
                        );
                      })}
                    </select>
                  )}
                </div>

                <div className={styles.formGroup}>
                  <label>Notes (optional)</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Any additional notes..."
                    className={styles.driverTextarea}
                    rows={2}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label>Photos (optional)</label>
                  <input
                    type="file"
                    accept="image/*,.heic"
                    capture="environment"
                    onChange={handlePhotoChange}
                    className={styles.driverFileInput}
                  />
                  {photoPreviews.length > 0 && (
                    <div className={styles.photoPreviews}>
                      {photoPreviews.map((preview, index) => (
                        <div key={index} className={styles.photoPreviewItem}>
                          <img src={preview} alt={`Preview ${index + 1}`} className={styles.photoPreview} />
                          <button type="button" className={styles.photoRemoveBtn} onClick={() => removePhoto(index)}>
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {photos.length > 0 && (
                    <div className={styles.photoCount}>{photos.length} photo{photos.length > 1 ? 's' : ''} added</div>
                  )}
                </div>

                <div className={styles.formActions}>
                  <button type="button" onClick={() => setShowAddEntry(false)} className={`${styles.driverBtn} ${styles.driverBtnCancel}`}>
                    Cancel
                  </button>
                  <button type="submit" disabled={uploading} className={`${styles.driverBtn} ${styles.driverBtnPrimary}`}>
                    {uploading ? 'Uploading...' : 'Save Entry'}
                  </button>
                </div>
              </form>
            ) : (
              <div className={styles.driverActions}>
                {!session.entries?.some((e) => e.entry_type === 'pickup') ? (
                  <button
                    onClick={() => { setEntryType('pickup'); setShowAddEntry(true); setLocationName('Kitchen, 2020 Broadway'); }}
                    className={`${styles.driverBtn} ${styles.driverBtnPrimary}`}
                  >
                    Log Pickup Temperature
                  </button>
                ) : (
                  <button
                    onClick={() => { setEntryType('delivery'); setShowAddEntry(true); setLocationName(''); }}
                    className={`${styles.driverBtn} ${styles.driverBtnPrimary}`}
                  >
                    Log Delivery Stop
                  </button>
                )}
                <button onClick={handleCompleteSession} className={`${styles.driverBtn} ${styles.driverBtnSecondary}`}>
                  Complete Session
                </button>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
