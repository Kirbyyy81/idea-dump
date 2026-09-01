import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
    toFinanceDashboardRecentTransaction,
    toFinanceReviewCandidate,
    toFinanceRuleSuggestionView,
    toFinanceRuleView,
    toFinanceTransactionView,
} from '@/lib/finance/core/payloads';
import { toFinanceShareBatch } from '@/lib/finance/share/server';
import type {
    FinanceCandidateTransaction,
    FinanceRule,
    FinanceRuleSuggestion,
    FinanceTransaction,
} from '@/lib/types';

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), 'utf8');

const transaction = {
    id: 'transaction-1',
    user_id: 'private-user',
    source_id: 'source-1',
    category_id: 'category-1',
    intake_item_id: 'private-intake',
    manual_idempotency_key: 'private-key',
    direction: 'expense',
    amount: '12.50',
    currency: 'MYR',
    merchant: 'Merchant',
    payee_id: 'payee-1',
    reference_number: 'REF-1',
    transaction_date: '2026-08-18',
    notes: 'Note',
    source: 'manual',
    status: 'confirmed',
    created_at: '2026-08-18T00:00:00Z',
    updated_at: '2026-08-18T01:00:00Z',
    finance_source: { id: 'source-1', name: 'Bank', user_id: 'private-user' },
    category: { id: 'category-1', name: 'Food', is_archived: false, user_id: 'private-user' },
    finance_payee: { id: 'payee-1', name: 'Recipient', normalized_name: 'recipient', user_id: 'private-user' },
} as unknown as FinanceTransaction;

describe('Finance browser payloads', () => {
    it('maps ledger transactions without persistence-only fields', () => {
        const result = toFinanceTransactionView(transaction);
        expect(result).toEqual({
            id: 'transaction-1',
            source_id: 'source-1',
            category_id: 'category-1',
            direction: 'expense',
            amount: 12.5,
            currency: 'MYR',
            merchant: 'Merchant',
            payee_id: 'payee-1',
            reference_number: 'REF-1',
            transaction_date: '2026-08-18',
            notes: 'Note',
            created_at: '2026-08-18T00:00:00Z',
            finance_source: { id: 'source-1', name: 'Bank' },
            category: { id: 'category-1', name: 'Food', is_archived: false },
            finance_payee: { id: 'payee-1', name: 'Recipient' },
        });
        expect(result).not.toHaveProperty('user_id');
        expect(result).not.toHaveProperty('intake_item_id');
        expect(result).not.toHaveProperty('manual_idempotency_key');
        expect(result).not.toHaveProperty('updated_at');
    });

    it('maps the dashboard recent list to display-only fields', () => {
        expect(toFinanceDashboardRecentTransaction(transaction)).toEqual({
            id: 'transaction-1',
            direction: 'expense',
            amount: 12.5,
            merchant: 'Merchant',
            transaction_date: '2026-08-18',
            finance_source: { name: 'Bank' },
            finance_payee: { name: 'Recipient' },
        });
    });

    it('maps rules and suggestions without tenant IDs or timestamps', () => {
        const rule = toFinanceRuleView({
            id: 'rule-1',
            user_id: 'private-user',
            name: 'Food rule',
            match_type: 'keyword',
            pattern: 'FOOD',
            category_id: 'category-1',
            source_id: null,
            direction: 'expense',
            priority: 100,
            is_active: true,
            source: 'manual',
            auto_created_at: null,
            learning_evidence_count: null,
            created_at: '2026-08-18T00:00:00Z',
            updated_at: '2026-08-18T01:00:00Z',
            category: { name: 'Food' },
            finance_source: null,
        } as FinanceRule & { category: { name: string }; finance_source: null });
        expect(rule).not.toHaveProperty('user_id');
        expect(rule).not.toHaveProperty('updated_at');
        expect(rule.category).toEqual({ name: 'Food' });

        const suggestion = toFinanceRuleSuggestionView({
            id: 'suggestion-1',
            user_id: 'private-user',
            name: 'Food suggestion',
            pattern: 'FOOD',
            match_type: 'keyword',
            category_id: 'category-1',
            source_id: null,
            direction: 'expense',
            priority: 100,
            evidence_count: 3,
            status: 'pending',
            created_at: '2026-08-18T00:00:00Z',
            updated_at: '2026-08-18T01:00:00Z',
            category: { name: 'Food' },
            finance_source: null,
        } as FinanceRuleSuggestion & { category: { name: string }; finance_source: null });
        expect(suggestion).not.toHaveProperty('user_id');
        expect(suggestion).not.toHaveProperty('status');
        expect(suggestion).not.toHaveProperty('created_at');
    });

    it('maps review candidates to the fields rendered by review', () => {
        const result = toFinanceReviewCandidate({
            id: 'candidate-1',
            user_id: 'private-user',
            intake_item_id: 'private-intake',
            payload: {
                amount: 12.5,
                currency: 'MYR',
                merchant: 'Merchant',
                payee_id: null,
                payee_name: null,
                direction: 'expense',
                transaction_date: '2026-08-18',
                source_id: 'source-1',
                category_id: null,
                reference_number: null,
                notes: null,
                matched_rule_names: [],
                duplicate_transaction_id: null,
            },
            confidence: 0.9,
            matched_rule_id: null,
            confirmed_transaction_id: null,
            duplicate_outcome: 'none',
            duplicate_score: 0,
            duplicate_signals: [],
            duplicate_explanation: null,
            duplicate_checked_at: null,
            status: 'pending',
            created_at: '2026-08-18T00:00:00Z',
            updated_at: '2026-08-18T01:00:00Z',
            intake: {
                ocr_text: 'TEXT',
                ocr_raw_text: 'RAW',
                ocr_normalized_text: 'TEXT',
                ocr_confidence: 91,
                normalizer_version: 2,
            },
        } as unknown as FinanceCandidateTransaction);
        expect(Object.keys(result).sort()).toEqual([
            'confidence',
            'duplicate_explanation',
            'duplicate_outcome',
            'duplicate_signals',
            'duplicate_transaction',
            'id',
            'intake',
            'payload',
        ]);
        expect(result).not.toHaveProperty('user_id');
        expect(result).not.toHaveProperty('intake_item_id');
        expect(result).not.toHaveProperty('created_at');
    });

    it('maps active share polling to display-only fields', () => {
        expect(toFinanceShareBatch({
            id: 'batch-1',
            status: 'PROCESSING',
            total_files: 1,
            queued_files: 0,
            processing_files: 1,
            completed_files: 0,
            review_files: 0,
            duplicate_files: 0,
            failed_files: 0,
            created_at: 'private-timestamp',
            updated_at: 'private-timestamp',
            items: [{
                id: 'item-1',
                original_filename: 'receipt.png',
                status: 'PROCESSING',
                intake_item_id: 'private-intake',
                attempt_count: 2,
                created_at: 'private-timestamp',
            }],
        })).toEqual({
            id: 'batch-1',
            status: 'PROCESSING',
            total_files: 1,
            queued_files: 0,
            processing_files: 1,
            completed_files: 0,
            review_files: 0,
            duplicate_files: 0,
            failed_files: 0,
            items: [{ id: 'item-1', original_filename: 'receipt.png', status: 'PROCESSING' }],
        });
    });
});

