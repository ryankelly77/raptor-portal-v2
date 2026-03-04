'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import styles from './invite.module.css';

interface InviteInfo {
  user_type: 'admin' | 'driver';
  email: string | null;
  phone: string | null;
}

export default function InviteAcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ type: string; accessToken?: string } | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState('');

  useEffect(() => {
    async function loadInvite() {
      try {
        const res = await fetch(`/api/invites/accept?token=${resolvedParams.token}`);
        const data = await res.json();

        if (!res.ok) {
          setError(data.error || 'Invalid invite');
        } else {
          setInviteInfo(data);
          if (data.phone) {
            setPhone(data.phone);
          }
        }
      } catch {
        setError('Failed to load invite');
      } finally {
        setLoading(false);
      }
    }

    loadInvite();
  }, [resolvedParams.token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!inviteInfo) return;

    // Validation
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (inviteInfo.user_type === 'admin') {
      if (!password) {
        setError('Password is required');
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match');
        return;
      }
    }

    setSubmitting(true);

    try {
      const res = await fetch('/api/invites/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resolvedParams.token,
          name: name.trim(),
          ...(inviteInfo.user_type === 'admin' && { password }),
          ...(inviteInfo.user_type === 'driver' && phone && { phone }),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to accept invite');
      } else {
        setSuccess({
          type: data.user_type,
          accessToken: data.driver?.access_token,
        });
      }
    } catch {
      setError('Failed to accept invite');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.loading}>
            <div className={styles.spinner} />
            <p>Loading invite...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error && !inviteInfo) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <Image
            src="/logo-dark.png"
            alt="Raptor Vending"
            width={100}
            height={40}
            className={styles.logo}
            priority
          />
          <div className={styles.errorBox}>
            <h2>Invalid Invite</h2>
            <p>{error}</p>
            <p className={styles.helpText}>
              If you believe this is an error, please contact your administrator.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <Image
            src="/logo-dark.png"
            alt="Raptor Vending"
            width={100}
            height={40}
            className={styles.logo}
            priority
          />
          <div className={styles.successBox}>
            <h2>Welcome to Raptor Vending!</h2>
            <p>Your account has been created successfully.</p>

            {success.type === 'admin' ? (
              <>
                <p>You can now log in to the admin portal with your email and password.</p>
                <button
                  className={styles.primaryBtn}
                  onClick={() => router.push('/admin/login')}
                >
                  Go to Admin Login
                </button>
              </>
            ) : (
              <>
                <p>Your access token is:</p>
                <code className={styles.token}>{success.accessToken}</code>
                <p className={styles.helpText}>
                  You can also log in using your phone number via SMS code.
                </p>
                <button
                  className={styles.primaryBtn}
                  onClick={() => router.push('/driver/login')}
                >
                  Go to Driver Login
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <Image
          src="/logo-dark.png"
          alt="Raptor Vending"
          width={100}
          height={40}
          className={styles.logo}
          priority
        />

        <h1 className={styles.title}>Accept Your Invitation</h1>
        <p className={styles.subtitle}>
          {inviteInfo?.user_type === 'admin'
            ? 'Set up your admin account'
            : 'Set up your driver account'}
        </p>

        {inviteInfo?.email && (
          <p className={styles.emailNote}>
            Invitation sent to: <strong>{inviteInfo.email}</strong>
          </p>
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.formGroup}>
            <label htmlFor="name" className={styles.label}>
              Your Name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={styles.input}
              placeholder="Enter your full name"
              required
            />
          </div>

          {inviteInfo?.user_type === 'admin' && (
            <>
              <div className={styles.formGroup}>
                <label htmlFor="password" className={styles.label}>
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={styles.input}
                  placeholder="Create a password (min 8 characters)"
                  required
                  minLength={8}
                />
              </div>

              <div className={styles.formGroup}>
                <label htmlFor="confirmPassword" className={styles.label}>
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={styles.input}
                  placeholder="Confirm your password"
                  required
                />
              </div>
            </>
          )}

          {inviteInfo?.user_type === 'driver' && (
            <div className={styles.formGroup}>
              <label htmlFor="phone" className={styles.label}>
                Phone Number (optional, for SMS login)
              </label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={styles.input}
                placeholder="(555) 555-5555"
              />
            </div>
          )}

          <button
            type="submit"
            className={styles.primaryBtn}
            disabled={submitting}
          >
            {submitting ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>
      </div>
    </div>
  );
}
