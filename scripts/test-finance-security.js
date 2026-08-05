const assert = require('node:assert/strict');
const test = require('node:test');
const { getFinanceMutationRequestError } = require('../lib/finance/core/requestSecurity.ts');

const sameOriginJsonRequest = {
    method: 'POST',
    requestOrigin: 'https://idea-dump-alpha.vercel.app',
    origin: 'https://idea-dump-alpha.vercel.app',
    fetchSite: 'same-origin',
    contentType: 'application/json; charset=utf-8',
    requireJson: true,
};

test('accepts a same-origin JSON mutation', () => {
    assert.equal(getFinanceMutationRequestError(sameOriginJsonRequest), null);
});

test('rejects a cross-site browser mutation', () => {
    assert.deepEqual(getFinanceMutationRequestError({
        ...sameOriginJsonRequest,
        fetchSite: 'cross-site',
    }), {
        message: 'Cross-origin Finance requests are not allowed',
        status: 403,
    });
});

test('rejects a mismatched or malformed Origin', () => {
    assert.equal(getFinanceMutationRequestError({
        ...sameOriginJsonRequest,
        origin: 'https://attacker.example',
    })?.status, 403);
    assert.deepEqual(getFinanceMutationRequestError({
        ...sameOriginJsonRequest,
        origin: 'not a URL',
    }), {
        message: 'Invalid request origin',
        status: 403,
    });
});

test('requires JSON only for JSON mutation routes', () => {
    assert.deepEqual(getFinanceMutationRequestError({
        ...sameOriginJsonRequest,
        contentType: 'text/plain',
    }), {
        message: 'Content-Type must be application/json',
        status: 415,
    });
    assert.equal(getFinanceMutationRequestError({
        ...sameOriginJsonRequest,
        method: 'DELETE',
        contentType: null,
        requireJson: false,
    }), null);
});

test('does not apply mutation checks to safe methods', () => {
    assert.equal(getFinanceMutationRequestError({
        ...sameOriginJsonRequest,
        method: 'GET',
        origin: 'https://attacker.example',
        fetchSite: 'cross-site',
        contentType: null,
    }), null);
});
