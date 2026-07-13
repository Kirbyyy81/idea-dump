import { createAdminClient } from '@/lib/supabase/admin';
import {
    FinanceCurrency,
    FinanceDuplicateOutcome,
    FinanceDuplicateSignal,
} from '@/lib/types';
import { normalizeFinanceMerchantKey } from '@/lib/finance/normalizer';

export { normalizeFinanceMerchantKey } from '@/lib/finance/normalizer';

export interface FinanceDuplicateAssessment {
    outcome: FinanceDuplicateOutcome;
    matchedTransactionId: string | null;
    score: number;
    signals: FinanceDuplicateSignal[];
    explanation: string;
}

export interface FinanceDuplicateInput {
    userId: string;
    intakeId?: string | null;
    ocrTextHash?: string | null;
    amount: number | null;
    currency: FinanceCurrency;
    merchant: string | null;
    transactionDate: string | null;
    sourceId: string | null;
    referenceNumber: string | null;
}

interface DuplicateTransactionRow {
    id: string;
    intake_item_id: string | null;
    amount: number | string;
    currency: string;
    merchant: string | null;
    reference_number: string | null;
    transaction_date: string;
    source_id: string;
}

interface ScoredAssessment extends FinanceDuplicateAssessment {
    transactionDate: string;
}

const SIGNAL_LABELS: Record<FinanceDuplicateSignal, string> = {
    image_hash: 'same screenshot',
    ocr_text_hash: 'same normalized OCR text',
    reference_number: 'same reference number',
    amount: 'same amount',
    transaction_date: 'same transaction date',
    source: 'same source',
    merchant: 'same merchant',
};

export function normalizeFinanceReferenceKey(value: string | null | undefined) {
    return (value || '').normalize('NFKC').trim().toUpperCase();
}

function dateWithOffset(value: string, offset: number) {
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
}

function explanationFor(signals: FinanceDuplicateSignal[]) {
    if (!signals.length) return 'No deterministic duplicate signals matched.';
    return `Matched on ${signals.map((signal) => SIGNAL_LABELS[signal]).join(', ')}.`;
}

function scoreTransaction(
    input: FinanceDuplicateInput,
    transaction: DuplicateTransactionRow,
    textHashTransactionIds: Set<string>
): ScoredAssessment | null {
    if ((transaction.currency || 'MYR') !== input.currency) return null;

    const amountMatches = input.amount !== null && Number(transaction.amount) === input.amount;
    const dateMatches = Boolean(input.transactionDate && transaction.transaction_date === input.transactionDate);
    const sourceMatches = Boolean(input.sourceId && transaction.source_id === input.sourceId);
    const merchantKey = normalizeFinanceMerchantKey(input.merchant);
    const merchantMatches = Boolean(
        merchantKey && merchantKey === normalizeFinanceMerchantKey(transaction.merchant)
    );
    const referenceKey = normalizeFinanceReferenceKey(input.referenceNumber);
    const referenceMatches = Boolean(
        referenceKey
        && referenceKey === normalizeFinanceReferenceKey(transaction.reference_number)
        && sourceMatches
    );
    const textHashMatches = textHashTransactionIds.has(transaction.id);

    let outcome: FinanceDuplicateOutcome = 'none';
    let score = 0;
    let signals: FinanceDuplicateSignal[] = [];

    if (referenceMatches) {
        outcome = 'strong';
        score = 100;
        signals = ['reference_number', 'source'];
    } else if (textHashMatches) {
        outcome = 'strong';
        score = 95;
        signals = ['ocr_text_hash'];
    } else if (amountMatches && dateMatches && sourceMatches && merchantMatches) {
        outcome = 'strong';
        score = 90;
        signals = ['amount', 'transaction_date', 'source', 'merchant'];
    } else if (amountMatches && dateMatches && merchantMatches) {
        outcome = 'possible';
        score = 70;
        signals = ['amount', 'transaction_date', 'merchant'];
    } else if (amountMatches && merchantMatches && input.transactionDate) {
        const dayDifference = Math.abs(
            new Date(`${transaction.transaction_date}T00:00:00Z`).getTime()
            - new Date(`${input.transactionDate}T00:00:00Z`).getTime()
        ) / 86_400_000;
        if (dayDifference <= 1) {
            outcome = 'possible';
            score = 60;
            signals = ['amount', 'merchant'];
        }
    } else if (amountMatches && dateMatches) {
        outcome = 'possible';
        score = 40;
        signals = ['amount', 'transaction_date'];
    }

    if (outcome === 'none') return null;
    return {
        outcome,
        matchedTransactionId: transaction.id,
        score,
        signals,
        explanation: explanationFor(signals),
        transactionDate: transaction.transaction_date,
    };
}

