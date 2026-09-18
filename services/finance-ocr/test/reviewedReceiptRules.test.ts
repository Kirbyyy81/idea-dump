import { describe, expect, it } from 'vitest';
import { parseFinanceText } from '@/lib/finance/ocr/parser';
import { detectFinanceSource } from '@/lib/finance/ocr/sourceDetection';
import { cleanRytMerchantIcon, isTngCardReceipt, rytQrMerchant } from '@/lib/finance/ocr/reviewedReceiptRules';
import type { FinanceOcrPayee, FinanceOcrRule, FinanceOcrSource } from '@/lib/types';

const ryt: FinanceOcrSource = { id: 'ryt', name: 'Ryt Bank', filename_aliases: [], ocr_aliases: [], is_archived: false };
const wallet: FinanceOcrSource = { ...ryt, id: 'wallet', name: 'TnG' };
const card: FinanceOcrSource = { ...ryt, id: 'card', name: 'TnG Card' };
const sources = [ryt, wallet, card];
const cardText = 'Details\n-RM 3.20\nTransaction Type Usage\nPosting Time 12/09/2026 18:18\nCard Balance RM 40.00\nEntry Loc KJ_TEST\nExit Loc KJ LINE';
const qrText = '-RM 12.50\nTo Sample Tea Sdn Bhd\n12 Sep 2026, 10:30\nStatus Completed\nFrom Main Account\nReference ID TEST12345\nTransaction type DuitNow QR';
const iconText = (name: string) => `Successful\nRM 12.50\n12 Sep 2026, 10:30\n${name}\nPaid from Main Account\nReference ID TEST12345\nRecipient reference\nTransfer`;
const savedPayee: FinanceOcrPayee = { id: 'payee', name: 'Sample Tea Sdn Bhd', normalized_name: 'sampleteasdnbhd', is_archived: false };
const parse = (text: string, filename = 'Screenshot_Ryt_Bank.png', rules: FinanceOcrRule[] = [], payees: FinanceOcrPayee[] = []) =>
    parseFinanceText(text, rules, sources, filename, [], payees);

describe('reviewed TnG Card source structure', () => {
    it.each(['Screenshot_TnG.png', 'Screenshot_TnG_eWallet.png', 'Screenshot_TnG_Card.png', 'Screenshot.png'])(
        'identifies the card source with %s', (filename) => {
            const result = parse(cardText, filename);
            expect(result.payload.source_id).toBe(card.id);
            expect(result.sourceDetectionSignals).toContainEqual({
                source_id: card.id, source_name: card.name, kind: 'receipt_structure',
                alias: 'Posting Time + Card Balance + Entry Loc', score: 6,
            });
        },
    );
    it.each(['Posting Time', 'Card Balance', 'Entry Loc'])('requires %s', (label) => {
        const text = cardText.split('\n').filter((line) => !line.startsWith(label)).join('\n');
        expect(parse(text, 'Screenshot_TnG.png').payload.source_id).toBe(wallet.id);
    });
    it('does not classify label mentions in free text or wallet receipts', () => {
        expect(isTngCardReceipt('Notes Posting Time 12/09/2026\nNotes Card Balance RM 10\nNotes Entry Loc Station')).toBe(false);
        expect(parse('Transaction Type Payment\nDate/Time 12/09/2026\nPayment Method eWallet Balance', 'Screenshot_TnG.png').payload.source_id).toBe(wallet.id);
    });
    it('respects other-bank evidence and missing or archived card sources', () => {
        expect(parse(cardText, 'Screenshot_Ryt_Bank.png').payload.source_id).toBe(ryt.id);
        expect(detectFinanceSource(cardText, 'Screenshot_TnG.png', [wallet]).sourceId).toBe(wallet.id);
        expect(detectFinanceSource(cardText, 'Screenshot_TnG.png', [wallet, { ...card, is_archived: true }]).sourceId).toBe(wallet.id);
    });
    it('abstains when the user has duplicate card source names', () => {
        const result = detectFinanceSource(cardText, 'Screenshot_TnG.png', [...sources, { ...card, id: 'second-card' }]);
        expect(result.sourceId).toBeNull();
        expect(result.hasConflict).toBe(true);
    });
    it('normalizes Unicode and respects physical line and text limits', () => {
        expect(isTngCardReceipt(cardText.replace('Card Balance', 'Ｃａｒｄ Balance'))).toBe(true);
        expect(isTngCardReceipt('\n'.repeat(200) + cardText)).toBe(false);
        expect(isTngCardReceipt('x'.repeat(20_000) + '\n' + cardText)).toBe(false);
    });
});

