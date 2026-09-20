// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_FINANCE_SHARE_FILE_BYTES, validateFinanceSharedFile } from '@/lib/finance/share/files';

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

beforeEach(() => vi.stubGlobal('createImageBitmap', vi.fn(async () => ({
    width: 100, height: 200, close: vi.fn(),
}))));
afterEach(() => vi.unstubAllGlobals());

describe('Shared image MIME compatibility', () => {
    it.each(['', 'image/*', 'application/octet-stream', 'image/x-png'])('validates PNG bytes labelled %s', async type => {
        const result = await validateFinanceSharedFile(new File([png], 'receipt.png', { type }));
        expect(result).toMatchObject({ isValid: true, detectedMimeType: 'image/png', width: 100, height: 200 });
        expect(createImageBitmap).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/png' }));
    });

    it('recognizes the JPEG alias only when the bytes match JPEG', async () => {
        const jpeg = new File([new Uint8Array([0xff, 0xd8, 0xff, 1])], 'receipt.jpg', { type: 'image/jpg' });
        expect(await validateFinanceSharedFile(jpeg)).toMatchObject({ isValid: true, detectedMimeType: 'image/jpeg' });
        expect(await validateFinanceSharedFile(new File([png], 'receipt.jpg', { type: 'image/jpg' })))
            .toMatchObject({ isValid: false });
    });

    it.each(['image/heic', 'image/svg+xml', 'image/gif', 'text/html'])('rejects unsupported explicit type %s', async type => {
        expect(await validateFinanceSharedFile(new File([png], 'receipt.png', { type })))
            .toMatchObject({ isValid: false });
        expect(createImageBitmap).not.toHaveBeenCalled();
    });

    it('rejects generic files whose bytes are not a supported image', async () => {
        expect(await validateFinanceSharedFile(new File(['<svg/>'], 'receipt.png', { type: 'image/*' })))
            .toMatchObject({ isValid: false, detectedMimeType: null });
        expect(createImageBitmap).not.toHaveBeenCalled();
    });

    it('rejects oversized generic files before decoding', async () => {
        const file = new File([new Uint8Array(MAX_FINANCE_SHARE_FILE_BYTES + 1)], 'large.png', { type: 'image/*' });
        expect(await validateFinanceSharedFile(file)).toMatchObject({ isValid: false, message: 'This image is larger than 4 MB.' });
        expect(createImageBitmap).not.toHaveBeenCalled();
    });

    it('still requires successful decoding after recognizing a signature', async () => {
        vi.mocked(createImageBitmap).mockRejectedValueOnce(new Error('Invalid image'));
        expect(await validateFinanceSharedFile(new File([png], 'broken.png', { type: 'image/*' })))
            .toMatchObject({ isValid: false, message: 'This image could not be decoded safely.' });
    });
});
