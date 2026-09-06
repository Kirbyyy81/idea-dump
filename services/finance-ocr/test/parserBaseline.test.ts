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

        expect(result).toEqual(fixture.expected);
    });
});
