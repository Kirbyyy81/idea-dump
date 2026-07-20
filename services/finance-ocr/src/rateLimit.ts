interface RateEntry {
    count: number;
    resetAt: number;
}

export interface RateLimitResult {
    allowed: boolean;
    retryAfterSeconds: number;
}

export class FixedWindowRateLimiter {
    private readonly entries = new Map<string, RateEntry>();

    constructor(
        private readonly maxRequests: number,
        private readonly windowSeconds: number,
    ) {}

    consume(key: string, now = Date.now()): RateLimitResult {
        if (this.entries.size > 1_000) this.prune(now);
        const existing = this.entries.get(key);
        if (!existing || existing.resetAt <= now) {
            this.entries.set(key, {
                count: 1,
                resetAt: now + this.windowSeconds * 1_000,
            });
            return { allowed: true, retryAfterSeconds: 0 };
        }
        if (existing.count >= this.maxRequests) {
            return {
                allowed: false,
                retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1_000)),
            };
        }
        existing.count += 1;
        return { allowed: true, retryAfterSeconds: 0 };
    }

    private prune(now: number) {
        for (const [key, entry] of this.entries) {
            if (entry.resetAt <= now) this.entries.delete(key);
        }
    }
}
