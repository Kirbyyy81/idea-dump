import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

function env(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
    return {
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'publishable',
        SUPABASE_SECRET_KEY: 'secret',
        ALLOWED_ORIGINS: 'https://idea-dump-alpha.vercel.app',
        FINANCE_QUEUE_WAKE_SECRET: 'test-wake-secret-that-is-at-least-32-bytes',
        ...overrides,
    };
}

describe('Finance queue configuration', () => {
    it('loads private batch defaults with a visibility margin above the intake lease', () => {
        expect(loadConfig(env())).toMatchObject({
            financeShareBucket: 'finance-share-batches',
            financeShareQueue: 'finance_share_ocr',
            intakeLeaseSeconds: 300,
            financeQueueVisibilitySeconds: 420,
        });
    });

    it('rejects a short wake secret', () => {
        expect(() => loadConfig(env({ FINANCE_QUEUE_WAKE_SECRET: 'too-short' })))
            .toThrow('FINANCE_QUEUE_WAKE_SECRET must contain at least 32 bytes');
    });

    it('rejects a queue visibility window that can expire with the intake lease', () => {
        expect(() => loadConfig(env({
            INTAKE_LEASE_SECONDS: '300',
            FINANCE_QUEUE_VISIBILITY_SECONDS: '329',
        }))).toThrow(
            'FINANCE_QUEUE_VISIBILITY_SECONDS must be at least 30 seconds longer than INTAKE_LEASE_SECONDS',
        );
    });
});
