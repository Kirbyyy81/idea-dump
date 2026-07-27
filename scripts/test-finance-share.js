const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { File } = require('node:buffer');
const { randomUUID } = require('node:crypto');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');

function loadShareFileModule() {
    const filename = path.join(root, 'lib', 'finance', 'shareFiles.ts');
    const source = fs.readFileSync(filename, 'utf8');
    const output = ts.transpileModule(source, {
        compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2020,
        },
        fileName: filename,
    }).outputText;
    const module = { exports: {} };
    const execute = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
    execute(module.exports, require, module, filename, path.dirname(filename));
    return module.exports;
}

async function testValidation() {
    const shareFiles = loadShareFileModule();
    assert.equal(shareFiles.MAX_FINANCE_SHARE_FILES, 10);
    assert.equal(shareFiles.MAX_FINANCE_SHARE_FILE_BYTES, 4 * 1024 * 1024);
    assert.equal(
        shareFiles.MAX_FINANCE_SHARE_BATCH_BYTES,
        shareFiles.MAX_FINANCE_SHARE_FILES * shareFiles.MAX_FINANCE_SHARE_FILE_BYTES
    );
    assert.equal(
        shareFiles.detectFinanceShareImageType(
            Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        ),
        'image/png'
    );
    assert.equal(
        shareFiles.detectFinanceShareImageType(
            Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])
        ),
        'image/webp'
    );
    assert.equal(
        shareFiles.detectFinanceShareImageType(Uint8Array.from([0xff, 0xd8, 0xff])),
        'image/jpeg'
    );

    const previousCreateImageBitmap = global.createImageBitmap;
    global.createImageBitmap = async () => ({
        width: 1200,
        height: 2400,
        close() {},
    });
    try {
        const png = new File(
            [Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])],
            'receipt.png',
            { type: 'image/png' }
        );
        assert.equal((await shareFiles.validateFinanceSharedFile(png)).isValid, true);

        const misleading = new File(
            [Uint8Array.from([0xff, 0xd8, 0xff, 1])],
            'not-really.png',
            { type: 'image/png' }
        );
        const mismatch = await shareFiles.validateFinanceSharedFile(misleading);
        assert.equal(mismatch.isValid, false);
        assert.match(mismatch.message, /does not match/i);

        const oversized = new File(
            [new Uint8Array(shareFiles.MAX_FINANCE_SHARE_FILE_BYTES + 1)],
            'oversized.png',
            { type: 'image/png' }
        );
        assert.match(
            (await shareFiles.validateFinanceSharedFile(oversized)).message,
            /larger than 4 MB/i
        );

        global.createImageBitmap = async () => ({
            width: shareFiles.MAX_FINANCE_SHARE_IMAGE_DIMENSION + 1,
            height: 1,
            close() {},
        });
        assert.match(
            (await shareFiles.validateFinanceSharedFile(png)).message,
            /dimensions are too large/i
        );
    } finally {
        global.createImageBitmap = previousCreateImageBitmap;
    }
}

async function testServiceWorkerHandoff() {
    const workerSource = fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8');
    const handlers = new Map();
    const context = vm.createContext({
        URL,
        Request,
        Response,
        FormData,
        File,
        Promise,
        Map,
        setTimeout,
        clearTimeout,
        crypto: { randomUUID },
        caches: {
            open: async () => ({
                addAll: async () => {},
                keys: async () => [],
                put: async () => {},
                delete: async () => true,
            }),
            keys: async () => [],
            match: async () => null,
            delete: async () => true,
        },
        self: {
            location: { origin: 'https://idea-dump.test' },
            clients: {
                claim: async () => {},
            },
            skipWaiting() {},
            addEventListener(type, handler) {
                handlers.set(type, handler);
            },
        },
    });
    vm.runInContext(workerSource, context, { filename: 'public/sw.js' });

    const formData = new FormData();
    formData.append('finance_images', new File(['one'], 'one.png', { type: 'image/png' }));
    formData.append('finance_images', new File(['two'], 'two.jpg', { type: 'image/jpeg' }));
    const request = new Request('https://idea-dump.test/share-target/finance', {
        method: 'POST',
        body: formData,
    });

    let responsePromise;
    let lifetimePromise;
    handlers.get('fetch')({
        request,
        resultingClientId: 'finance-client',
        respondWith(value) {
            responsePromise = Promise.resolve(value);
        },
        waitUntil(value) {
            lifetimePromise = Promise.resolve(value);
        },
    });
    const response = await responsePromise;
    assert.equal(response.status, 303);
    const location = new URL(response.headers.get('location'));
    assert.equal(location.pathname, '/finance/add');
    const shareId = location.searchParams.get('finance_share');
    assert.ok(shareId);

    const posted = [];
    const source = {
        id: 'finance-client',
        postMessage(message) {
            posted.push(message);
        },
    };
    handlers.get('message')({
        data: { type: 'finance-share:claim', shareId },
        source,
    });
    assert.equal(posted[0].type, 'finance-share:payload');
    assert.equal(posted[0].files.length, 2);

    handlers.get('message')({
        data: { type: 'finance-share:acknowledge', shareId },
        source,
    });
    await lifetimePromise;
}

