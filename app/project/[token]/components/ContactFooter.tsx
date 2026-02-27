'use client';

import { PhoneIcon } from '@/components/icons';
import styles from '../project.module.css';

interface ContactFooterProps {
  projectManager: {
    name: string | null;
    email: string | null;
    phone: string | null;
  };
}

export function ContactFooter({ projectManager }: ContactFooterProps) {
  const phone = projectManager.phone || '';
  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const name = projectManager.name || 'Your Project Manager';
  const email = projectManager.email || '';

  return (
    <footer className={styles.contactSection}>
      <div className={styles.contactInfo}>
        <h3>Questions about your installation?</h3>
        <p>
          Contact your project manager {name}:{' '}
          {email && <><a href={`mailto:${email}`}>{email}</a> | </>}
          {phone && <a href={`tel:${cleanPhone}`}>{phone}</a>}
        </p>
      </div>
      {cleanPhone && (
        <a href={`tel:${cleanPhone}`} className={styles.contactBtn}>
          <PhoneIcon />
          Call Now
        </a>
      )}
    </footer>
  );
}
