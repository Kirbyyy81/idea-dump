export const FINANCE_SHARE_QUERY_PARAM = 'finance_share';

export const FINANCE_SHARE_MESSAGE_TYPES = {
    ready: 'finance-share:ready',
    claim: 'finance-share:claim',
    payload: 'finance-share:payload',
    acknowledge: 'finance-share:acknowledge',
    missing: 'finance-share:missing',
    error: 'finance-share:error',
} as const;

export type FinanceShareClientMessage =
    | { type: typeof FINANCE_SHARE_MESSAGE_TYPES.ready }
    | {
        type:
            | typeof FINANCE_SHARE_MESSAGE_TYPES.claim
            | typeof FINANCE_SHARE_MESSAGE_TYPES.acknowledge;
        shareId: string;
    };

export type FinanceShareWorkerMessage =
    | {
        type: typeof FINANCE_SHARE_MESSAGE_TYPES.payload;
        shareId: string;
        files: unknown;
    }
    | {
        type:
            | typeof FINANCE_SHARE_MESSAGE_TYPES.missing
            | typeof FINANCE_SHARE_MESSAGE_TYPES.error;
        shareId: string;
        message?: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function parseFinanceShareWorkerMessage(value: unknown): FinanceShareWorkerMessage | null {
    if (!isRecord(value) || typeof value.shareId !== 'string' || !value.shareId) return null;

    if (value.type === FINANCE_SHARE_MESSAGE_TYPES.payload) {
        return {
            type: value.type,
            shareId: value.shareId,
            files: value.files,
        };
    }

    if (
        value.type === FINANCE_SHARE_MESSAGE_TYPES.missing
        || value.type === FINANCE_SHARE_MESSAGE_TYPES.error
    ) {
        return {
            type: value.type,
            shareId: value.shareId,
            message: typeof value.message === 'string' ? value.message : undefined,
        };
    }

    return null;
}
