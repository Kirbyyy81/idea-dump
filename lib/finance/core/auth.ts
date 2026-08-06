import { NextRequest, NextResponse } from 'next/server';
import { authorizeSessionModule } from '@/lib/rbac/guards';
import {
    FinanceCategoryType,
    FinanceTransaction,
    FinanceTransactionDirection,
    FinanceTransactionSource,
    FinanceTransactionStatus,
} from '@/lib/types';
import { FINANCE_V1_CURRENCY } from '@/lib/finance/core/constants';
import {
    normalizeFinanceDate,
    toPositiveFinanceAmount,
} from '@/lib/finance/core/values';
import { getFinanceMutationRequestError } from '@/lib/finance/core/requestSecurity';

const categoryTypes: FinanceCategoryType[] = ['expense', 'income'];
const transactionDirections: FinanceTransactionDirection[] = ['expense', 'income'];
const transactionSources: FinanceTransactionSource[] = ['manual', 'screenshot'];
const transactionStatuses: FinanceTransactionStatus[] = ['confirmed', 'review', 'duplicate', 'rejected'];

export async function authorizeFinance(
    request?: NextRequest,
    options: { requireJson?: boolean } = {}
) {
    const session = await authorizeSessionModule('finance');
    if ('response' in session || !request) return session;

    const requestError = getFinanceMutationRequestError({
        method: request.method,
        requestOrigin: request.nextUrl.origin,
        origin: request.headers.get('origin'),
        fetchSite: request.headers.get('sec-fetch-site'),
        contentType: request.headers.get('content-type'),
        requireJson: options.requireJson,
    });
    if (requestError) {
        return { response: jsonError(requestError.message, requestError.status) };
    }

    return session;
}

export function jsonError(message: string, status = 400) {
    return NextResponse.json({ error: message }, { status });
}

export function isFinanceSerializationError(error: unknown) {
    return Boolean(
        error
        && typeof error === 'object'
        && 'code' in error
        && (error as { code?: unknown }).code === '40001'
    );
}

export async function readFinanceJsonObject(request: NextRequest) {
    try {
        const value: unknown = await request.json();
        if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
        return value as Record<string, unknown>;
    } catch {
        return null;
    }
}

export function toRequiredText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

export function toNullableText(value: unknown) {
    const text = toRequiredText(value);
    return text || null;
}

export function toBoundedNullableText(value: unknown, maxLength: number) {
    const text = toNullableText(value);
    return text && text.length <= maxLength ? text : null;
}

export function isFinanceTextWithinLength(value: unknown, maxLength: number) {
    return value === undefined
        || value === null
        || (typeof value === 'string' && value.trim().length <= maxLength);
}

export function isFinanceUuid(value: unknown): value is string {
    return typeof value === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

export function toFinanceInteger(value: unknown) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isInteger(parsed) && parsed >= -2_147_483_648 && parsed <= 2_147_483_647
        ? parsed
        : null;
}

export function normalizeFinanceReferenceNumber(value: unknown) {
    const text = toBoundedNullableText(value, 200);
    return text ? text.normalize('NFKC').toUpperCase() : null;
}

export function toNonNegativeNumber(value: unknown) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function toPositiveNumber(value: unknown) {
    return toPositiveFinanceAmount(value);
}

export function normalizeDate(value: unknown) {
    return normalizeFinanceDate(value);
}

export function isFinanceCategoryType(value: unknown): value is FinanceCategoryType {
    return categoryTypes.includes(value as FinanceCategoryType);
}

export function isFinanceTransactionDirection(value: unknown): value is FinanceTransactionDirection {
    return transactionDirections.includes(value as FinanceTransactionDirection);
}

export function isFinanceTransactionSource(value: unknown): value is FinanceTransactionSource {
    return transactionSources.includes(value as FinanceTransactionSource);
}

export function isFinanceTransactionStatus(value: unknown): value is FinanceTransactionStatus {
    return transactionStatuses.includes(value as FinanceTransactionStatus);
}

export function normalizeFinanceTransaction(transaction: FinanceTransaction) {
    return {
        ...transaction,
        amount: Number(transaction.amount),
        currency: transaction.currency || FINANCE_V1_CURRENCY,
        reference_number: transaction.reference_number || null,
    };
}

export function getFinanceCandidateReference(payload: { reference_number?: string | null; reference?: string | null }) {
    return payload.reference_number || payload.reference || null;
}
