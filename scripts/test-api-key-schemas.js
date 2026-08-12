const assert = require('node:assert/strict');
const test = require('node:test');
const { parseApiKeyId, parseApiKeyName } = require('../lib/auth/apiKeySchemas.ts');

test('normalizes API key names', () => {
    assert.deepEqual(parseApiKeyName({ name: ' Automation ' }), { data: 'Automation' });
});

test('requires a valid API key name and identifier', () => {
    assert.deepEqual(parseApiKeyName({ name: '   ' }), { error: 'Key name is required' });
    assert.deepEqual(parseApiKeyId(''), { error: 'Key ID is required' });
    assert.deepEqual(parseApiKeyId(' key-1 '), { data: 'key-1' });
});
