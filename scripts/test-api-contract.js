const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
        fileName: filename,
    }).outputText;
    module._compile(output, filename);
};

const { ApiClientError, requestApi } = require('../lib/api/client.ts');
const { isApiErrorResponse } = require('../lib/api/contracts.ts');

test('recognizes the shared API error envelope', () => {
    assert.equal(isApiErrorResponse({
        error: 'VALIDATION_ERROR',
        message: 'Check the submitted fields',
        field_errors: { title: 'Title is required' },
    }), true);
    assert.equal(isApiErrorResponse({ error: 'Title is required' }), false);
});

test('unwraps shared data responses', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => new Response(JSON.stringify({ data: { id: 'project-1' } }), { status: 200 });

    try {
        assert.deepEqual(await requestApi('/api/projects'), { id: 'project-1' });
    } finally {
        global.fetch = originalFetch;
    }
});

test('preserves typed API errors for browser clients', async () => {
    const originalFetch = global.fetch;
    global.fetch = async () => new Response(JSON.stringify({
        error: 'VALIDATION_ERROR',
        message: 'Title is required',
        field_errors: { title: 'Title is required' },
    }), { status: 400 });

    try {
        await assert.rejects(
            () => requestApi('/api/projects'),
            (error) => error instanceof ApiClientError
                && error.code === 'VALIDATION_ERROR'
                && error.status === 400
                && error.fieldErrors?.title === 'Title is required'
        );
    } finally {
        global.fetch = originalFetch;
    }
});
