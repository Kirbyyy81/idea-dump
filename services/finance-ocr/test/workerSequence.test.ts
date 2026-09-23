import sharp from 'sharp';
import { expect, it } from 'vitest';
import { recognizeScreenshot, terminateWorker } from '../src/worker.js';
import { processRytReceipt } from '../src/receiptFormat.js';
import { baselineText, receiptContext, sharedImage } from './fixtures/rytShared.js';

it('reads the same screenshot identically immediately after real regional OCR', async () => {
    const screenshot = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="700" height="500"><rect width="700" height="500" fill="white"/><g font-family="Arial" font-size="32"><text x="30" y="60">Ryt Bank</text><text x="30" y="120">Paid from Main Account</text><text x="30" y="180">RM 17.25</text><text x="30" y="240">9 Sep 2026</text><text x="30" y="300">Reference ID SYN1234567</text></g></svg>')).png().toBuffer();
    try {
        const before = await recognizeScreenshot(screenshot);
        expect(before.rawText).toContain('17.25');
        const receipt = await processRytReceipt(await sharedImage(924, true), { rawText: baselineText, confidence: 90 }, receiptContext, recognizeScreenshot, Date.now() + 60_000);
        expect(receipt.processing.format).toBe('ryt_shared_v1');
        expect(receipt.processing.failed_regions).toEqual([]);
        expect(receipt.text).toContain('17.25');
        const after = await recognizeScreenshot(screenshot);
        expect(after).toEqual(before);
    } finally { await terminateWorker(); }
}, 30_000);
