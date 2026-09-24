import { describe, expect, it } from 'vitest';
import { getSafeNextPath } from '@/lib/auth/routes';
describe('safe authentication continuation', () => {
    it('preserves an internal pairing path', () => {
        expect(getSafeNextPath('/companion/pair?code=ABCD1234')).toBe('/companion/pair?code=ABCD1234');
    });
    it.each(['https://evil.test', '//evil.test', '/\\evil.test', '/\nevil.test', null])('rejects external or ambiguous target %s', value => {
        expect(getSafeNextPath(value)).toBe('/');
    });
});
