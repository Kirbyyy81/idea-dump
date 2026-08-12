const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

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

const { getOpenApiSpec } = require('../lib/openapi/index.ts');

test('composes the documented API paths from domain-owned modules', () => {
    const spec = getOpenApiSpec();

    assert.deepEqual(Object.keys(spec.paths), [
        '/api/openapi',
        '/api/logs',
        '/api/logs/{id}',
        '/api/export/weekly',
        '/api/ingest',
        '/api/tickets',
        '/api/tickets/{id}',
        '/api/film/rolls',
        '/api/film/rolls/{id}/cover',
        '/api/film/cameras',
        '/api/film/dashboard',
        '/api/film/integrations/google/sync',
    ]);
    assert.equal(spec.components.schemas.Ticket.properties.status.type, 'string');
    assert.equal(spec.paths['/api/film/rolls'].post.summary, 'Create a film roll');
});

test('keeps endpoint definitions out of the OpenAPI composition entry point', () => {
    const index = fs.readFileSync(path.join(root, 'lib', 'openapi', 'index.ts'), 'utf8');

    assert.match(index, /from '\.\/logs'/);
    assert.match(index, /from '\.\/projects'/);
    assert.match(index, /from '\.\/tickets'/);
    assert.match(index, /from '\.\/film'/);
    assert.doesNotMatch(index, /'\/api\/logs'/);
});
