import { describe, expect, it } from 'vitest';
import { parseFinanceText } from '@/lib/finance/ocr/parser';
import { financeParserBaselineFixtures } from './fixtures/parserBaseline';

describe('Finance OCR parser baseline', () => {
    it.each(financeParserBaselineFixtures)('$name', (fixture) => {
        const result = parseFinanceText(
            fixture.normalizedText,
            fixture.rules ?? [],
            fixture.sources ?? [],
            fixture.filename,
            fixture.fieldLearningRules ?? [],
            fixture.payees ?? [],
        );

        const { parser_template_baseline, ...payload } = result.payload;
        expect({ ...result, payload }).toEqual(fixture.expected);
        expect(parser_template_baseline).toEqual({
            reference_number: payload.reference_number, merchant: payload.merchant,
            transaction_date: payload.transaction_date, direction: payload.direction,
            payee_name: payload.payee_name, notes: payload.notes,
            recipient_reference: payload.notes,
        });
    });
});
