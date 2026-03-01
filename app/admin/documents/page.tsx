'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AdminShell } from '../components/AdminShell';
import styles from './documents.module.css';

interface GlobalDocument {
  id: string;
  key: string;
  label: string;
  url: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// Default document configurations
const DOCUMENT_CONFIGS = [
  { key: 'installation_guide', label: 'Installation Guide', description: 'Standard installation instructions' },
  { key: 'safety_guidelines', label: 'Safety Guidelines', description: 'Safety procedures and requirements' },
  { key: 'equipment_manual', label: 'Equipment Manual', description: 'Equipment operation manual' },
  { key: 'warranty_info', label: 'Warranty Information', description: 'Warranty terms and conditions' },
  { key: 'maintenance_schedule', label: 'Maintenance Schedule', description: 'Regular maintenance schedule' },
  { key: 'contact_sheet', label: 'Contact Sheet', description: 'Emergency and support contacts' },
];

// Get auth headers for API calls
function getAuthHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? sessionStorage.getItem('adminToken') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<GlobalDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ label: '', url: '', description: '' });
  const [uploading, setUploading] = useState<string | null>(null);
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  const loadDocuments = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ table: 'global_documents', action: 'read' }),
      });
      const result = await response.json();
      setDocuments(result.data || []);
    } catch (err) {
      console.error('Error loading documents:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Get document by key, or return a placeholder
  function getDocument(key: string): GlobalDocument | null {
    return documents.find((doc) => doc.key === key) || null;
  }

  async function handleCreate(key: string, label: string, description: string) {
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'global_documents',
          action: 'create',
          data: { key, label, description, url: null },
        }),
      });
      await loadDocuments();
    } catch (err) {
      alert('Error creating document: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleUpdate(id: string) {
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'global_documents',
          action: 'update',
          id,
          data: {
            label: editForm.label.trim(),
            url: editForm.url.trim() || null,
            description: editForm.description.trim() || null,
          },
        }),
      });
      setEditingId(null);
      await loadDocuments();
    } catch (err) {
      alert('Error updating document: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleRemoveUrl(id: string) {
    if (!window.confirm('Remove this document URL?')) return;
    try {
      await fetch('/api/admin/crud', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          table: 'global_documents',
          action: 'update',
          id,
          data: { url: null },
        }),
      });
      await loadDocuments();
    } catch (err) {
      alert('Error removing document: ' + (err instanceof Error ? err.message : 'Unknown'));
    }
  }

  async function handleFileUpload(docKey: string, file: File) {
    const existingDoc = getDocument(docKey);
    const config = DOCUMENT_CONFIGS.find((c) => c.key === docKey);

    if (!existingDoc && config) {
      await handleCreate(docKey, config.label, config.description);
      // Reload to get the new document
      await loadDocuments();
    }

    setUploading(docKey);

    try {
      // Upload file to storage
      const fileExt = file.name.split('.').pop();
      const fileName = `global-${docKey}-${Date.now()}.${fileExt}`;
      const filePath = `global-documents/${fileName}`;

      const formData = new FormData();
      formData.append('file', file);
      formData.append('path', filePath);
      formData.append('bucket', 'project-files');

      const token = typeof window !== 'undefined' ? sessionStorage.getItem('adminToken') : null;
      const uploadRes = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error('Upload failed');
      }

      const uploadResult = await uploadRes.json();
      const publicUrl = uploadResult.url;

      // Update the document with the new URL
      const doc = documents.find((d) => d.key === docKey) || (await loadDocuments(), documents.find((d) => d.key === docKey));
      if (doc) {
        await fetch('/api/admin/crud', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({
            table: 'global_documents',
            action: 'update',
            id: doc.id,
            data: { url: publicUrl },
          }),
        });
      }

      await loadDocuments();
    } catch (err) {
      alert('Error uploading file: ' + (err instanceof Error ? err.message : 'Unknown'));
    } finally {
      setUploading(null);
    }
  }

  function startEditing(doc: GlobalDocument) {
    setEditingId(doc.id);
    setEditForm({
      label: doc.label,
      url: doc.url || '',
      description: doc.description || '',
    });
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    alert('URL copied to clipboard!');
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
            Manage documents that are available across all projects
          </p>
      </div>

      <div className={styles.documentsGrid}>
        {DOCUMENT_CONFIGS.map((config) => {
          const doc = getDocument(config.key);
          const isEditing = doc && editingId === doc.id;
          const isUploading = uploading === config.key;

          return (
            <div key={config.key} className={styles.documentCard}>
              <div className={styles.cardHeader}>
                <div className={styles.docIcon}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </div>
                <div className={styles.cardHeaderText}>
                  <span className={styles.docKey}>{config.key}</span>
                  <h3 className={styles.docTitle}>{doc?.label || config.label}</h3>
                </div>
              </div>

              {isEditing ? (
                <div className={styles.editForm}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Label</label>
                    <input
                      className={styles.formInput}
                      value={editForm.label}
                      onChange={(e) => setEditForm({ ...editForm, label: e.target.value })}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>URL</label>
                    <input
                      className={styles.formInput}
                      value={editForm.url}
                      onChange={(e) => setEditForm({ ...editForm, url: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>Description</label>
                    <input
                      className={styles.formInput}
                      value={editForm.description}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    />
                  </div>
                  <div className={styles.formActions}>
                    <button className={styles.btnPrimary} onClick={() => handleUpdate(doc!.id)}>
                      Save
                    </button>
                    <button className={styles.btnSecondary} onClick={() => setEditingId(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.cardBody}>
                    <div className={styles.docInfo}>
                      <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Description</span>
                        <span className={`${styles.infoValue} ${!doc?.description ? styles.empty : ''}`}>
                          {doc?.description || config.description}
                        </span>
                      </div>
                      <div className={styles.infoRow}>
                        <span className={styles.infoLabel}>Status</span>
                        <span className={styles.infoValue}>
                          {doc?.url ? '✓ Document uploaded' : 'No document'}
                        </span>
                      </div>
                    </div>

                    {doc?.url && (
                      <div className={styles.docUrl}>
                        <a href={doc.url} target="_blank" rel="noopener noreferrer">
                          {doc.url}
                        </a>
                        <button className={styles.btnCopy} onClick={() => copyUrl(doc.url!)}>
                          Copy
                        </button>
                      </div>
                    )}
                  </div>

                  {!doc?.url && (
                    <div className={styles.uploadSection}>
                      <span className={styles.uploadLabel}>Upload Document</span>
                      <input
                        type="file"
                        ref={(el) => { fileInputRefs.current[config.key] = el; }}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(config.key, file);
                        }}
                        accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                        style={{ display: 'none' }}
                      />
                      <div
                        className={styles.uploadZone}
                        onClick={() => fileInputRefs.current[config.key]?.click()}
                      >
                        <div className={styles.uploadIcon}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="17 8 12 3 7 8" />
                            <line x1="12" y1="3" x2="12" y2="15" />
                          </svg>
                        </div>
                        <p className={styles.uploadText}>
                          {isUploading ? 'Uploading...' : 'Click to upload or drag and drop'}
                        </p>
                        <p className={styles.uploadHint}>PDF, DOC, DOCX, PNG, JPG</p>
                      </div>
                    </div>
                  )}

                  <div className={styles.cardFooter}>
                    {doc ? (
                      <>
                        <button className={styles.btnSecondary} onClick={() => startEditing(doc)}>
                          Edit
                        </button>
                        {doc.url && (
                          <>
                            <button
                              className={styles.btnPrimary}
                              onClick={() => fileInputRefs.current[config.key]?.click()}
                              disabled={isUploading}
                            >
                              {isUploading ? 'Uploading...' : 'Replace'}
                            </button>
                            <button className={styles.btnDanger} onClick={() => handleRemoveUrl(doc.id)}>
                              Remove
                            </button>
                          </>
                        )}
                      </>
                    ) : (
                      <button
                        className={styles.btnPrimary}
                        onClick={() => handleCreate(config.key, config.label, config.description)}
                      >
                        Initialize
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
    </AdminShell>
  );
}