/**
 * Loads only same-user, indexed duplicate candidates and evaluates them with a
 * deterministic policy. Missing values can reduce certainty but never act as a
 * wildcard for a strong match.
 */
export async function assessFinanceDuplicate(
    input: FinanceDuplicateInput
): Promise<FinanceDuplicateAssessment> {
    const admin = createAdminClient();
    const transactionSelect = 'id, intake_item_id, amount, currency, merchant, reference_number, transaction_date, source_id';
    const transactionRows = new Map<string, DuplicateTransactionRow>();
    const textHashTransactionIds = new Set<string>();

    const fieldQuery = input.amount !== null && input.transactionDate
        ? admin
            .from('finance_transactions')
            .select(transactionSelect)
            .eq('user_id', input.userId)
            .eq('status', 'confirmed')
            .eq('currency', input.currency)
            .eq('amount', input.amount)
            .gte('transaction_date', dateWithOffset(input.transactionDate, -1))
            .lte('transaction_date', dateWithOffset(input.transactionDate, 1))
            .limit(100)
        : Promise.resolve({ data: [], error: null });

    const referenceKey = normalizeFinanceReferenceKey(input.referenceNumber);
    const referenceQuery = referenceKey && input.sourceId
        ? admin
            .from('finance_transactions')
            .select(transactionSelect)
            .eq('user_id', input.userId)
            .eq('status', 'confirmed')
            .eq('currency', input.currency)
            .eq('source_id', input.sourceId)
            .eq('reference_number', referenceKey)
            .limit(20)
        : Promise.resolve({ data: [], error: null });

    const [fieldResult, referenceResult] = await Promise.all([fieldQuery, referenceQuery]);
    if (fieldResult.error) throw fieldResult.error;
    if (referenceResult.error) throw referenceResult.error;
    for (const row of [...(fieldResult.data || []), ...(referenceResult.data || [])]) {
        transactionRows.set(row.id, row as DuplicateTransactionRow);
    }

    if (input.ocrTextHash) {
        let textHashQuery = admin
            .from('finance_transactions')
            .select(`${transactionSelect}, intake:finance_intake_items!inner(ocr_text_hash)`)
            .eq('user_id', input.userId)
            .eq('status', 'confirmed')
            .eq('intake.ocr_text_hash', input.ocrTextHash)
            .limit(20);
        if (input.intakeId) {
            textHashQuery = textHashQuery.neq('intake_item_id', input.intakeId);
        }
        const { data, error } = await textHashQuery;
        if (error) throw error;
        for (const row of data || []) {
            transactionRows.set(row.id, row as unknown as DuplicateTransactionRow);
            textHashTransactionIds.add(row.id);
        }
    }

    const assessments = Array.from(transactionRows.values())
        .map((transaction) => scoreTransaction(input, transaction, textHashTransactionIds))
        .filter((assessment): assessment is ScoredAssessment => Boolean(assessment))
        .sort((a, b) => b.score - a.score
            || b.transactionDate.localeCompare(a.transactionDate)
            || (a.matchedTransactionId || '').localeCompare(b.matchedTransactionId || ''));

    const best = assessments[0];
    if (!best) {
        return {
            outcome: 'none',
            matchedTransactionId: null,
            score: 0,
            signals: [],
            explanation: explanationFor([]),
        };
    }

    const { transactionDate: _transactionDate, ...assessment } = best;
    return assessment;
}

export function financeDuplicateColumns(assessment: FinanceDuplicateAssessment) {
    return {
        duplicate_outcome: assessment.outcome,
        duplicate_score: assessment.score,
        duplicate_signals: assessment.signals,
        duplicate_explanation: assessment.explanation,
        duplicate_checked_at: new Date().toISOString(),
    };
}
