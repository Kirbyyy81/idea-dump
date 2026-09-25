import { describe, expect, it } from 'vitest';
import { COMPANION_CODE, COMPANION_PROOF, COMPANION_TOKEN, matches, pairingLabel } from '@/lib/companion/core/validation';
import { readCompanionJson } from '@/lib/companion/core/http';

describe('companion transport boundary', () => {
    it('accepts only separate fixed-format proofs and narrow credentials', () => {
        expect(matches('a'.repeat(64), COMPANION_PROOF)).toBe(true);
        expect(matches('idc_' + 'a'.repeat(64), COMPANION_TOKEN)).toBe(true);
        expect(matches('a'.repeat(64), COMPANION_TOKEN)).toBe(false);
        expect(matches('Bearer idc_' + 'a'.repeat(64), COMPANION_TOKEN)).toBe(false);
        expect(matches('ABCD1234', COMPANION_CODE)).toBe(true);
        expect(matches('abcd1234', COMPANION_CODE)).toBe(false);
    });
    it('bounds device labels and excludes control characters', () => {
        expect(pairingLabel(' Phone ')).toBe('Phone');
        expect(pairingLabel('電話')).toBe('電話');
        for (const value of ['', 'x'.repeat(81), 'Phone\nAdmin', null, {}]) expect(pairingLabel(value)).toBeNull();
    });
    it('requires JSON, an object, and bounded UTF-8 bytes', async () => {
        const request = (body: string, type = 'application/json') => new Request('https://app.test', {
            method: 'POST', headers: { 'Content-Type': type }, body,
        });
        await expect(readCompanionJson(request('{"name":"電話"}'))).resolves.toEqual({ name: '電話' });
        await expect(readCompanionJson(request('[]'))).rejects.toMatchObject({ status: 400 });
        await expect(readCompanionJson(request('{}', 'text/plain'))).rejects.toMatchObject({ status: 415 });
        await expect(readCompanionJson(request('{"name":"電話"}'), 12)).rejects.toMatchObject({ status: 413 });
        await expect(readCompanionJson(request('{'))).rejects.toMatchObject({ status: 400 });
    });
});
