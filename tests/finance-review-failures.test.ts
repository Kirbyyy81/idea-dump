import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const reviewSource = fs.readFileSync(
    path.join(root, 'app', 'finance', 'review', 'page.tsx'),
    'utf8'
);
const failurePanel = reviewSource.slice(
    reviewSource.indexOf('!isLoading && failedIntakes.length > 0')
);

describe('Finance review failure recovery', () => {
    it('offers screenshot and manual recovery for genuine failures', () => {
        expect(failurePanel).toContain('href="/finance/add?mode=screenshot"');
        expect(failurePanel).toContain('Try another screenshot');
        expect(failurePanel).toContain('href="/finance/add?mode=manual"');
        expect(failurePanel).toContain('Add manually');
    });

    it('does not expose queue diagnostics in the failure panel', () => {
        expect(failurePanel).not.toContain('processing_attempt_count');
        expect(failurePanel).not.toContain('failure_stage');
        expect(failurePanel).not.toContain('failure_code');
    });
});
