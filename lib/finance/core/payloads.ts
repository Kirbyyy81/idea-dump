import { FINANCE_V1_CURRENCY } from '@/lib/finance/core/constants';
import type {
    FinanceCandidateTransaction,
    FinanceDashboardRecentTransaction,
    FinanceReviewCandidate,
    FinanceRule,
    FinanceRuleSuggestion,
    FinanceRuleSuggestionView,
    FinanceRuleView,
    FinanceTransaction,
    FinanceTransactionView,
} from '@/lib/types';

type FinanceRuleWithRelations = FinanceRule & {
    finance_source?: { name: string } | null;
    category?: { name: string } | null;
};

type FinanceRuleSuggestionWithRelations = FinanceRuleSuggestion & {
    finance_source?: { name: string } | null;
    category?: { name: string } | null;
};

function referenceOption(value: { id: string; name: string } | null | undefined) {
    return value ? { id: value.id, name: value.name } : null;
}

function namedReference(value: { name: string } | null | undefined) {
    return value ? { name: value.name } : null;
}

export function toFinanceTransactionView(transaction: FinanceTransaction): FinanceTransactionView {
    return {
        id: transaction.id,
        source_id: transaction.source_id,
        category_id: transaction.category_id || null,
        direction: transaction.direction,
        amount: Number(transaction.amount),
        currency: transaction.currency || FINANCE_V1_CURRENCY,
        merchant: transaction.merchant || null,
        payee_id: transaction.payee_id || null,
        reference_number: transaction.reference_number || null,
        transaction_date: transaction.transaction_date,
        notes: transaction.notes || null,
        created_at: transaction.created_at,
        finance_source: referenceOption(transaction.finance_source),
        category: transaction.category ? {
            id: transaction.category.id,
            name: transaction.category.name,
            is_archived: Boolean(transaction.category.is_archived),
        } : null,
        finance_payee: referenceOption(transaction.finance_payee),
    };
}

export function toFinanceDashboardRecentTransaction(
    transaction: FinanceTransaction
): FinanceDashboardRecentTransaction {
    return {
        id: transaction.id,
        direction: transaction.direction,
        amount: Number(transaction.amount),
        merchant: transaction.merchant || null,
        transaction_date: transaction.transaction_date,
        finance_source: namedReference(transaction.finance_source),
        finance_payee: namedReference(transaction.finance_payee),
    };
}

export function toFinanceRuleView(rule: FinanceRuleWithRelations): FinanceRuleView {
    return {
        id: rule.id,
        name: rule.name,
        match_type: rule.match_type,
        pattern: rule.pattern,
        category_id: rule.category_id || null,
        source_id: rule.source_id || null,
        direction: rule.direction || null,
        priority: rule.priority,
        is_active: rule.is_active,
        source: rule.source,
        auto_created_at: rule.auto_created_at || null,
        learning_evidence_count: rule.learning_evidence_count || null,
        created_at: rule.created_at,
        finance_source: namedReference(rule.finance_source),
        category: namedReference(rule.category),
    };
}

export function toFinanceRuleSuggestionView(
    suggestion: FinanceRuleSuggestionWithRelations
): FinanceRuleSuggestionView {
    return {
        id: suggestion.id,
        name: suggestion.name,
        pattern: suggestion.pattern,
        match_type: suggestion.match_type,
        category_id: suggestion.category_id,
        source_id: suggestion.source_id || null,
        direction: suggestion.direction,
        priority: suggestion.priority,
        evidence_count: suggestion.evidence_count,
        category: namedReference(suggestion.category),
        finance_source: namedReference(suggestion.finance_source),
    };
}

export function toFinanceReviewCandidate(candidate: FinanceCandidateTransaction): FinanceReviewCandidate {
    const duplicate = candidate.duplicate_transaction;
    return {
        id: candidate.id,
        payload: candidate.payload,
        confidence: candidate.confidence == null ? null : Number(candidate.confidence),
        duplicate_outcome: candidate.duplicate_outcome,
        duplicate_signals: candidate.duplicate_signals || [],
        duplicate_explanation: candidate.duplicate_explanation || null,
        intake: candidate.intake ? {
            ocr_text: candidate.intake.ocr_text || null,
            ocr_raw_text: candidate.intake.ocr_raw_text || null,
            ocr_normalized_text: candidate.intake.ocr_normalized_text || null,
            ocr_confidence: candidate.intake.ocr_confidence == null
                ? null
                : Number(candidate.intake.ocr_confidence),
            normalizer_version: candidate.intake.normalizer_version == null
                ? null
                : Number(candidate.intake.normalizer_version),
        } : null,
        duplicate_transaction: duplicate ? {
            id: duplicate.id,
            amount: Number(duplicate.amount),
            currency: duplicate.currency || FINANCE_V1_CURRENCY,
            merchant: duplicate.merchant || null,
            transaction_date: duplicate.transaction_date,
            finance_source: namedReference(duplicate.finance_source),
            finance_payee: namedReference(duplicate.finance_payee),
        } : null,
    };
}
