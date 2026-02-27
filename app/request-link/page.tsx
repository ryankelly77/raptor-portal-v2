'use client';

import { useState } from 'react';
import Image from 'next/image';

export default function RequestLinkPage() {
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Validate - need either email or phone
    if (!email.trim() && !phone.trim()) {
      setError('Please enter your email or phone number');
      return;
    }

    // Validate phone format if provided
    if (phone.trim()) {
      const digits = phone.replace(/\D/g, '');
      if (digits.length !== 10) {
        setError('Please enter a valid 10-digit phone number');
        return;
      }
    }

    // Validate email format if provided
    if (email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setError('Please enter a valid email address');
        return;
      }
    }

    setLoading(true);

    try {
      const response = await fetch('/api/request-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim() || null,
          phone: phone.trim() ? phone.replace(/\D/g, '') : null,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to send link');
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={styles.successIcon}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              width="48"
              height="48"
            >
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <h2 style={styles.title}>Check Your Inbox</h2>
          <p style={styles.text}>
            If we found a matching project, we&apos;ve sent your portal link to the contact information provided.
          </p>
          <p style={styles.subtext}>
            Didn&apos;t receive it? Check your spam folder or contact your Raptor Vending project manager.
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
      <div style={styles.card}>
        <Image
          src="/logo-dark.png"
          alt="Raptor Vending"
          width={100}
          height={40}
          style={styles.logo}
        />
        <h1 style={styles.title}>Request Portal Link</h1>
        <p style={styles.text}>
          Enter the email or phone number associated with your project to receive your portal access link.
        </p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputGroup}>
            <label htmlFor="email" style={styles.label}>
              Email Address
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="pm@property.com"
              style={styles.input}
              autoComplete="email"
            />
          </div>

          <div style={styles.divider}>
            <span style={styles.dividerText}>or</span>
          </div>

          <div style={styles.inputGroup}>
            <label htmlFor="phone" style={styles.label}>
              Phone Number
            </label>
            <input
              id="phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 123-4567"
              style={styles.input}
              autoComplete="tel"
            />
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.submitBtn,
              ...(loading ? styles.submitBtnDisabled : {}),
            }}
          >
            {loading ? 'Sending...' : 'Send My Link'}
          </button>
        </form>

        <p style={styles.footer}>
          Need help?{' '}
          <a href="mailto:support@raptorvending.com" style={styles.link}>
            Contact Support
          </a>
        </p>
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
    background: 'linear-gradient(135deg, #f5f5f5 0%, #e5e7eb 100%)',
    padding: '24px',
  },
  card: {
    background: '#fff',
    borderRadius: '16px',
    padding: '40px 32px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.08)',
    width: '100%',
    maxWidth: '400px',
    textAlign: 'center',
  },
  logo: {
    marginBottom: '24px',
  },
  title: {
    fontSize: '24px',
    fontWeight: 700,
    color: '#1f2937',
    margin: '0 0 12px 0',
  },
  text: {
    fontSize: '14px',
    color: '#6b7280',
    margin: '0 0 24px 0',
    lineHeight: 1.5,
  },
  subtext: {
    fontSize: '13px',
    color: '#9ca3af',
    margin: '0 0 24px 0',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  inputGroup: {
    textAlign: 'left',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    fontSize: '16px',
    border: '2px solid #e5e7eb',
    borderRadius: '8px',
    boxSizing: 'border-box',
  },
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  dividerText: {
    flex: 1,
    textAlign: 'center',
    color: '#9ca3af',
    fontSize: '13px',
    position: 'relative',
  },
  error: {
    background: '#fef2f2',
    color: '#dc2626',
    padding: '12px',
    borderRadius: '8px',
    fontSize: '14px',
    textAlign: 'left',
  },
  submitBtn: {
    width: '100%',
    padding: '14px 24px',
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
    background: '#ea580c',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    marginTop: '8px',
  },
  submitBtnDisabled: {
    background: '#fdba74',
    cursor: 'not-allowed',
  },
  footer: {
    marginTop: '24px',
    fontSize: '13px',
    color: '#9ca3af',
  },
  link: {
    color: '#ea580c',
    textDecoration: 'none',
  },
  successIcon: {
    color: '#22c55e',
    marginBottom: '16px',
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
