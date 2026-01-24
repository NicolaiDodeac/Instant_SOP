/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  webpack: (config, { isServer, webpack }) => {
    // Konva / react-konva sometimes tries to pull node-canvas on server.
    // We don't need it in Next.js (we render Konva only in client components).
    config.resolve.alias = {
      ...(config.resolve.alias || {}),
      canvas: false,
    };

    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^canvas$/,
      })
    );

    // IMPORTANT: do NOT alias react, react-dom, or react/jsx-runtime
    // Next.js needs to resolve these internally.

    return config;
  },
};

module.exports = nextConfig;