describe('Finance request inventory', () => {
    it('uses explicit database selects for browser and OCR loading paths', () => {
        const webRepository = read('lib', 'finance', 'core', 'repository.ts');
        const ocrRepository = read('services', 'finance-ocr', 'src', 'repository.ts');
        expect(webRepository).not.toContain(".select('*')");
        expect(ocrRepository).not.toContain(".select('*')");
        expect(webRepository).not.toContain('intake:finance_intake_items(*)');
        expect(webRepository).not.toContain('dim_finance_sources(*)');
        expect(webRepository).not.toContain('dim_finance_categories(*)');
        expect(webRepository).not.toContain('dim_finance_payees(*)');
    });

    it('loads rules and suggestions in one read and keeps the retired upload route POST-only', () => {
        const rulesPanel = read('app', 'finance', 'settings', '_components', 'RulesSettingsPanel.tsx');
        const rulesRoute = read('app', 'api', 'finance', 'rules', 'route.ts');
        const suggestionRoute = read('app', 'api', 'finance', 'rule-suggestions', 'route.ts');
        const uploadRoute = read('app', 'api', 'finance', 'upload', 'route.ts');
        const rulesLoad = rulesPanel.slice(
            rulesPanel.indexOf('const loadData'),
            rulesPanel.indexOf('useEffect', rulesPanel.indexOf('const loadData'))
        );
        expect(rulesLoad).not.toContain('/api/finance/rule-suggestions');
        expect(rulesRoute).toContain('suggestions: settings.suggestions');
        expect(suggestionRoute).not.toContain('export async function GET');
        expect(uploadRoute).not.toContain('export async function GET');
    });

    it('returns a minimal direct OCR HTTP result', () => {
        const appSource = read('services', 'finance-ocr', 'src', 'app.ts');
        expect(appSource).toContain('candidate: { id: result.data.candidate.id }');
        expect(appSource).not.toContain('send({ data: result.data })');
    });
});
