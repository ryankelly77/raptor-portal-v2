'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import styles from './login.module.css';

type LoginMethod = 'token' | 'phone';
type PhoneStep = 'phone' | 'code';

export default function DriverLoginPage() {
  const router = useRouter();
  const [loginMethod, setLoginMethod] = useState<LoginMethod>('phone');

  // Token login state
  const [token, setToken] = useState('');

  // Phone login state
  const [phoneStep, setPhoneStep] = useState<PhoneStep>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');

  // Shared state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Token-based login
  async function handleTokenSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/driver/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken: token.trim() }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Invalid token');
      }

      // Store driver session
      sessionStorage.setItem('driverToken', result.token);
      sessionStorage.setItem('driverInfo', JSON.stringify(result.driver));

      router.push('/driver');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  }

  // Request SMS code
  async function handlePhoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;

    setLoading(true);
    setError('');
    setMessage('');

    try {
      const response = await fetch('/api/driver/request-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send code');
      }

      setMessage('If this phone is registered, a code has been sent.');
      setPhoneStep('code');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send code');
    } finally {
      setLoading(false);
    }
  }

  // Verify SMS code
  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/driver/verify-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim(), code: code.trim() }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Invalid code');
      }

      // Store driver session
      sessionStorage.setItem('driverToken', result.token);
      sessionStorage.setItem('driverInfo', JSON.stringify(result.driver));

      router.push('/driver');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  function handleBackToPhone() {
    setPhoneStep('phone');
    setCode('');
    setError('');
    setMessage('');
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
        <p className={styles.subtitle}>Sign in to continue</p>

        {/* Login method tabs */}
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${loginMethod === 'phone' ? styles.tabActive : ''}`}
            onClick={() => {
              setLoginMethod('phone');
              setError('');
              setMessage('');
            }}
          >
            Phone
          </button>
          <button
            type="button"
            className={`${styles.tab} ${loginMethod === 'token' ? styles.tabActive : ''}`}
            onClick={() => {
              setLoginMethod('token');
              setError('');
              setMessage('');
            }}
          >
            Access Token
          </button>
        </div>

        {error && <div className={styles.error}>{error}</div>}
        {message && <div className={styles.message}>{message}</div>}

        {loginMethod === 'token' ? (
          // Token login form
          <form onSubmit={handleTokenSubmit} className={styles.form}>
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

            <button
              type="submit"
              disabled={loading || !token.trim()}
              className={styles.submitBtn}
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        ) : phoneStep === 'phone' ? (
          // Phone number form
          <form onSubmit={handlePhoneSubmit} className={styles.form}>
            <div className={styles.inputGroup}>
              <label htmlFor="phone" className={styles.label}>
                Phone Number
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 555-5555"
                className={styles.input}
                autoComplete="tel"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !phone.trim()}
              className={styles.submitBtn}
            >
              {loading ? 'Sending...' : 'Send Code'}
            </button>
          </form>
        ) : (
          // Code verification form
          <form onSubmit={handleCodeSubmit} className={styles.form}>
            <div className={styles.inputGroup}>
              <label htmlFor="code" className={styles.label}>
                Enter the 6-digit code sent to your phone
              </label>
              <input
                id="code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className={`${styles.input} ${styles.codeInput}`}
                autoComplete="one-time-code"
                inputMode="numeric"
                maxLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.length !== 6}
              className={styles.submitBtn}
            >
              {loading ? 'Verifying...' : 'Verify Code'}
            </button>

            <button
              type="button"
              className={styles.backBtn}
              onClick={handleBackToPhone}
            >
              Use different phone number
            </button>
          </form>
        )}

        <div className={styles.footer}>
          <p>
            Need help? Contact{' '}
            <a href="mailto:support@raptorvending.com">support@raptorvending.com</a>
          </p>
        </div>
      </div>
    </div>
  );
}
