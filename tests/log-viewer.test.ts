import { describe, expect, it } from 'vitest';
import { parseLogText } from '@/lib/log-viewer/parse';
import { buildTransactions, transactionHasError } from '@/lib/log-viewer/transactions';

function firstTransactionHasError(logText: string) {
    const parsed = parseLogText(logText);
    const { transactions } = buildTransactions(parsed, { inactivityTimeoutMs: 0 });
    expect(transactions).toHaveLength(1);
    return transactionHasError(transactions[0]);
}

function parseOne(line: string) {
    const [event] = parseLogText(line);
    expect(event).toBeDefined();
    return event;
}

describe('log viewer response classification', () => {
    it('parses JSON data, authentication, eKYC, duration, and app-info lines', () => {
        const jsonData = parseOne(
            '2026-06-18 09:46:07.095 JSON DATA String - {"requestId":"REQ-100","accountId":"4491"}'
        );
        expect(jsonData).toMatchObject({
            lineType: 'content_data',
            requestId: 'REQ-100',
            bodyKind: 'json',
            bodyJson: { accountId: '4491' },
        });

        const authRequest = parseOne(
            '2026-06-18 09:31:06.697 AUTH_REQUEST  >>>>>>> POST  >>>>>> https://example.test/api/v2/openid-connect/token'
        );
        expect(authRequest).toMatchObject({
            lineType: 'request',
            method: 'POST',
            host: 'example.test',
            path: '/api/v2/openid-connect/token',
        });

        const authResponse = parseOne(
            '2026-06-18 09:31:06.907 AUTH_RESPONSE_SUCCESS  >>>>>>> (200)  >>>>>> https://example.test/api/v2/openid-connect/token >>> 211 ms'
        );
        expect(authResponse).toMatchObject({
            lineType: 'response',
            httpStatus: 200,
            durationMs: 211,
        });

        const ekycRequest = parseOne(
            '2026-06-18 09:45:31.150 REQUEST  https://example.test/ekyc/ws/v1/json/uploadMyKadImage   {"requestId":"REQ-200","clientRequestId":"CLIENT-200"}'
        );
        expect(ekycRequest).toMatchObject({
            lineType: 'request',
            path: '/ekyc/ws/v1/json/uploadMyKadImage',
            requestId: 'REQ-200',
            clientRequestId: 'CLIENT-200',
        });

        const durationResponse = parseOne(
            '2026-06-18 09:45:49.705 RESPONSE duration >> 138897140 >> RESULT  {"responseId":"REQ-200","responseCode":"0"}'
        );
        expect(durationResponse).toMatchObject({
            lineType: 'response',
            durationMs: 138897140,
            responseId: 'REQ-200',
        });

        const infoLine = parseOne(
            '2026-06-18 09:46:06.759 App Version Code: 719 App Version Name: 0.1.255-beta Manufacturer: samsung'
        );
        expect(infoLine).toMatchObject({ lineType: 'info', eventType: 'App Version' });
    });

    it('correlates content, request, and response records by request ID', () => {
        const log = [
            '2026-06-18 09:46:07.095 CONTENT DATA >> getCustomer >>  {"requestId":"REQ-300","customerId":"C-1"}',
            '2026-06-18 09:46:07.202 REQUEST  >>>>>>> POST  >>>>>> URL: https://example.test/customer/details >>>>>> {"requestId":"REQ-300"}',
            '2026-06-18 09:46:07.969 RESPONSE_SUCCESS  >>>>>>> (200)  >>>>>> https://example.test/customer/details >>>>>> {"responseId":"REQ-300","responseCode":"0"}',
        ].join('\n');
        const correlated = buildTransactions(parseLogText(log), { inactivityTimeoutMs: 0 });

        expect(correlated.transactions).toHaveLength(1);
        expect(correlated.transactions[0].request?.requestId).toBe('REQ-300');
        expect(correlated.transactions[0].responses[0]?.responseId).toBe('REQ-300');
        expect(correlated.transactions[0].contentData?.functionName).toBe('getCustomer');
        expect(correlated.transactions[0].confidence).toBe('high');
        expect(correlated.unmatchedContentData).toHaveLength(0);
    });

    it('falls back to endpoint matching when request IDs are unavailable', () => {
        const log = [
            '2026-07-06 11:09:30.258 POST REQUEST  >>>>>>> https://example.test/ussp/tablet/ws/v1/json/updateSelectedStore  >>>>>> {"sessionId":"S-1"}',
            '2026-07-06 11:09:30.531 RESPONSE SUCCESS  >>>>>>> https://example.test/ussp/tablet/ws/v1/json/updateSelectedStore  >>>>>> {"responseCode":0,"responseStatus":{"status":"SUCCESS"}}',
        ].join('\n');
        const fallback = buildTransactions(parseLogText(log), { inactivityTimeoutMs: 0 });

        expect(fallback.transactions).toHaveLength(1);
        expect(fallback.transactions[0]).toMatchObject({
            path: '/ussp/tablet/ws/v1/json/updateSelectedStore',
            confidence: 'medium',
        });
        expect(fallback.transactions[0].responses).toHaveLength(1);
    });

    it('retains and classifies orphan error responses', () => {
        const log = '2026-06-18 09:33:02.381 RESPONSE ERROR3  >>>>>>> https://example.test/user/getUserData  >>>>>> {"errorCode":"ERR-1","displayErrorMessage":"Invalid token"}';
        const orphan = buildTransactions(parseLogText(log), { inactivityTimeoutMs: 0 });

        expect(orphan.transactions).toHaveLength(1);
        expect(orphan.transactions[0].orphanKind).toBe('response');
        expect(transactionHasError(orphan.transactions[0])).toBe(true);
    });

    it('does not flag a successful response with null error fields', () => {
        const payload = [
            '2026-07-06 11:09:30.258 POST REQUEST  >>>>>>> https://iot-openapi.yes.my/ussp/tablet/ws/v1/json/updateSelectedStore  >>>>>> {"requestId":"abc"}',
            '2026-07-06 11:09:30.531 RESPONSE SUCCESS  >>>>>>> https://iot-openapi.yes.my/ussp/tablet/ws/v1/json/updateSelectedStore  >>>>>> {"loginId":null,"responseId":null,"responseCode":0,"responseMessage":null,"displayResponseMessage":null,"contentData":null,"sessionId":null,"responseStatus":{"status":"SUCCESS","errorCode":null,"errorMessage":null,"description":null}}',
        ].join('\n');

        expect(firstTransactionHasError(payload)).toBe(false);
    });

    it('flags a response with a real error message', () => {
        const payload = [
            '2026-07-06 11:09:30.258 POST REQUEST  >>>>>>> https://iot-openapi.yes.my/ussp/tablet/ws/v1/json/updateSelectedStore  >>>>>> {"requestId":"abc"}',
            '2026-07-06 11:09:30.531 RESPONSE SUCCESS  >>>>>>> https://iot-openapi.yes.my/ussp/tablet/ws/v1/json/updateSelectedStore  >>>>>> {"responseCode":0,"responseStatus":{"status":"FAILED","errorCode":null,"errorMessage":"store update failed"}}',
        ].join('\n');

        expect(firstTransactionHasError(payload)).toBe(true);
    });
});
