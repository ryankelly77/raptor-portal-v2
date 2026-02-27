'use client';

import Image from 'next/image';

interface LogoProps {
  variant?: 'light' | 'dark';
  height?: number;
  className?: string;
}

/**
 * Logo component - displays the Raptor Vending logo
 * @param variant - 'light' for dark backgrounds, 'dark' for light backgrounds
 * @param height - Height in pixels (width auto-scales)
 */
export function Logo({ variant = 'light', height = 120, className }: LogoProps) {
  const src = variant === 'light' ? '/logo-light.png' : '/logo-dark.png';

  return (
    <Image
      src={src}
      alt="Raptor Vending"
      width={height * 2.5} // Approximate aspect ratio
      height={height}
      className={className}
      style={{ height: `${height}px`, width: 'auto' }}
      priority
    />
  );
}

export default Logo;
