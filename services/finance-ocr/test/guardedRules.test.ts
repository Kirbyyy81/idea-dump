import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { parseFinanceText } from '@/lib/finance/ocr/parser';
import { detectFinanceSource } from '@/lib/finance/ocr/sourceDetection';
import { extractFinanceGuardedMerchant, matchesFinanceRuleConditions } from '@/lib/finance/ocr/guardedRules';
import { getFinanceParserTemplateConfigurationErrors, isFinanceParserTemplateContract } from '@/lib/finance/ocr/templateContract';
import type { FinanceOcrRule, FinanceOcrSource } from '@/lib/types';
import { cardText, guardedBankId, guardedCardId, guardedParityCases, guardedTemplate, guardedWalletId, iconConfig, iconText, qrConfig, qrText, signatureConfig } from './fixtures/guardedRules';

const sources: FinanceOcrSource[] = [
    { id: guardedBankId, name: 'Example Bank', filename_aliases: [], ocr_aliases: [], is_archived: false },
    { id: guardedWalletId, name: 'Example Wallet', filename_aliases: [], ocr_aliases: [], is_archived: false },
    { id: guardedCardId, name: 'Example Card', filename_aliases: [], ocr_aliases: [], is_archived: false },
];
const active = { status: 'active' as const, activated_at: '2026-09-02T00:00:00Z' };
const parse = (text: string, templates = [guardedTemplate()], rules: FinanceOcrRule[] = []) =>
    parseFinanceText(text, rules, sources, 'Example Bank.png', [], [], [], templates);

describe('generic guarded rule runtime', () => {
    it.each(guardedParityCases)('$name', ({ config, text, value }) => {
        const result = config.type === 'source_signature'
            ? matchesFinanceRuleConditions(text, config.conditions) ? 'match' : undefined
            : extractFinanceGuardedMerchant(text, config);
        expect(result).toBe(value);
    });
    it('requires valid configuration and algorithm 2', () => {
        for (const config of [signatureConfig, qrConfig, iconConfig]) {
            expect(isFinanceParserTemplateContract(guardedTemplate(config))).toBe(true);
            expect(isFinanceParserTemplateContract(guardedTemplate(config, { algorithm_version: 1 }))).toBe(false);
            expect(isFinanceParserTemplateContract(guardedTemplate(config, { algorithm_version: 3 }))).toBe(false);
        }
        expect(isFinanceParserTemplateContract(guardedTemplate({ ...signatureConfig, replaces_source_id: guardedCardId }))).toBe(false);
        expect(getFinanceParserTemplateConfigurationErrors('amount', qrConfig).length).toBeGreaterThan(0);
        expect(getFinanceParserTemplateConfigurationErrors('merchant', signatureConfig).length).toBeGreaterThan(0);
        expect(getFinanceParserTemplateConfigurationErrors('merchant', { ...qrConfig, conditions: [{ mode: 'exact', text: '😀'.repeat(61) }] }).length).toBeGreaterThan(0);
    });
    it.each([
        { ...qrConfig, unexpected: true }, { ...qrConfig, conditions: [] },
        { ...qrConfig, conditions: Array(6).fill({ mode: 'exact', text: 'x' }) },
        { ...qrConfig, conditions: [{ mode: 'regex', text: '.*' }] },
        { ...qrConfig, conditions: [{ mode: 'exact', text: 'x'.repeat(121) }] },
        { ...qrConfig, extraction: { type: 'regex', pattern: '.*' } },
        { ...qrConfig, clear_matching_payee: 'true' },
        { ...iconConfig, extraction: { type: 'before_label', label: 'x', strip_prefixes: ['D ', 'd'] } },
    ])('rejects invalid configuration %#', (config) => {
        expect(getFinanceParserTemplateConfigurationErrors('merchant', config).length).toBeGreaterThan(0);
    });
    it('does nothing without a stored template and observes shadow without mutation', () => {
        const baseline = parse(qrText, []);
        const shadow = parse(qrText);
        expect(baseline.payload).toMatchObject({ merchant: null, payee_name: 'Sample Tea' });
        expect(shadow.payload).toMatchObject({ merchant: null, payee_name: 'Sample Tea' });
        expect(shadow.payload.parser_template_evaluations?.[0]).toMatchObject({ outcome: 'shadow', algorithm_version: 2, template_version: 1 });
    });
    it('applies an active QR rule and clears only the matching baseline party', () => {
        const template = guardedTemplate(qrConfig, active);
        const payload = parse(qrText, [template]).payload;
        expect(payload).toMatchObject({ merchant: 'Sample Tea', payee_name: null, payee_id: null });
        expect(payload.parser_template_baseline).toMatchObject({ merchant: null, payee_name: 'Sample Tea' });
        expect(payload.parser_template_evaluations?.[0].outcome).toBe('applied');
        const conflicting = parse('Recipient Other Person\n' + qrText, [template]).payload;
        expect(conflicting).toMatchObject({ merchant: null, payee_name: 'Other Person' });
        expect(conflicting.parser_template_evaluations?.[0].outcome).toBe('conflict');
    });
    it('retains the baseline and manual merchant rules', () => {
        const rule: FinanceOcrRule = { id: 'manual', name: 'Manual Shop', match_type: 'merchant_alias', pattern: 'D Sample Tea', category_id: null, source_id: null, direction: null, priority: 1, is_active: true, source: 'manual', auto_created_at: null, created_at: '2026-01-01' };
        const payload = parse(iconText, [guardedTemplate(iconConfig, active)], [rule]).payload;
        expect(payload.merchant).toBe('Manual Shop');
        expect(payload.parser_template_evaluations?.[0].outcome).toBe('conflict');
        const agreeing = parse(iconText, [guardedTemplate(iconConfig, active)], [{ ...rule, name: 'Sample Tea' }]).payload;
        expect(agreeing.merchant).toBe('Sample Tea');
        expect(agreeing.parser_template_evaluations?.[0].outcome).toBe('not_applicable');
        const clean = parse(iconText, [guardedTemplate(iconConfig, active)]).payload;
        expect(clean.merchant).toBe('Sample Tea');
        expect(clean.parser_template_baseline?.merchant).toBe('D Sample Tea');
    });
    it('preserves baseline on equal-rank disagreement', () => {
        const other = { ...qrConfig, extraction: { type: 'same_line_label' as const, label: 'Shop' } };
        const payload = parse(qrText + '\nShop Other Shop', [guardedTemplate(qrConfig, active), guardedTemplate(other, { ...active, id: 'e5000000-0000-4000-8000-000000000006' })]).payload;
        expect(payload.merchant).toBeNull();
        expect(payload.parser_template_evaluations?.map((item) => item.outcome)).toEqual(['conflict', 'conflict']);
    });
    it('scope mismatch and disabled rules cannot apply', () => {
        const template = guardedTemplate(qrConfig, { ...active, scope_source_id: guardedWalletId });
        expect(parse(qrText, [template]).payload.merchant).toBeNull();
        expect(parse(qrText, [guardedTemplate(qrConfig, { status: 'disabled', disabled_at: '2026-09-03T00:00:00Z' })]).payload.merchant).toBeNull();
    });
});