describe('reviewed Ryt merchant extraction', () => {
    it('routes a QR To label to merchant, including a saved-payee name', () => {
        const result = parse(qrText, undefined, [], [savedPayee]);
        expect(result.payload).toMatchObject({ merchant: savedPayee.name, payee_id: null, payee_name: null });
        expect(result.payload.parser_template_baseline?.merchant).toBe(savedPayee.name);
    });
    it('keeps personal transfers as payees and other sources unchanged', () => {
        expect(parse(qrText.replace('DuitNow QR', 'DuitNow Transfer'), undefined, [], [savedPayee]).payload)
            .toMatchObject({ merchant: null, payee_id: savedPayee.id, payee_name: savedPayee.name });
        expect(parse(qrText, 'Screenshot_TnG.png').payload).toMatchObject({ merchant: null, payee_name: savedPayee.name });
    });
    it('requires the complete QR transaction type label', () => {
        expect(rytQrMerchant(qrText.replace('Transaction type DuitNow QR', 'Notes about DuitNow QR'))).toBeNull();
        expect(rytQrMerchant(qrText.replace('DuitNow QR', 'DuitNow QR Refund'))).toBeNull();
    });
    it('collapses equal recipients but rejects differing recipients and invalid names', () => {
        expect(rytQrMerchant(qrText + '\nTo Sample Tea Sdn Bhd')).toBe(savedPayee.name);
        expect(rytQrMerchant(qrText + '\nTo Different Shop')).toBeNull();
        expect(rytQrMerchant(qrText.replace(savedPayee.name, '12345'))).toBeNull();
        expect(rytQrMerchant(qrText.replace(savedPayee.name, 'A'.repeat(501)))).toBeNull();
        expect(rytQrMerchant(qrText.replace(savedPayee.name, 'A'.repeat(500)))).toBe('A'.repeat(500));
        expect(rytQrMerchant('\n'.repeat(200) + qrText)).toBeNull();
    });
    it.each(['D', 'DO'])('cleans the %s icon only at the fallback merchant position', (prefix) => {
        const result = parse(iconText(`${prefix} Sample Tea Sdn Bhd`));
        expect(result.payload.merchant).toBe(savedPayee.name);
        expect(result.payload.parser_template_baseline?.merchant).toBe(savedPayee.name);
        expect(result.payload.learned_field_rule_ids).toEqual([]);
    });
    it.each(['Deli Shop', 'DOUGH Bakery', 'D & D Cafe', 'Do Good Cafe'])(
        'does not strip attached letters or mixed-case names: %s', (name) => {
            expect(parse(iconText(name)).payload.merchant).toBe(name);
        },
    );
    it('preserves explicit merchants, saved payees, other sources and incomplete layouts', () => {
        expect(parse(iconText('Merchant: D Sample Tea')).payload.merchant).toBe('D Sample Tea');
        const payee = { ...savedPayee, name: 'D Sample Tea', normalized_name: 'dsampletea' };
        expect(parse(iconText(payee.name), undefined, [], [payee]).payload).toMatchObject({ merchant: null, payee_id: payee.id });
        expect(parse(iconText('D Sample Tea'), 'Screenshot_TnG.png').payload.merchant).toBe('D Sample Tea');
        for (const label of ['Successful', 'RM 12.50', 'Paid from Main Account', 'Reference ID TEST12345']) {
            expect(cleanRytMerchantIcon(iconText('D Sample Tea').replace(label, ''), 'D Sample Tea')).toBeNull();
        }
        expect(cleanRytMerchantIcon(iconText('D Sample Tea').replace('Paid from', '\nPaid from'), 'D Sample Tea')).toBeNull();
    });
    it('lets manual merchant rules take precedence after the receipt correction', () => {
        const rule: FinanceOcrRule = {
            id: 'manual-rule', name: 'Preferred Merchant', match_type: 'merchant_alias', pattern: 'Sample Tea',
            category_id: null, source_id: ryt.id, direction: 'expense', priority: 1, is_active: true,
            source: 'manual', auto_created_at: null, created_at: '2026-01-01T00:00:00Z',
        };
        expect(parse(qrText, undefined, [rule]).payload.merchant).toBe(rule.name);
        expect(parse(iconText('D Sample Tea'), undefined, [rule]).payload.merchant).toBe(rule.name);
    });
});
