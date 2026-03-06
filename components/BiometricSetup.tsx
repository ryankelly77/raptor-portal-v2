'use client';

import { useState, useEffect, useCallback } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import { adminFetch } from '@/lib/admin-fetch';

interface Credential {
  id: string;
  device_name: string;
  created_at: string;
  last_used: string | null;
}

export function BiometricSetup() {
  const [isSupported, setIsSupported] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Check if WebAuthn is supported
  useEffect(() => {
    const checkSupport = async () => {
      if (typeof window !== 'undefined' && window.PublicKeyCredential) {
        try {
          const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
          setIsSupported(available);
        } catch {
          setIsSupported(false);
        }
      }
    };
    checkSupport();
  }, []);

  // Load existing credentials
  const loadCredentials = useCallback(async () => {
    try {
      const res = await adminFetch('/api/auth/webauthn/credentials');
      if (res.ok) {
        const { data } = await res.json();
        setCredentials(data || []);
        setIsEnabled(data && data.length > 0);
      }
    } catch (err) {
      console.error('Failed to load credentials:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  const handleEnableBiometric = async () => {
    setError(null);
    setSuccess(null);
    setRegistering(true);

    try {
      // Get registration options
      const optionsRes = await adminFetch('/api/auth/webauthn/register-options', {
        method: 'POST',
      });

      if (!optionsRes.ok) {
        const err = await optionsRes.json();
        throw new Error(err.error || 'Failed to get registration options');
      }

      const options = await optionsRes.json();

      // Start registration (triggers Face ID / Touch ID enrollment)
      const regResponse = await startRegistration({ optionsJSON: options });

      // Get device name
      const deviceName = getDeviceName();

      // Verify with server
      const verifyRes = await adminFetch('/api/auth/webauthn/register-verify', {
        method: 'POST',
        body: JSON.stringify({ response: regResponse, deviceName }),
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.error || 'Verification failed');
      }

      // Save biometric preference
      const adminInfo = sessionStorage.getItem('adminInfo');
      if (adminInfo) {
        const { email } = JSON.parse(adminInfo);
        if (email) {
          localStorage.setItem('biometric_enabled', 'true');
          localStorage.setItem('biometric_email', email);
        }
      }

      setSuccess('Biometric login enabled! Next time, just tap "Sign in with Face ID".');
      setIsEnabled(true);
      loadCredentials();
    } catch (err: any) {
      console.error('Registration error:', err);
      if (err.name === 'NotAllowedError') {
        setError('Biometric setup was cancelled.');
      } else if (err.name === 'InvalidStateError') {
        setError('This device is already registered.');
      } else {
        setError(err.message || 'Failed to enable biometric login.');
      }
    } finally {
      setRegistering(false);
    }
  };

  const handleRemoveCredential = async (credentialId: string) => {
    if (!confirm('Remove this biometric device?')) return;

    try {
      const res = await adminFetch(`/api/auth/webauthn/credentials?id=${credentialId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        loadCredentials();
        // If no credentials left, remove localStorage
        if (credentials.length <= 1) {
          localStorage.removeItem('biometric_enabled');
          localStorage.removeItem('biometric_email');
        }
      }
    } catch (err) {
      console.error('Failed to remove credential:', err);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatLastUsed = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return formatDate(dateStr);
  };

  if (!isSupported) {
    return (
      <div style={{
        padding: '20px',
        background: '#f9fafb',
        borderRadius: '12px',
        color: '#6b7280',
        fontSize: '14px',
      }}>
        Biometric login is not available on this device.
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
        Loading...
      </div>
    );
  }

  return (
    <div style={{
      background: '#fff',
      borderRadius: '12px',
      padding: '24px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FF580F" strokeWidth="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#111827' }}>
          Biometric Login
        </h3>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: '8px',
          color: '#dc2626',
          fontSize: '14px',
          marginBottom: '16px',
        }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{
          padding: '12px 16px',
          background: '#f0fdf4',
          border: '1px solid #bbf7d0',
          borderRadius: '8px',
          color: '#16a34a',
          fontSize: '14px',
          marginBottom: '16px',
        }}>
          {success}
        </div>
      )}

      {credentials.length > 0 && (
        <div style={{ marginBottom: '20px' }}>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 12px' }}>
            Registered devices:
          </p>
          {credentials.map((cred) => (
            <div
              key={cred.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                background: '#f9fafb',
                borderRadius: '8px',
                marginBottom: '8px',
              }}
            >
              <div>
                <div style={{ fontSize: '14px', fontWeight: 500, color: '#111827' }}>
                  {cred.device_name || 'Unknown Device'}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  Registered {formatDate(cred.created_at)} · Last used {formatLastUsed(cred.last_used)}
                </div>
              </div>
              <button
                onClick={() => handleRemoveCredential(cred.id)}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  color: '#dc2626',
                  background: '#fff',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        onClick={handleEnableBiometric}
        disabled={registering}
        style={{
          width: '100%',
          padding: '14px 24px',
          fontSize: '14px',
          fontWeight: 600,
          color: '#fff',
          backgroundColor: '#FF580F',
          border: 'none',
          borderRadius: '8px',
          cursor: registering ? 'wait' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
        }}
      >
        {registering ? (
          'Setting up...'
        ) : isEnabled ? (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add Another Device
          </>
        ) : (
          <>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            Enable Face ID / Touch ID
          </>
        )}
      </button>

      {!isEnabled && (
        <p style={{
          fontSize: '13px',
          color: '#6b7280',
          textAlign: 'center',
          margin: '12px 0 0',
        }}>
          Sign in faster next time with Face ID or Touch ID
        </p>
      )}
    </div>
  );
}

function getDeviceName(): string {
  const ua = navigator.userAgent;

  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Macintosh/.test(ua) && 'ontouchend' in document) return "iPad";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Android/.test(ua)) return "Android Device";
  if (/Windows/.test(ua)) return "Windows PC";
  if (/Linux/.test(ua)) return "Linux Device";

  return "Unknown Device";
}
