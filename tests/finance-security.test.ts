import { describe, expect, it } from 'vitest';
import {
    getFinanceMutationRequestError,
    type FinanceMutationRequest,
} from '@/lib/finance/core/requestSecurity';

const sameOriginJsonRequest: FinanceMutationRequest = {
    method: 'POST',
    requestOrigin: 'https://idea-dump-alpha.vercel.app',
    origin: 'https://idea-dump-alpha.vercel.app',
    fetchSite: 'same-origin',
    contentType: 'application/json; charset=utf-8',
    requireJson: true,
};

describe('Finance mutation request security', () => {
    it('accepts a same-origin JSON mutation', () => {
        expect(getFinanceMutationRequestError(sameOriginJsonRequest)).toBeNull();
    });

    it('rejects a cross-site browser mutation', () => {
        expect(getFinanceMutationRequestError({
            ...sameOriginJsonRequest,
            fetchSite: 'cross-site',
        })).toEqual({
            message: 'Cross-origin Finance requests are not allowed',
            status: 403,
        });
    });

    it('rejects a mismatched or malformed Origin', () => {
        expect(getFinanceMutationRequestError({
            ...sameOriginJsonRequest,
            origin: 'https://attacker.example',
        })?.status).toBe(403);
        expect(getFinanceMutationRequestError({
            ...sameOriginJsonRequest,
            origin: 'not a URL',
        })).toEqual({ message: 'Invalid request origin', status: 403 });
    });

    it('requires JSON only for JSON mutation routes', () => {
        expect(getFinanceMutationRequestError({
            ...sameOriginJsonRequest,
            contentType: 'text/plain',
        })).toEqual({ message: 'Content-Type must be application/json', status: 415 });
        expect(getFinanceMutationRequestError({
            ...sameOriginJsonRequest,
            method: 'DELETE',
            contentType: null,
            requireJson: false,
        })).toBeNull();
    });

    it('does not apply mutation checks to safe methods', () => {
        expect(getFinanceMutationRequestError({
            ...sameOriginJsonRequest,
            method: 'GET',
            origin: 'https://attacker.example',
            fetchSite: 'cross-site',
            contentType: null,
        })).toBeNull();
    });
});
