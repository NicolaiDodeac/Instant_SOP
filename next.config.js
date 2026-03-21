/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Resolve ffmpeg binary from node_modules at runtime (bundled import breaks path).
  serverExternalPackages: ['ffmpeg-static'],
};

module.exports = nextConfig;
