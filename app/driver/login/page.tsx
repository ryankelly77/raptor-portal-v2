'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import styles from './login.module.css';

export default function DriverLoginPage() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/driver/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token.trim() }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Invalid token');
      }

      // Store driver session
      sessionStorage.setItem('driverToken', result.token);
      sessionStorage.setItem('driverInfo', JSON.stringify(result.driver));

      // Navigate to main driver page
      router.push('/driver');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.loginPage}>
      <div className={styles.loginContainer}>
        <Image
          src="/logo-dark.png"
          alt="Raptor Vending"
          width={100}
          height={40}
          className={styles.logo}
          priority
        />
        <h1 className={styles.title}>Temperature Log</h1>
        <p className={styles.subtitle}>Enter your access token to continue</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.inputGroup}>
            <label htmlFor="token" className={styles.label}>
              Access Token
            </label>
            <input
              id="token"
              type="text"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Enter your driver token"
              className={styles.input}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button
            type="submit"
            disabled={loading || !token.trim()}
            className={styles.submitBtn}
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <div className={styles.footer}>
          <p>
            Need a token? Contact your supervisor or{' '}
            <a href="mailto:support@raptorvending.com">support@raptorvending.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}
