import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeSessionModule } from '@/lib/rbac/guards';
import {
    FinanceAccount,
    FinanceAccountKind,
    FinanceCategory,
    FinanceCategoryType,
    FinanceTransaction,
    FinanceTransactionDirection,
    FinanceTransactionSource,
    FinanceTransactionStatus,
} from '@/lib/types';

const accountKinds: FinanceAccountKind[] = ['bank', 'cash', 'credit_card', 'ewallet'];
const categoryTypes: FinanceCategoryType[] = ['expense', 'income'];
const transactionDirections: FinanceTransactionDirection[] = ['expense', 'income', 'transfer'];
const transactionSources: FinanceTransactionSource[] = ['manual', 'screenshot'];
const transactionStatuses: FinanceTransactionStatus[] = ['confirmed', 'review', 'duplicate', 'rejected'];

export async function authorizeFinance() {
    return authorizeSessionModule('finance');
}

export function jsonError(message: string, status = 400) {
    return NextResponse.json({ error: message }, { status });
}

export function toRequiredText(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

export function toNullableText(value: unknown) {
    const text = toRequiredText(value);
    return text || null;
}

export function toNonNegativeNumber(value: unknown) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function toPositiveNumber(value: unknown) {
    const parsed = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function normalizeDate(value: unknown) {
    const text = toRequiredText(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

export function isFinanceAccountKind(value: unknown): value is FinanceAccountKind {
    return accountKinds.includes(value as FinanceAccountKind);
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

export async function getOwnedFinanceAccount(userId: string, accountId: string) {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('finance_accounts')
        .select('*')
        .eq('id', accountId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw error;
    return data as FinanceAccount | null;
}

export async function getOwnedFinanceCategory(userId: string, categoryId: string) {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('finance_categories')
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
        account: transaction.account ? { ...transaction.account, opening_balance: Number(transaction.account.opening_balance) } : null,
    };
}