function testManifestContract() {
    const source = fs.readFileSync(path.join(root, 'app', 'manifest.ts'), 'utf8');
    assert.match(source, /action:\s*['"]\/share-target\/finance['"]/);
    assert.match(source, /method:\s*['"]POST['"]/);
    assert.match(source, /enctype:\s*['"]multipart\/form-data['"]/);
    assert.match(source, /name:\s*['"]finance_images['"]/);
    assert.match(source, /image\/png/);
    assert.match(source, /image\/jpeg/);
    assert.match(source, /image\/webp/);
}

function testPrepareIdempotencyContract() {
    const source = fs.readFileSync(
        path.join(root, 'lib', 'finance', 'shareBatchClient.ts'),
        'utf8'
    );
    assert.match(source, /request_id:\s*requestId/);
    const experience = fs.readFileSync(
        path.join(root, 'app', 'finance', 'add', '_components', 'FinanceShareExperience.tsx'),
        'utf8'
    );
    assert.match(experience, /prepareAttemptRef/);
    assert.match(experience, /fingerprint:\s*fileFingerprint/);
}

function testServerHandoffContract() {
    const prepare = fs.readFileSync(
        path.join(root, 'app', 'api', 'finance', 'share-batches', 'prepare', 'route.ts'),
        'utf8'
    );
    const commit = fs.readFileSync(
        path.join(root, 'app', 'api', 'finance', 'share-batches', 'commit', 'route.ts'),
        'utf8'
    );
    const active = fs.readFileSync(
        path.join(root, 'app', 'api', 'finance', 'share-batches', 'active', 'route.ts'),
        'utf8'
    );
    assert.match(prepare, /finance_prepare_share_batch_v1/);
    assert.match(prepare, /createSignedUploadUrl\(item\.storage_path,\s*\{\s*upsert:\s*true\s*\}\)/);
    assert.match(commit, /\.info\(item\.storage_path\)/);
    assert.match(commit, /finance_commit_share_batch_v1/);
    assert.match(commit, /safe_to_close:\s*true/);
    assert.match(active, /getOwnedActiveFinanceShareBatch/);
}

function testDatabaseQueueContract() {
    const migration = fs.readFileSync(
        path.join(root, 'supabase', 'migrations', '20260725081908_add_finance_share_batches.sql'),
        'utf8'
    );
    assert.match(migration, /create extension if not exists pgmq/i);
    assert.match(migration, /perform pgmq\.create\('finance_share_ocr'\)/i);
    assert.match(migration, /from pgmq\.read\('finance_share_ocr',\s*p_lease_seconds,\s*1\)/i);
    assert.match(migration, /perform pgmq\.delete\('finance_share_ocr'/i);
    const queueSend = migration.match(/pgmq\.send\([\s\S]*?\) sent_message_id;/)?.[0] || '';
    assert.match(queueSend, /'batchId'.*'batchItemId'.*'processingVersion'/s);
    assert.doesNotMatch(queueSend, /storage_path|user_id|original_filename|token/i);
    assert.match(migration, /from public, anon, authenticated, service_role/);
    assert.match(migration, /to service_role/);
}

(async () => {
    await testValidation();
    await testServiceWorkerHandoff();
    testManifestContract();
    testPrepareIdempotencyContract();
    testServerHandoffContract();
    testDatabaseQueueContract();
    console.log('Finance share-target tests passed');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
