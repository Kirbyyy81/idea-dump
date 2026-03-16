/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION:
      process.env.NEXT_PUBLIC_APP_VERSION ?? process.env.npm_package_version ?? 'dev',
    NEXT_PUBLIC_VERSION_CODE:
      process.env.NEXT_PUBLIC_VERSION_CODE ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.GIT_COMMIT_SHA ??
      'dev',
    NEXT_PUBLIC_LAST_UPDATED: process.env.NEXT_PUBLIC_LAST_UPDATED ?? new Date().toISOString(),
  },
};

export default nextConfig;
