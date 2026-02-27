'use client';

import { useState } from 'react';
import styles from '../project.module.css';

interface SendToPhoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
}

// Phone icon
const PhoneModalIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="32" height="32">
    <path d="M12 18h.01M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/>
  </svg>
);

export function SendToPhoneModal({ isOpen, onClose, url }: SendToPhoneModalProps) {
  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatPhone(e.target.value);
    setPhone(formatted);
    setError('');
    setSent(false);
  };

  const handleSendSMS = async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }

    setSending(true);
    setError('');

    try {
      const response = await fetch('/api/request-project-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: digits, projectUrl: url }),
      });

      const result = await response.json();

      if (response.ok) {
        setSent(true);
        setPhone('');
      } else {
        setError(result.error || 'Failed to send SMS');
      }
    } catch {
      setError('Failed to send SMS');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.sendPhoneOverlay} onClick={onClose}>
      <div className={styles.sendPhoneModal} onClick={(e) => e.stopPropagation()}>
        <button className={styles.sendPhoneClose} onClick={onClose}>
          ×
        </button>
        <div className={styles.sendPhoneIcon}>
          <PhoneModalIcon />
        </div>
        <h3>View on Your Phone</h3>

        <div className={styles.sendPhoneSms}>
          <p>Enter your phone number to receive a link:</p>
          <div className={styles.sendPhoneInputRow}>
            <input
              type="tel"
              placeholder="(555) 555-5555"
              value={phone}
              onChange={handlePhoneChange}
              maxLength={14}
            />
            <button onClick={handleSendSMS} disabled={sending || phone.replace(/\D/g, '').length !== 10}>
              {sending ? 'Sending...' : 'Send'}
            </button>
          </div>
          {error && <div className={styles.sendPhoneError}>{error}</div>}
          {sent && <div className={styles.sendPhoneSuccess}>Link sent!</div>}
        </div>

        <div className={styles.sendPhoneDivider}>
          <span>or scan QR code</span>
        </div>

        <div className={styles.sendPhoneQr}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrCodeUrl} alt="QR Code" />
        </div>
        <div className={styles.sendPhoneUrl}>{url}</div>
      </div>
    </div>
  );
}
