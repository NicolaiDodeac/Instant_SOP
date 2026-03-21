const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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

module.exports = nextConfig;
