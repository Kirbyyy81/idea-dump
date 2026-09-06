import type {
    FinanceOcrFieldLearningRule,
    FinanceOcrPayee,
    FinanceOcrRule,
    FinanceOcrSource,
} from '@/lib/types';

export const auroraSource: FinanceOcrSource = {
    id: 'source-aurora',
    name: 'Aurora Wallet',
    filename_aliases: ['Aurora Wallet'],
    ocr_aliases: ['Aurora Wallet'],
    is_archived: false,
};

export const harborSource: FinanceOcrSource = {
    id: 'source-harbor',
    name: 'Harbor Bank',
    filename_aliases: ['Harbor Bank'],
    ocr_aliases: ['Harbor Bank'],
    is_archived: false,
};

const rowanPayee: FinanceOcrPayee = {
    id: 'payee-rowan',
    name: 'Rowan Lee',
    normalized_name: 'rowanlee',
    is_archived: false,
};

const learnedReferenceRule: FinanceOcrFieldLearningRule = {
    id: 'learned-reference-prefix',
    source_id: auroraSource.id,
    field_name: 'reference_number',
    transform_type: 'strip_prefix',
    transform_value: 'OCR-',
    evidence_count: 3,
    is_active: true,
    created_at: '2026-08-01T00:00:00.000Z',
};

const coffeeRule: FinanceOcrRule = {
    id: 'rule-coffee',
    name: 'Coffee purchases',
    match_type: 'keyword',
    pattern: 'coffee shop',
    category_id: 'category-dining',
    source_id: auroraSource.id,
    direction: 'expense',
    priority: 1,
    is_active: true,
    source: 'manual',
    auto_created_at: null,
    created_at: '2026-08-01T00:00:00.000Z',
};

export interface FinanceParserBaselineFixture {
    name: string;
    normalizedText: string;
    filename: string;
    rules?: FinanceOcrRule[];
    sources?: FinanceOcrSource[];
    fieldLearningRules?: FinanceOcrFieldLearningRule[];
    payees?: FinanceOcrPayee[];
    expected: {
        confidence: number;
        matchedRuleId: string | null;
        payload: {
            amount: number | null;
            currency: 'MYR';
            merchant: string | null;
            payee_id: string | null;
            payee_name: string | null;
            direction: 'expense' | 'income' | null;
            transaction_date: string | null;
            source_id: string | null;
            category_id: string | null;
            reference_number: string | null;
            notes: string | null;
            matched_rule_names: string[];
            learned_field_rule_ids: string[];
            duplicate_transaction_id: null;
        };
        sourceDetectionSignals: Array<{
            source_id: string;
            source_name: string;
            kind: 'filename_alias' | 'ocr_alias' | 'rule_match';
            alias: string;
            score: number;
        }>;
    };
}

