/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['pdf-parse'],
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.externals = config.externals || [];
      if (!config.externals.includes('pdf-parse')) {
        config.externals.push('pdf-parse');
      }
    }
    return config;
  },
};

export default nextConfig;
