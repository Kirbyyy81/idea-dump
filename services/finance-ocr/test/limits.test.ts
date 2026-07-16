import { describe, expect, it } from 'vitest';
import { SingleSlotCapacity } from '../src/capacity.js';
import { FixedWindowRateLimiter } from '../src/rateLimit.js';

describe('bounded in-memory admission', () => {
    it('never queues a second OCR request', () => {
        const capacity = new SingleSlotCapacity();
        const release = capacity.tryAcquire();
        expect(release).toBeTypeOf('function');
        expect(capacity.tryAcquire()).toBeNull();
        release?.();
        expect(capacity.tryAcquire()).toBeTypeOf('function');
    });

    it('returns a retry interval after the per-user limit', () => {
        const limiter = new FixedWindowRateLimiter(2, 60);
        expect(limiter.consume('user-1', 1_000).allowed).toBe(true);
        expect(limiter.consume('user-1', 1_001).allowed).toBe(true);
        expect(limiter.consume('user-1', 1_002)).toEqual({
            allowed: false,
            retryAfterSeconds: 60,
        });
    });
});
