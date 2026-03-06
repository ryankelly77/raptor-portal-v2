'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAdminAuth } from '@/lib/contexts/AdminAuthContext';
import { startAuthentication } from '@simplewebauthn/browser';
import styles from '../admin.module.css';

export default function AdminLoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEmail, setBiometricEmail] = useState<string | null>(null);
  const [biometricLoading, setBiometricLoading] = useState(false);
  const { isAuthenticated, isLoading, login, setToken } = useAdminAuth();
  const router = useRouter();

  // Check for saved biometric preference on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedEmail = localStorage.getItem('biometric_email');
      const biometricEnabled = localStorage.getItem('biometric_enabled') === 'true';

      if (savedEmail && biometricEnabled) {
        setBiometricEmail(savedEmail);
        setBiometricAvailable(true);
        setEmail(savedEmail);
      }
    }
  }, []);

  // Redirect if already authenticated
  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/admin');
    }
  }, [isAuthenticated, isLoading, router]);

  const handleBiometricLogin = useCallback(async () => {
    if (!biometricEmail) return;

    setError('');
    setBiometricLoading(true);

    try {
      // Get authentication options
      const optionsRes = await fetch('/api/auth/webauthn/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: biometricEmail }),
      });

      if (!optionsRes.ok) {
        const err = await optionsRes.json();
        throw new Error(err.error || 'Failed to get authentication options');
      }

      const options = await optionsRes.json();
      const { userId, ...authOptions } = options;

      // Start authentication (triggers Face ID / Touch ID)
      const authResponse = await startAuthentication({ optionsJSON: authOptions });

      // Verify with server
      const verifyRes = await fetch('/api/auth/webauthn/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response: authResponse, userId }),
      });

      if (!verifyRes.ok) {
        const err = await verifyRes.json();
        throw new Error(err.error || 'Verification failed');
      }

      const { token } = await verifyRes.json();

      // Set token and redirect
      setToken(token);
      router.replace('/admin');
    } catch (err: any) {
      console.error('Biometric login error:', err);

      // User cancelled or error
      if (err.name === 'NotAllowedError') {
        setError('Biometric authentication was cancelled');
      } else {
        setError(err.message || 'Biometric login failed. Try password login.');
      }
    } finally {
      setBiometricLoading(false);
    }
  }, [biometricEmail, router, setToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const result = await login(email, password);

    if (result.success) {
      router.replace('/admin');
    } else {
      setError(result.error || 'Invalid credentials');
      setIsSubmitting(false);
    }
  };

  // Show loading while checking auth
  if (isLoading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.loadingSpinner} />
      </div>
    );
  }

  // Don't render if already authenticated (will redirect)
  if (isAuthenticated) {
    return null;
  }

  return (
    <div className={styles.loginContainer}>
      <div className={styles.loginBox}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-dark.png" alt="Raptor Vending" className={styles.loginLogo} />
        <h1 className={styles.loginTitle}>Admin Portal</h1>
        <p className={styles.loginSubtitle}>
          {biometricAvailable
            ? 'Sign in with Face ID or enter your credentials'
            : 'Enter your credentials to continue'}
        </p>

        {error && <div className={styles.errorMessage}>{error}</div>}

        {/* Biometric Login Button */}
        {biometricAvailable && (
          <>
            <button
              type="button"
              onClick={handleBiometricLogin}
              disabled={biometricLoading}
              style={{
                width: '100%',
                padding: '16px 24px',
                fontSize: '16px',
                fontWeight: 600,
                color: '#fff',
                backgroundColor: '#FF580F',
                border: 'none',
                borderRadius: '12px',
                cursor: biometricLoading ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                marginBottom: '24px',
                transition: 'background-color 0.2s',
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              {biometricLoading ? 'Authenticating...' : 'Sign in with Face ID'}
            </button>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '20px',
              color: '#9ca3af',
              fontSize: '14px',
            }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#e5e7eb' }} />
              <span>or sign in with password</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#e5e7eb' }} />
            </div>
          </>
        )}

        <form onSubmit={handleSubmit} className={styles.loginForm}>
          <div className={styles.formGroup}>
            <label htmlFor="email" className={styles.formLabel}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.formInput}
              placeholder="admin@example.com"
              autoComplete="email"
              autoFocus={!biometricAvailable}
              disabled={isSubmitting}
            />
          </div>

          <div className={styles.formGroup}>
            <label htmlFor="password" className={styles.formLabel}>
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${styles.formInput} ${error ? styles.formInputError : ''}`}
              placeholder="Enter password"
              autoComplete="current-password"
              disabled={isSubmitting}
            />
          </div>

          <button type="submit" className={styles.loginButton} disabled={isSubmitting || !password || !email}>
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {biometricAvailable && (
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem('biometric_enabled');
              localStorage.removeItem('biometric_email');
              setBiometricAvailable(false);
              setBiometricEmail(null);
            }}
            style={{
              marginTop: '16px',
              padding: '8px',
              fontSize: '12px',
              color: '#9ca3af',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              width: '100%',
              textAlign: 'center',
            }}
          >
            Remove saved biometric login
          </button>
        )}
      </div>
    </div>
  );
}
