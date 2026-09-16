import { describe, expect, it, vi } from 'vitest';
import { parseFinanceText } from '@/lib/finance/ocr/parser';
import { detectRytSharedLayout, processRytReceipt } from '../src/receiptFormat.js';
import { baselineText, receiptContext, regionTexts, sharedImage } from './fixtures/rytShared.js';

const baseline = { rawText: baselineText, confidence: 95 };
function recognizer(texts = regionTexts) {
    let index = 0;
    return vi.fn(async () => ({ rawText: texts[index++], confidence: 75 }));
}
function parsed(receipt: Awaited<ReturnType<typeof processRytReceipt>>) {
    return parseFinanceText(receipt.text, [], receiptContext.sources, null, [], [], [], receipt.processing).payload;
}

describe('Ryt exported receipt layout', () => {
    it.each([[924, false], [462, true], [1386, true]] as const)('reads proportional regions at width %i with alpha %s', async (width, alpha) => {
        const image = await sharedImage(width, alpha);
        const layout = await detectRytSharedLayout(image.buffer);
        expect(layout).not.toBeNull();
        expect(layout!.recipient.left / width).toBeCloseTo(0.22, 2);
        expect(layout!.details.top / image.height).toBeGreaterThan(0.42);
        expect((layout!.details.top + layout!.details.height) / image.height).toBeLessThan(0.72);
        const recognize = recognizer();
        const result = await processRytReceipt(image, baseline, receiptContext, recognize, Date.now() + 60_000);
        expect(recognize).toHaveBeenCalledTimes(3);
        expect(recognize.mock.calls.every((args) => (args as unknown[])[1] === 'block')).toBe(true);
        expect(result.processing).toEqual({ format: 'ryt_shared_v1', detector_version: 1, failed_regions: [], conflicts: [] });
        expect(parsed(result)).toMatchObject({ amount: 17.25, transaction_date: '2026-09-09', payee_name: 'SYNTHETIC CORNER SHOP', merchant: null, reference_number: 'SYN260909123ABC', notes: 'Transfer', direction: null });
        expect(result.text).not.toMatch(/paid daily|Download now/);
    });

    it('requires source evidence and layout anchors, regardless of the filename', async () => {
        const image = await sharedImage(924, false, false);
        image.originalFilename = 'Ryt Bank_export.png';
        const recognize = recognizer();
        const result = await processRytReceipt(image, baseline, receiptContext, recognize, Infinity);
        expect(result).toMatchObject({ text: baselineText, processing: { format: 'unknown' } });
        expect(recognize).not.toHaveBeenCalled();
        const valid = await sharedImage();
        const filenameOnly = await processRytReceipt({ ...valid, originalFilename: 'Ryt Bank.png' }, { rawText: 'unrelated text', confidence: 99 }, receiptContext, recognize, Infinity);
        expect(filenameOnly.processing.format).toBe('unknown');
        expect(recognize).not.toHaveBeenCalled();
    });

    it('does not specialise conflicting banks', async () => {
        const image = await sharedImage();
        const context = { ...receiptContext, sources: [...receiptContext.sources, { id: 'other', name: 'Other Bank', filename_aliases: ['Other Bank'], ocr_aliases: ['Other Bank'], is_archived: false }] };
        const recognize = recognizer();
        const result = await processRytReceipt({ ...image, originalFilename: 'Other Bank.png' }, baseline, context, recognize, Infinity);
        expect(result.processing.format).toBe('unknown');
        expect(recognize).not.toHaveBeenCalled();
    });

    it('retains valid baseline fields and source when every extra reading fails', async () => {
        const image = await sharedImage();
        const recognize = vi.fn().mockRejectedValue(new Error('Synthetic OCR failure'));
        const result = await processRytReceipt(image, { ...baseline, rawText: 'RM 17.25\n9 Sep 2026\n' + baselineText }, receiptContext, recognize, Infinity);
        expect(result.processing.failed_regions).toEqual(['header', 'recipient', 'details']);
        expect(parsed(result)).toMatchObject({ amount: 17.25, transaction_date: '2026-09-09', payee_name: null, merchant: null, source_id: receiptContext.sources[0].id, reference_number: 'SYN260909123ABC', direction: null });
    });

    it('leaves independently conflicting values unresolved despite higher OCR confidence', async () => {
        const image = await sharedImage();
        const original = 'Ryt Bank\nRM 20.00\n8 Sep 2026\nRecipient\nOTHER SYNTHETIC SHOP\nReference ID\nSYN888888ABC\nRecipient reference\nLunch';
        const result = await processRytReceipt(image, { rawText: original, confidence: 99 }, receiptContext, recognizer(), Infinity);
        expect(result.processing.conflicts).toEqual(expect.arrayContaining(['amount', 'transaction_date', 'payee_name', 'reference_number', 'notes']));
        expect(parsed(result)).toMatchObject({ amount: null, transaction_date: null, payee_name: null, payee_id: null, reference_number: null, notes: null });
    });

    it('stops additional recognition when the processing deadline expires', async () => {
        const recognize = recognizer();
        const result = await processRytReceipt(await sharedImage(), baseline, receiptContext, recognize, 0);
        expect(recognize).not.toHaveBeenCalled();
        expect(result.processing.failed_regions).toHaveLength(3);
        expect(parsed(result).reference_number).toBe('SYN260909123ABC');
    });

    it('classifies supported screenshots without changing their text or adding passes', async () => {
        const image = await sharedImage(924, false, false);
        image.originalFilename = 'Screenshot_20260909_Ryt Bank.png';
        const original = 'Ryt Bank\nPaid from Main Account\n-RM 17.25\n9 Sep 2026';
        const recognize = recognizer();
        const result = await processRytReceipt(image, { rawText: original, confidence: 90 }, receiptContext, recognize, Infinity);
        expect(result.processing.format).toBe('ryt_screenshot_v1');
        expect(result.text).toBe(original);
        expect(recognize).not.toHaveBeenCalled();
    });
});

it.each(['Recipient', 'Payee', 'DuitNow', 'buitNow | EXAMPLE', 'Logo'])('rejects shared-receipt party noise: %s', (noise) => {
    const processing = { format: 'ryt_shared_v1' as const, detector_version: 1 as const, failed_regions: [], conflicts: [] };
    const payload = parseFinanceText(`Ryt Bank\nRecipient: ${noise}\nReference ID\nSYN1234567`, [], receiptContext.sources, null, [], [], [], processing).payload;
    expect(payload.payee_name).toBeNull();
    expect(payload.merchant).toBeNull();
});

it('excludes the advertising tail even when its heading is misread or absent', async () => {
    const text = 'Ryt Bank\nRecipient\nSYNTHETIC SHOP\nReference ID\nSYN260909123ABC\nRecipient reference\nTransfer\nJ0in Rvt! Interest paid daily.';
    const receipt = await processRytReceipt(await sharedImage(), { rawText: text, confidence: 99 }, receiptContext, vi.fn().mockRejectedValue(new Error('Unavailable')), Infinity);
    expect(receipt.text).not.toContain('paid daily');
    expect(parsed(receipt).direction).toBeNull();
    expect(parsed(receipt).notes).toBe('Transfer');
});
