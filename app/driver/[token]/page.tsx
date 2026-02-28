'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function DriverTokenPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function authenticateWithToken() {
      if (!token) {
        setError('Invalid driver link');
        return;
      }

      try {
        // Authenticate with the token
        const response = await fetch('/api/driver/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });

        const result = await response.json();

        if (!response.ok || !result.driver) {
          setError('Invalid or expired driver link');
          return;
        }

        // Store driver session
        sessionStorage.setItem('driverToken', token);
        sessionStorage.setItem('driverInfo', JSON.stringify(result.driver));

        // Redirect to main driver page
        router.replace('/driver');
      } catch (err) {
        console.error('Authentication error:', err);
        setError('Failed to authenticate. Please try again.');
      }
    }

    authenticateWithToken();
  }, [token, router]);

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="#dc2626"
            strokeWidth="2"
            width="48"
            height="48"
            style={{ marginBottom: '16px' }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <h2 style={styles.title}>Access Error</h2>
          <p style={styles.message}>{error}</p>
          <a href="/driver/login" style={styles.link}>
            Go to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.spinner} />
        <p style={styles.message}>Authenticating...</p>
      </div>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#f5f5f5',
    padding: '24px',
  },
  card: {
    background: '#fff',
    borderRadius: '16px',
    padding: '48px',
    textAlign: 'center',
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
    maxWidth: '400px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#1f2937',
    margin: '0 0 12px 0',
  },
  message: {
    fontSize: '16px',
    color: '#6b7280',
    margin: '0 0 24px 0',
  },
  link: {
    display: 'inline-block',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#fff',
    background: '#ea580c',
    borderRadius: '8px',
    textDecoration: 'none',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #e5e7eb',
    borderTopColor: '#ea580c',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    margin: '0 auto 24px',
  },
};
