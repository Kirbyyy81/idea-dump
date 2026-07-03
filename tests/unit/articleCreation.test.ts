import { describe, expect, it } from 'vitest';
import {
  buildImageName,
  buildTocAnchors,
  getReadingTime,
  toSlug,
} from '@/lib/articleCreation/textTransform';

describe('article creation transforms', () => {
  it('normalizes titles into stable slugs', () => {
    expect(toSlug("Ashley & Team's Launch Plan")).toBe('ashley-and-teams-launch-plan');
  });

  it('computes minimum reading time for non-empty copy', () => {
    expect(getReadingTime('one two three')).toEqual({
      wordCount: 3,
      minutes: 1,
      label: '1 min read',
    });
  });

  it('builds image names and numbered table-of-content anchors', () => {
    expect(buildImageName('Launch Plan')).toBe('taylors-article-launch-plan-meta-image-1200x630');
    expect(buildTocAnchors('Intro\nDetails & Scope')).toEqual([
      '1-intro',
      '2-details-and-scope',
    ]);
  });
});
