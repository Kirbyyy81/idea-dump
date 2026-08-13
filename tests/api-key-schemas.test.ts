import { describe, expect, it } from 'vitest';
import { parseApiKeyId, parseApiKeyName } from '@/lib/auth/apiKeySchemas';

describe('API key schemas', () => {
    it('normalizes API key names', () => {
        expect(parseApiKeyName({ name: ' Automation ' })).toEqual({ data: 'Automation' });
    });

    it('requires a valid API key name and identifier', () => {
        expect(parseApiKeyName({ name: '   ' })).toEqual({ error: 'Key name is required' });
        expect(parseApiKeyId('')).toEqual({ error: 'Key ID is required' });
        expect(parseApiKeyId(' key-1 ')).toEqual({ data: 'key-1' });
    });
});
