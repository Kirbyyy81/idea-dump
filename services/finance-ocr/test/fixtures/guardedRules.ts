import type { FinanceGuardedMerchantTemplateConfiguration, FinanceOcrSourceTemplate, FinanceSourceSignatureTemplateConfiguration } from '@/lib/types';

export const guardedBankId = 'e5000000-0000-4000-8000-000000000002';
export const guardedWalletId = 'e5000000-0000-4000-8000-000000000003';
export const guardedCardId = 'e5000000-0000-4000-8000-000000000004';
export const signatureConfig: FinanceSourceSignatureTemplateConfiguration = {
    type: 'source_signature', replaces_source_id: guardedWalletId,
    conditions: ['Posting Time', 'Card Balance', 'Entry Loc'].map((text) => ({ mode: 'label', text })),
};
export const qrConfig: FinanceGuardedMerchantTemplateConfiguration = {
    type: 'guarded_merchant', conditions: [{ mode: 'exact', text: 'Transaction type DuitNow QR' }],
    extraction: { type: 'same_line_label', label: 'To' }, clear_matching_payee: true,
};
export const iconConfig: FinanceGuardedMerchantTemplateConfiguration = {
    type: 'guarded_merchant', conditions: [{ mode: 'exact', text: 'Successful' }, { mode: 'label', text: 'RM' }, { mode: 'prefix', text: 'Reference ID' }],
    extraction: { type: 'before_label', label: 'Paid from Main Account', strip_prefixes: ['D ', 'DO '] }, clear_matching_payee: false,
};
export const qrText = 'To Sample Tea\nTransaction type DuitNow QR\nRM 12.50\n12/09/2026';
export const iconText = 'Successful\nRM 12.50\n12/09/2026\nD Sample Tea\nPaid from Main Account\nReference ID TEST12345';
export const cardText = 'Posting Time 12/09/2026 12:30\nCard Balance RM 12.50\nEntry Loc STATION_TEST';

export function guardedTemplate(config: typeof qrConfig | typeof signatureConfig = qrConfig, overrides: Partial<FinanceOcrSourceTemplate> = {}): FinanceOcrSourceTemplate {
    return {
        id: 'e5000000-0000-4000-8000-000000000005', user_id: 'e5000000-0000-4000-8000-000000000001',
        field_name: config.type === 'source_signature' ? 'source_id' : 'merchant',
        target_source_id: config.type === 'source_signature' ? guardedCardId : null,
        scope_source_id: config.type === 'source_signature' ? null : guardedBankId,
        template_type: config.type, configuration: config, algorithm_version: 2, template_version: 1,
        status: 'shadow', evidence_count: 5, contradiction_count: 0, evaluation_count: 5, precision: 1, coverage: 1,
        predecessor_template_id: null, status_reason: null, created_at: '2026-09-01T00:00:00Z',
        evaluated_at: '2026-09-01T00:00:00Z', activated_at: null, disabled_at: null, updated_at: '2026-09-01T00:00:00Z',
        ...overrides,
    };
}

export const guardedParityCases: Array<{ name: string; config: typeof qrConfig | typeof signatureConfig; text: string; value?: string | null }> = [
    { name: 'signature', config: signatureConfig, text: cardText, value: 'match' },
    { name: 'signature missing label', config: signatureConfig, text: cardText.replace('Entry Loc', 'Exit Loc') },
    { name: 'empty label', config: signatureConfig, text: cardText.replace('Entry Loc STATION_TEST', 'Entry Loc') },
    { name: 'QR', config: qrConfig, text: qrText, value: 'Sample Tea' },
    { name: 'same values', config: qrConfig, text: qrText + '\nTo Sample Tea', value: 'Sample Tea' },
    { name: 'conflicting values', config: qrConfig, text: qrText + '\nTo Other Shop', value: null },
    { name: 'transfer', config: qrConfig, text: qrText.replace('DuitNow QR', 'DuitNow Transfer') },
    { name: 'absent extraction', config: qrConfig, text: 'Transaction type DuitNow QR' },
    { name: 'empty extraction', config: qrConfig, text: 'To\nTransaction type DuitNow QR', value: null },
    { name: 'invalid merchant', config: qrConfig, text: qrText.replace('Sample Tea', '12345'), value: null },
    { name: 'max merchant', config: qrConfig, text: qrText.replace('Sample Tea', 'A'.repeat(500)), value: 'A'.repeat(500) },
    { name: 'long merchant', config: qrConfig, text: qrText.replace('Sample Tea', 'A'.repeat(501)), value: null },
    { name: 'Unicode normalization', config: qrConfig, text: qrText.replace('To Sample Tea', 'Ｔｏ 张三'), value: '张三' },
    { name: 'physical line bound', config: qrConfig, text: '\n'.repeat(200) + qrText },
    { name: 'text bound', config: qrConfig, text: 'X'.repeat(20_000) + '\n' + qrText },
    { name: 'prefix D', config: iconConfig, text: iconText, value: 'Sample Tea' },
    { name: 'prefix DO', config: iconConfig, text: iconText.replace('D Sample', 'DO Sample'), value: 'Sample Tea' },
    { name: 'preserve attached letters', config: iconConfig, text: iconText.replace('D Sample Tea', 'DOUGH Bakery') },
    { name: 'preserve mixed case', config: iconConfig, text: iconText.replace('D Sample Tea', 'Do Good Cafe') },
    { name: 'physical blank line', config: iconConfig, text: iconText.replace('Paid from', '\nPaid from') },
    { name: 'one removal only', config: iconConfig, text: iconText.replace('D Sample', 'D DO Sample'), value: 'DO Sample Tea' },
    { name: 'failed condition', config: iconConfig, text: iconText.replace('Successful', 'Pending') },
];
