import { FINANCE_V1_CURRENCY } from '@/lib/finance/core/constants';
import type {
    FinanceCandidateTransaction,
    FinanceDashboardRecentTransaction,
    FinanceLearningActiveMetric,
    FinanceLearningRecentOutcome,
    FinanceLearningSummary,
    FinanceLearningTemplateCounts,
    FinanceParserTemplateField,
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

const financeParserTemplateFields = new Set<FinanceParserTemplateField>([
    'source_id',
    'reference_number',
    'merchant',
    'transaction_date',
    'direction',
    'payee_name',
    'notes',
    'recipient_reference',
    'amount',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonNegativeInteger(value: unknown) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function nullableRatio(value: unknown) {
    if (value === null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : undefined;
}

function isTimestamp(value: unknown): value is string {
    return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function isTemplateField(value: unknown): value is FinanceParserTemplateField {
    return typeof value === 'string' && financeParserTemplateFields.has(value as FinanceParserTemplateField);
}

function parseTemplateCounts(value: unknown): FinanceLearningTemplateCounts | null {
    if (!isRecord(value)) return null;
    const activeSource = nonNegativeInteger(value.active_source);
    const activeField = nonNegativeInteger(value.active_field);
    const proposed = nonNegativeInteger(value.proposed);
    const shadow = nonNegativeInteger(value.shadow);
    const rejected = nonNegativeInteger(value.rejected);
    const disabled = nonNegativeInteger(value.disabled);
    if ([activeSource, activeField, proposed, shadow, rejected, disabled].some((count) => count === null)) {
        return null;
    }
    return {
        active_source: activeSource!,
        active_field: activeField!,
        proposed: proposed!,
        shadow: shadow!,
        rejected: rejected!,
        disabled: disabled!,
    };
}

function parseActiveMetric(value: unknown): FinanceLearningActiveMetric | null {
    if (!isRecord(value) || !isTemplateField(value.field_name)) return null;
    const templateCount = nonNegativeInteger(value.template_count);
    const minimumPrecision = nullableRatio(value.minimum_precision);
    const averageCoverage = nullableRatio(value.average_coverage);
    if (templateCount === null || minimumPrecision === undefined || averageCoverage === undefined) return null;
    return {
        field_name: value.field_name,
        template_count: templateCount,
        minimum_precision: minimumPrecision,
        average_coverage: averageCoverage,
    };
}

function parseRecentOutcome(value: unknown): FinanceLearningRecentOutcome | null {
    if (
        !isRecord(value)
        || !isTemplateField(value.field_name)
        || !['rejected', 'disabled'].includes(String(value.status))
        || typeof value.reason !== 'string'
        || value.reason.length < 1
        || value.reason.length > 200
        || !isTimestamp(value.updated_at)
    ) {
        return null;
    }
    return {
        field_name: value.field_name,
        status: value.status as FinanceLearningRecentOutcome['status'],
        reason: value.reason,
        updated_at: value.updated_at,
    };
}

export function toFinanceLearningSummary(value: unknown): FinanceLearningSummary {
    if (!isRecord(value)) return { availability: 'unavailable' };
    if (value.availability === 'never_run') return { availability: 'never_run' };
    if (value.availability !== 'available' || !isRecord(value.latest_run)) {
        return { availability: 'unavailable' };
    }
    const latestRun = value.latest_run;

    const counts = [
        'corrections_examined',
        'category_rules_created',
        'category_rules_updated',
        'category_rules_disabled',
        'reference_rules_created',
        'reference_rules_updated',
        'reference_rules_disabled',
    ] as const;
    const parsedCounts = Object.fromEntries(counts.map((key) => [key, nonNegativeInteger(latestRun[key])]));
    const templateCounts = parseTemplateCounts(value.template_counts);
    const activeReferenceRules = nonNegativeInteger(value.active_reference_rules);
    const activeMetrics = Array.isArray(value.active_metrics)
        ? value.active_metrics.map(parseActiveMetric)
        : [];
    const recentOutcomes = Array.isArray(value.recent_outcomes)
        ? value.recent_outcomes.map(parseRecentOutcome)
        : [];
    const failureCode = latestRun.failure_code;
    if (
        !['succeeded', 'failed'].includes(String(latestRun.status))
        || !isTimestamp(latestRun.finished_at)
        || (failureCode !== null && (typeof failureCode !== 'string' || failureCode.length > 64))
        || Object.values(parsedCounts).some((count) => count === null)
        || !templateCounts
        || activeReferenceRules === null
        || activeMetrics.some((metric) => metric === null)
        || recentOutcomes.some((outcome) => outcome === null)
        || recentOutcomes.length > 5
    ) {
        return { availability: 'unavailable' };
    }

    return {
        availability: 'available',
        latest_run: {
            status: latestRun.status as 'succeeded' | 'failed',
            finished_at: latestRun.finished_at,
            failure_code: failureCode as string | null,
            corrections_examined: parsedCounts.corrections_examined!,
            category_rules_created: parsedCounts.category_rules_created!,
            category_rules_updated: parsedCounts.category_rules_updated!,
            category_rules_disabled: parsedCounts.category_rules_disabled!,
            reference_rules_created: parsedCounts.reference_rules_created!,
            reference_rules_updated: parsedCounts.reference_rules_updated!,
            reference_rules_disabled: parsedCounts.reference_rules_disabled!,
        },
        template_counts: templateCounts,
        active_reference_rules: activeReferenceRules,
        active_metrics: activeMetrics as FinanceLearningActiveMetric[],
        recent_outcomes: recentOutcomes as FinanceLearningRecentOutcome[],
    };
}

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
