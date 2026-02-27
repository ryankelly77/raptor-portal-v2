'use client';

import { useState } from 'react';
import styles from './WhatsThisLink.module.css';

interface WhatsThisLinkProps {
  text: string;
  imageUrl?: string;
}

/**
 * WhatsThisLink - An inline "What's this?" button that opens a modal with explanation
 * Used for explaining form fields or features to users
 */
export function WhatsThisLink({ text, imageUrl }: WhatsThisLinkProps) {
  const [showPopup, setShowPopup] = useState(false);

  return (
    <>
      <button
        type="button"
        className={styles.btn}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setShowPopup(true);
        }}
      >
        What&apos;s this?
      </button>
      {showPopup && (
        <div className={styles.overlay} onClick={() => setShowPopup(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button className={styles.close} onClick={() => setShowPopup(false)}>
              &times;
            </button>
            <p>{text}</p>
            {imageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imageUrl} alt="Example" className={styles.img} />
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default WhatsThisLink;
