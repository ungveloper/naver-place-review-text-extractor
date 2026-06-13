import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  devIndicators: false,

  serverExternalPackages: ['@sparticuz/chromium', 'playwright-core'],

  outputFileTracingIncludes: {
    '/api/reviews': [
      './node_modules/playwright-core/browsers.json',
      './node_modules/@sparticuz/chromium/bin/**',
    ],
  },
};

export default nextConfig;
