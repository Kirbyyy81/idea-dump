import { describe, expect, it } from 'vitest';
import { inferStatus } from '@/lib/types';
import { projectFixture } from '../fixtures/payloads';

describe('project status inference', () => {
  it('prioritizes archived over deployment and development signals', () => {
    expect(inferStatus({
      ...projectFixture,
      archived: true,
      deploy_url: 'https://example.test',
      github_url: 'https://github.com/example/repo',
    })).toBe('archived');
  });

  it('infers deployed, development, and ideation states from project links', () => {
    expect(inferStatus({ ...projectFixture, deploy_url: 'https://example.test' })).toBe('deployed');
    expect(inferStatus({ ...projectFixture, github_url: 'https://github.com/example/repo' })).toBe('development');
    expect(inferStatus(projectFixture)).toBe('ideation');
  });
});