export const financeParserBaselineFixtures: FinanceParserBaselineFixture[] = [
    {
        name: 'complete expense with filename source and local date',
        normalizedText: [
            'Merchant: Northstar Cafe',
            'Paid RM 12.50',
            'Reference ID 9 TXN-123456',
            '15/07/2026',
        ].join('\n'),
        filename: 'Capture_Aurora_Wallet.png',
        sources: [auroraSource, harborSource],
        expected: {
            confidence: 0.9,
            matchedRuleId: null,
            payload: {
                amount: 12.5,
                currency: 'MYR',
                merchant: 'Northstar Cafe',
                payee_id: null,
                payee_name: null,
                direction: 'expense',
                transaction_date: '2026-07-15',
                source_id: auroraSource.id,
                category_id: null,
                reference_number: 'TXN-123456',
                notes: null,
                matched_rule_names: [],
                learned_field_rule_ids: [],
                duplicate_transaction_id: null,
            },
            sourceDetectionSignals: [{
                source_id: auroraSource.id,
                source_name: auroraSource.name,
                kind: 'filename_alias',
                alias: 'Aurora Wallet',
                score: 3,
            }],
        },
    },
    {
        name: 'income with OCR source, saved payee, and named date',
        normalizedText: [
            'Harbor Bank',
            'Received RM 42.00',
            'Payee: Rowan Lee',
            '16 Aug 2026',
        ].join('\n'),
        filename: 'Capture.png',
        sources: [auroraSource, harborSource],
        payees: [rowanPayee],
        expected: {
            confidence: 0.9,
            matchedRuleId: null,
            payload: {
                amount: 42,
                currency: 'MYR',
                merchant: null,
                payee_id: rowanPayee.id,
                payee_name: rowanPayee.name,
                direction: 'income',
                transaction_date: '2026-08-16',
                source_id: harborSource.id,
                category_id: null,
                reference_number: null,
                notes: null,
                matched_rule_names: [],
                learned_field_rule_ids: [],
                duplicate_transaction_id: null,
            },
            sourceDetectionSignals: [{
                source_id: harborSource.id,
                source_name: harborSource.name,
                kind: 'ocr_alias',
                alias: 'Harbor Bank',
                score: 4,
            }],
        },
    },
    {
        name: 'filename remains authoritative over conflicting OCR source',
        normalizedText: [
            'Harbor Bank',
            'Merchant: Orion Market',
            'Paid RM 8.40',
            '2026-08-17',
        ].join('\n'),
        filename: 'Capture_Aurora_Wallet.png',
        sources: [auroraSource, harborSource],
        expected: {
            confidence: 0.9,
            matchedRuleId: null,
            payload: {
                amount: 8.4,
                currency: 'MYR',
                merchant: 'Orion Market',
                payee_id: null,
                payee_name: null,
                direction: 'expense',
                transaction_date: '2026-08-17',
                source_id: auroraSource.id,
                category_id: null,
                reference_number: null,
                notes: null,
                matched_rule_names: [],
                learned_field_rule_ids: [],
                duplicate_transaction_id: null,
            },
            sourceDetectionSignals: [
                {
                    source_id: auroraSource.id,
                    source_name: auroraSource.name,
                    kind: 'filename_alias',
                    alias: 'Aurora Wallet',
                    score: 3,
                },
                {
                    source_id: harborSource.id,
                    source_name: harborSource.name,
                    kind: 'ocr_alias',
                    alias: 'Harbor Bank',
                    score: 4,
                },
            ],
        },
    },
    {
        name: 'ambiguous filename source remains unresolved',
        normalizedText: [
            'Merchant: Orion Market',
            'Paid RM 8.40',
            '17.08.2026',
        ].join('\n'),
        filename: 'Aurora_Wallet_Harbor_Bank.png',
        sources: [auroraSource, harborSource],
        expected: {
            confidence: 0.8,
            matchedRuleId: null,
            payload: {
                amount: 8.4,
                currency: 'MYR',
                merchant: 'Orion Market',
                payee_id: null,
                payee_name: null,
                direction: 'expense',
                transaction_date: '2026-08-17',
                source_id: null,
                category_id: null,
                reference_number: null,
                notes: null,
                matched_rule_names: [],
                learned_field_rule_ids: [],
                duplicate_transaction_id: null,
            },
            sourceDetectionSignals: [
                {
                    source_id: auroraSource.id,
                    source_name: auroraSource.name,
                    kind: 'filename_alias',
                    alias: 'Aurora Wallet',
                    score: 3,
                },
                {
                    source_id: harborSource.id,
                    source_name: harborSource.name,
                    kind: 'filename_alias',
                    alias: 'Harbor Bank',
                    score: 3,
                },
            ],
        },
    },
    {
        name: 'generic merchant fallback remains unchanged',
        normalizedText: [
            'Bluebird Bakery',
            'Total RM 7.25',
            '18.08.2026',
        ].join('\n'),
        filename: 'Capture.png',
        expected: {
            confidence: 0.7,
            matchedRuleId: null,
            payload: {
                amount: 7.25,
                currency: 'MYR',
                merchant: 'Bluebird Bakery',
                payee_id: null,
                payee_name: null,
                direction: null,
                transaction_date: '2026-08-18',
                source_id: null,
                category_id: null,
                reference_number: null,
                notes: null,
                matched_rule_names: [],
                learned_field_rule_ids: [],
                duplicate_transaction_id: null,
            },
            sourceDetectionSignals: [],
        },
    },
    {
        name: 'multiline reference artifact and recipient reference remain separate',
        normalizedText: [
            'Merchant: Cedar Books',
            'Paid RM 21.00',
            'Recipient Reference: Team lunch',
            'Reference No.',
            'COPY',
            'AB-987654',
            '2026/08/18',
        ].join('\n'),
        filename: 'Capture.png',
        expected: {
            confidence: 0.8,
            matchedRuleId: null,
            payload: {
                amount: 21,
                currency: 'MYR',
                merchant: 'Cedar Books',
                payee_id: null,
                payee_name: null,
                direction: 'expense',
                transaction_date: '2026-08-18',
                source_id: null,
                category_id: null,
                reference_number: 'AB-987654',
                notes: 'Team lunch',
                matched_rule_names: [],
                learned_field_rule_ids: [],
                duplicate_transaction_id: null,
            },
            sourceDetectionSignals: [],
        },
    },
    {
        name: 'empty receipt leaves extractable fields missing',
        normalizedText: 'TRANSFER RECEIPT',
        filename: 'Capture.png',
        expected: {
            confidence: 0,
            matchedRuleId: null,
            payload: {
                amount: null,
                currency: 'MYR',
                merchant: null,
                payee_id: null,
                payee_name: null,
                direction: null,
                transaction_date: null,
                source_id: null,
                category_id: null,
                reference_number: null,
                notes: null,
                matched_rule_names: [],
                learned_field_rule_ids: [],
                duplicate_transaction_id: null,
            },
            sourceDetectionSignals: [],
        },
    },
    {
        name: 'manual rule still assigns source, category, and direction',
        normalizedText: [
            'Coffee Shop',
            'RM 5.50',
            '18/08/2026',
        ].join('\n'),
        filename: 'Capture.png',
        rules: [coffeeRule],
        sources: [auroraSource],
        expected: {
            confidence: 1,
            matchedRuleId: coffeeRule.id,
            payload: {
                amount: 5.5,
                currency: 'MYR',
                merchant: 'Coffee Shop',
                payee_id: null,
                payee_name: null,
                direction: 'expense',
                transaction_date: '2026-08-18',
                source_id: auroraSource.id,
                category_id: coffeeRule.category_id,
                reference_number: null,
                notes: null,
                matched_rule_names: [coffeeRule.name],
                learned_field_rule_ids: [],
                duplicate_transaction_id: null,
            },
            sourceDetectionSignals: [{
                source_id: auroraSource.id,
                source_name: auroraSource.name,
                kind: 'rule_match',
                alias: coffeeRule.pattern,
                score: 5,
            }],
        },
    },
    {
        name: 'existing learned reference transform remains source scoped',
        normalizedText: [
            'Merchant: Solstice Supplies',
            'Paid RM 30.00',
            'Reference: OCR-654321',
            '19/08/2026',
        ].join('\n'),
        filename: 'Capture_Aurora_Wallet.png',
        sources: [auroraSource],
        fieldLearningRules: [learnedReferenceRule],
        expected: {
            confidence: 0.9,
            matchedRuleId: null,
            payload: {
                amount: 30,
                currency: 'MYR',
                merchant: 'Solstice Supplies',
                payee_id: null,
                payee_name: null,
                direction: 'expense',
                transaction_date: '2026-08-19',
                source_id: auroraSource.id,
                category_id: null,
                reference_number: '654321',
                notes: null,
                matched_rule_names: [],
                learned_field_rule_ids: [learnedReferenceRule.id],
                duplicate_transaction_id: null,
            },
            sourceDetectionSignals: [{
                source_id: auroraSource.id,
                source_name: auroraSource.name,
                kind: 'filename_alias',
                alias: 'Aurora Wallet',
                score: 3,
            }],
        },
    },
];
