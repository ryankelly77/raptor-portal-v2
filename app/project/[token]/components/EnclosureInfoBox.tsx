'use client';

import { useState } from 'react';
import styles from '../project.module.css';

interface EnclosureInfoBoxProps {
  enclosureLabel: string | null;
  enclosureType: string;
  isCustomColor: boolean;
}

// Info circle icon
const InfoIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

export function EnclosureInfoBox({ enclosureLabel, enclosureType, isCustomColor }: EnclosureInfoBoxProps) {
  const [showModal, setShowModal] = useState(false);

  const imageUrl =
    enclosureType === 'wrap'
      ? 'https://xfkjszbkcmuumzjbnuev.supabase.co/storage/v1/object/public/project-files/magnetic%20wrap%20example.png'
      : 'https://xfkjszbkcmuumzjbnuev.supabase.co/storage/v1/object/public/project-files/pic%20of%20custom%20enclosure.png';

  const imageAlt = enclosureType === 'wrap' ? 'Magnetic Wrap Example' : 'Custom Enclosure Example';

  return (
    <>
      <div className={`${styles.enclosureResultsBox} ${isCustomColor ? styles.enclosureResultsBoxCustom : ''}`}>
        <div className={styles.enclosureValue}>
          <span className={styles.enclosureTypeLabel}>
            This location is getting: {enclosureLabel}
            <button
              type="button"
              style={{
                background: 'none',
                border: 'none',
                color: '#1565C0',
                fontSize: '0.85em',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: 0,
                marginLeft: '10px',
              }}
              onClick={() => setShowModal(true)}
            >
              what&apos;s this?
            </button>
          </span>
        </div>
        {isCustomColor && (
          <div className={styles.enclosureWarning}>
            <InfoIcon />
            <span>Please allow additional 4-6 weeks for custom color enclosures.</span>
          </div>
        )}
      </div>
      {showModal && (
        <div className={styles.enclosureModalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.enclosureModal} onClick={(e) => e.stopPropagation()}>
            <button className={styles.enclosureModalClose} onClick={() => setShowModal(false)}>
              ×
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={imageUrl} alt={imageAlt} />
          </div>
        </div>
      )}
    </>
  );
}
