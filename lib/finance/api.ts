import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeSessionModule } from '@/lib/rbac/guards';
import {
    FinanceSource,
    FinanceCategory,
    FinanceCategoryType,
    FinanceTransaction,
    FinanceTransactionDirection,
    FinanceTransactionSource,
    FinanceTransactionStatus,
} from '@/lib/types';
import { FINANCE_V1_CURRENCY } from '@/lib/finance/constants';

const categoryTypes: FinanceCategoryType[] = ['expense', 'income'];
const transactionDirections: FinanceTransactionDirection[] = ['expense', 'income'];
const transactionSources: FinanceTransactionSource[] = ['manual', 'screenshot'];
const transactionStatuses: FinanceTransactionStatus[] = ['confirmed', 'review', 'duplicate', 'rejected'];

export async function authorizeFinance() {
    return authorizeSessionModule('finance');
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
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 999_999_999_999.99) return null;
    const rounded = Math.round((parsed + Number.EPSILON) * 100) / 100;
    return Math.abs(parsed - rounded) < 1e-9 ? parsed : null;
}

export function normalizeDate(value: unknown) {
    const text = toRequiredText(value);
    const match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year
        && date.getUTCMonth() === month - 1
        && date.getUTCDate() === day
        ? text
        : null;
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

export async function getOwnedFinanceSource(userId: string, sourceId: string) {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('dim_finance_sources')
        .select('*')
        .eq('id', sourceId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw error;
    return data as FinanceSource | null;
}

export async function getOwnedFinanceCategory(userId: string, categoryId: string) {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('dim_finance_categories')
        .select('*')
        .eq('id', categoryId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw error;
    return data as FinanceCategory | null;
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
