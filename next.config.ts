import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Configure remote image patterns for Next.js Image component
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.in',
      },
    ],
  },
  // Force browsers to revalidate cached pages and assets
  async headers() {
    return [
      {
        // HTML pages
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
      {
        // Next.js static chunks - short cache to force reload
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=60, must-revalidate',
          },
        ],
      },
    ];
  },
  // Generate new build IDs to bust cache
  generateBuildId: async () => {
    return `build-${Date.now()}`;
  },
};

export default nextConfig;
