/** @type {import('next').NextConfig} */
// build: 2026-05-08
const nextConfig = {
  // Standalone output for Docker deployment
  output: 'standalone',

  // Enable gzip/brotli compression
  compress: true,

  // Reduce dev-mode RAM by not opening browser & limiting source maps
  reactStrictMode: true,

  // Tree-shake large libraries to import only what's used
  experimental: {
    optimizePackageImports: ['recharts', '@zxing/library', 'jspdf'],
  },

  // Disable image optimization (no external images used, saves ~50MB RAM in dev)
  images: {
    unoptimized: true,
  },

  // Security headers
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=(self)' },
        ],
      },
    ];
  },
}

module.exports = nextConfig