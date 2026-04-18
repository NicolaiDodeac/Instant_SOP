const path = require('path')
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // All local `next/image` src paths must match; `/**` covers `/public` assets and `/api/qr?…`.
    localPatterns: [{ pathname: '/**' }],
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com', pathname: '/**' },
      { protocol: 'https', hostname: 'lh4.googleusercontent.com', pathname: '/**' },
      { protocol: 'https', hostname: 'lh5.googleusercontent.com', pathname: '/**' },
      { protocol: 'https', hostname: 'lh6.googleusercontent.com', pathname: '/**' },
      { protocol: 'https', hostname: 'avatars.githubusercontent.com', pathname: '/**' },
      { protocol: 'https', hostname: 'secure.gravatar.com', pathname: '/**' },
      { protocol: 'https', hostname: 'www.gravatar.com', pathname: '/**' },
    ],
  },
  // When a parent folder has another lockfile, Next may trace from the wrong root; pin to this app.
  outputFileTracingRoot: path.join(__dirname),
  // Resolve ffmpeg binary from node_modules at runtime (bundled import breaks path).
  serverExternalPackages: ['ffmpeg-static'],
  // Vercel serverless traces omit the native binary unless we include it explicitly.
  outputFileTracingIncludes: {
    '/api/videos/cut': ['./node_modules/ffmpeg-static/**/*'],
    '/api/videos/speed': ['./node_modules/ffmpeg-static/**/*'],
  },
};

module.exports = withBundleAnalyzer(nextConfig);
