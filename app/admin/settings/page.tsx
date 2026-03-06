'use client';

import { AdminShell } from '../components/AdminShell';
import { BiometricSetup } from '@/components/BiometricSetup';
import { useAdminAuth } from '@/lib/contexts/AdminAuthContext';

export default function SettingsPage() {
  const { adminInfo } = useAdminAuth();

  return (
    <AdminShell title="Settings">
      <div style={{ maxWidth: '600px' }}>
        {/* Account Info */}
        <div style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: '24px',
        }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 600, color: '#111827' }}>
            Account
          </h3>
          <div style={{ fontSize: '14px', color: '#374151' }}>
            <div style={{ marginBottom: '8px' }}>
              <span style={{ color: '#6b7280' }}>Name:</span>{' '}
              <strong>{adminInfo?.name || 'Admin'}</strong>
            </div>
            <div style={{ marginBottom: '8px' }}>
              <span style={{ color: '#6b7280' }}>Email:</span>{' '}
              <strong>{adminInfo?.email || 'N/A'}</strong>
            </div>
            <div>
              <span style={{ color: '#6b7280' }}>Role:</span>{' '}
              <strong style={{ textTransform: 'capitalize' }}>
                {adminInfo?.role?.replace('_', ' ') || 'Admin'}
              </strong>
            </div>
          </div>
        </div>

        {/* Biometric Setup */}
        <BiometricSetup />

        {/* App Info */}
        <div style={{
          marginTop: '24px',
          padding: '16px',
          background: '#f9fafb',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#6b7280',
          textAlign: 'center',
        }}>
          Raptor Vending Portal · PWA Enabled
        </div>
      </div>
    </AdminShell>
  );
}