describe('generic source signature precedence', () => {
    it('observes shadow without replacing the wallet filename', () => {
        const result = detectFinanceSource(cardText, 'Example Wallet.png', sources, [guardedTemplate(signatureConfig)]);
        expect(result.sourceId).toBe(guardedWalletId);
        expect(result.signals).toContainEqual(expect.objectContaining({ kind: 'learned_source_shadow', source_id: guardedCardId }));
    });
    it('refines only the approved source pair when active', () => {
        const template = guardedTemplate(signatureConfig, active);
        expect(detectFinanceSource(cardText, 'Example Wallet.png', sources, [template]).sourceId).toBe(guardedCardId);
        expect(detectFinanceSource(cardText, 'Example Bank.png', sources, [template]).sourceId).toBe(guardedBankId);
        expect(detectFinanceSource(cardText + '\nExample Bank', null, sources, [template]).sourceId).toBe(guardedBankId);
        expect(detectFinanceSource(cardText, 'Example Wallet.png', sources, []).sourceId).toBe(guardedWalletId);
    });
    it('requires active owned sources, all conditions and stable source identity', () => {
        const template = guardedTemplate(signatureConfig, active);
        expect(detectFinanceSource('Card Balance RM 4', 'Example Wallet.png', sources, [template]).sourceId).toBe(guardedWalletId);
        expect(detectFinanceSource(cardText, null, sources.filter((source) => source.id !== guardedCardId), [template]).sourceId).toBeNull();
        expect(detectFinanceSource(cardText, null, sources.map((source) => ({ ...source, is_archived: true })), [template]).sourceId).toBeNull();
    });
});

const database = process.env.FINANCE_PARSER_TEST_DATABASE_URL;
describe.skipIf(!database)('guarded rule PostgreSQL parity', () => {
    it.each(guardedParityCases)('$name', ({ config, text, value }) => {
        const quote = (input: string) => "'" + input.replaceAll("'", "''") + "'";
        const field = config.type === 'source_signature' ? 'source_id' : 'merchant';
        const query = `select public.finance_evaluate_parser_template_v2('${field}',${quote(JSON.stringify(config))}::jsonb,${quote(text)},null,'[]');`;
        const output = execFileSync(process.env.FINANCE_PARSER_TEST_PSQL ?? 'psql', [database!, '-X', '-w', '-At', '-v', 'ON_ERROR_STOP=1'], {
            input: query, encoding: 'utf8', env: { ...process.env, PGCLIENTENCODING: 'UTF8' },
        });
        const result = JSON.parse(output.trim());
        expect(result.outcome).toBe(value === undefined ? 'not_applicable' : value === null ? 'invalid_output' : 'value');
        if (typeof value === 'string') expect(result.value).toBe(value);
    });
});
