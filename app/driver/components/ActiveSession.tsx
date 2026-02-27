'use client';

import styles from '../driver.module.css';

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

interface ActiveSessionProps {
  session: TempLogSession;
  onDeleteEntry: (entryId: string) => void;
  onAddEntry: (type: 'pickup' | 'delivery') => void;
  onComplete: () => void;
}

export function ActiveSession({ session, onDeleteEntry, onAddEntry, onComplete }: ActiveSessionProps) {
  function formatTime(dateStr: string) {
    return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function getTemperatureClass(temp: number) {
    if (temp <= 41) return styles.tempOk;
    if (temp <= 45) return styles.tempWarning;
    return styles.tempDanger;
  }

  const hasPickup = session.entries?.some((e) => e.entry_type === 'pickup');

  return (
    <div className={styles.driverSession}>
      <div className={styles.driverSessionHeader}>
        <h2>Active Session</h2>
        <span className={styles.driverSessionDate}>
          {new Date(session.created_at).toLocaleDateString()}
        </span>
      </div>

      {/* Vehicle type badge */}
      <div style={{ marginBottom: '16px', fontSize: '14px', color: '#666' }}>
        Vehicle: {session.vehicle_type}
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
                  <button onClick={() => onDeleteEntry(entry.id)} className={styles.entryDeleteBtn}>
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Action buttons */}
      <div className={styles.driverActions}>
        {!hasPickup ? (
          <button
            onClick={() => onAddEntry('pickup')}
            className={`${styles.driverBtn} ${styles.driverBtnPrimary}`}
          >
            Log Pickup Temperature
          </button>
        ) : (
          <button
            onClick={() => onAddEntry('delivery')}
            className={`${styles.driverBtn} ${styles.driverBtnPrimary}`}
          >
            Log Delivery Stop
          </button>
        )}
        <button onClick={onComplete} className={`${styles.driverBtn} ${styles.driverBtnSecondary}`}>
          Complete Session
        </button>
      </div>
    </div>
  );
}
