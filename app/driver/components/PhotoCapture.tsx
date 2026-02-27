'use client';

import { useState, useRef } from 'react';
import styles from '../driver.module.css';

interface PhotoCaptureProps {
  photos: File[];
  photoPreviews: string[];
  onPhotosChange: (photos: File[], previews: string[]) => void;
  maxPhotos?: number;
}

export function PhotoCapture({
  photos,
  photoPreviews,
  onPhotosChange,
  maxPhotos = 5,
}: PhotoCaptureProps) {
  const [converting, setConverting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function convertHeicToJpeg(file: File): Promise<File> {
    // In production, use heic2any library
    // For now, return the file as-is
    if (!file.name.toLowerCase().endsWith('.heic')) {
      return file;
    }

    try {
      // Dynamic import for client-side only
      const heic2any = (await import('heic2any')).default;
      const blob = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: 0.8,
      });
      return new File(
        [blob as Blob],
        file.name.replace(/\.heic$/i, '.jpg'),
        { type: 'image/jpeg' }
      );
    } catch (error) {
      console.error('HEIC conversion failed:', error);
      return file;
    }
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (photos.length >= maxPhotos) {
      alert(`Maximum ${maxPhotos} photos allowed`);
      return;
    }

    setConverting(true);
    try {
      // Convert HEIC if needed
      const processedFile = await convertHeicToJpeg(file);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        const newPhotos = [...photos, processedFile];
        const newPreviews = [...photoPreviews, reader.result as string];
        onPhotosChange(newPhotos, newPreviews);
      };
      reader.readAsDataURL(processedFile);
    } catch (error) {
      console.error('Photo processing failed:', error);
      alert('Failed to process photo');
    } finally {
      setConverting(false);
      // Reset the input
      e.target.value = '';
    }
  }

  function removePhoto(index: number) {
    const newPhotos = photos.filter((_, i) => i !== index);
    const newPreviews = photoPreviews.filter((_, i) => i !== index);
    onPhotosChange(newPhotos, newPreviews);
  }

  function triggerFileInput() {
    fileInputRef.current?.click();
  }

  return (
    <div className={styles.formGroup}>
      <label>Photos (optional)</label>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic"
        capture="environment"
        onChange={handlePhotoChange}
        className={styles.driverFileInput}
        disabled={converting}
        style={{ display: 'none' }}
      />

      {/* Custom upload button */}
      <div
        onClick={triggerFileInput}
        style={{
          border: '2px dashed #e0e0e0',
          borderRadius: '8px',
          padding: '24px 16px',
          textAlign: 'center',
          cursor: converting ? 'wait' : 'pointer',
          background: '#f9fafb',
        }}
      >
        {converting ? (
          <span style={{ color: '#666' }}>Processing...</span>
        ) : (
          <>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              width="32"
              height="32"
              style={{ display: 'block', margin: '0 auto 8px', color: '#9ca3af' }}
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span style={{ color: '#666', fontSize: '14px' }}>
              Tap to add photo
            </span>
          </>
        )}
      </div>

      {/* Photo previews */}
      {photoPreviews.length > 0 && (
        <div className={styles.photoPreviews}>
          {photoPreviews.map((preview, index) => (
            <div key={index} className={styles.photoPreviewItem}>
              <img
                src={preview}
                alt={`Preview ${index + 1}`}
                className={styles.photoPreview}
              />
              <button
                type="button"
                className={styles.photoRemoveBtn}
                onClick={() => removePhoto(index)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {photos.length > 0 && (
        <div className={styles.photoCount}>
          {photos.length} photo{photos.length > 1 ? 's' : ''} added
          {photos.length < maxPhotos && (
            <span style={{ color: '#9ca3af' }}> (max {maxPhotos})</span>
          )}
        </div>
      )}
    </div>
  );
}
