/** @type {import('next').NextConfig} */
import { execFileSync } from 'node:child_process';

function tryGetGitCommitSha() {
  try {
    const git = process.platform === 'win32' ? 'C:\\Program Files\\Git\\cmd\\git.exe' : '/usr/bin/git';
    return execFileSync(git, ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
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
