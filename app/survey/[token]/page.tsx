'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

export default function SurveyRedirectPage() {
  const params = useParams();
  const token = params.token as string;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function trackAndRedirect() {
      if (!token) {
        setError('Survey link not found');
        return;
      }

      try {
        // Record the survey click
        const response = await fetch('/api/survey-track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ surveyToken: token, action: 'click' }),
        });

        if (!response.ok) {
          throw new Error('Invalid survey link');
        }

        // Redirect to the actual survey
        window.location.href = 'https://raptor-vending.com/building-survey/';
      } catch (err) {
        console.error('Error recording click:', err);
        setError('Survey link not found or has expired');
      }
    }

    trackAndRedirect();
  }, [token]);

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorCard}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            width="48"
            height="48"
            style={styles.errorIcon}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <h2 style={styles.errorTitle}>Survey Not Found</h2>
          <p style={styles.errorMessage}>
            This survey link is invalid or has expired.
          </p>
          <a href="/" style={styles.homeLink}>
            Return to Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.loadingCard}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>Redirecting to survey...</p>
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
  loadingCard: {
    background: '#fff',
    borderRadius: '16px',
    padding: '48px',
    textAlign: 'center',
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
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
  loadingText: {
    fontSize: '16px',
    color: '#666',
    margin: 0,
  },
  errorCard: {
    background: '#fff',
    borderRadius: '16px',
    padding: '48px',
    textAlign: 'center',
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
    maxWidth: '400px',
  },
  errorIcon: {
    color: '#dc2626',
    marginBottom: '16px',
  },
  errorTitle: {
    fontSize: '24px',
    fontWeight: 600,
    color: '#1f2937',
    margin: '0 0 12px 0',
  },
  errorMessage: {
    fontSize: '16px',
    color: '#6b7280',
    margin: '0 0 24px 0',
  },
  homeLink: {
    display: 'inline-block',
    padding: '12px 24px',
    fontSize: '14px',
    fontWeight: 500,
    color: '#fff',
    background: '#ea580c',
    borderRadius: '8px',
    textDecoration: 'none',
  },
};
