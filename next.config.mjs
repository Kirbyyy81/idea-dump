/** @type {import('next').NextConfig} */
import { execSync } from 'node:child_process';

function tryGetGitCommitSha() {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return undefined;
  }
}

const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION:
      process.env.npm_package_version ?? 'dev',
    NEXT_PUBLIC_VERSION_CODE:
      process.env.NEXT_PUBLIC_VERSION_CODE ??
      process.env.VERCEL_GIT_COMMIT_SHA ??
      process.env.GIT_COMMIT_SHA ??
      tryGetGitCommitSha() ??
      'dev',
    NEXT_PUBLIC_LAST_UPDATED:
      process.env.NEXT_PUBLIC_LAST_UPDATED ??
      process.env.BUILD_TIME ??
      new Date().toISOString(),
  },
};

export default nextConfig;
