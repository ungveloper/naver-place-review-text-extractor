import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,
  serverExternalPackages: ['@sparticuz/chromium', 'playwright-core'],
};

export default nextConfig;
