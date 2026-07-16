import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ServiceError } from '../src/errors.js';
import { detectImageType, sanitizeFilename, validateImage } from '../src/image.js';

const limits = {
    maxImageBytes: 4 * 1024 * 1024,
    maxImageDimension: 12_000,
    maxImagePixels: 25_000_000,
};

describe('image validation', () => {
    it('sanitizes path components and control characters', () => {
        expect(sanitizeFilename('C:\\fake\\Screen\u0000shot.png')).toBe('Screenshot.png');
    });

    it('fully decodes a valid PNG and hashes it', async () => {
        const buffer = await sharp({
            create: { width: 16, height: 12, channels: 3, background: '#ffffff' },
        }).png().toBuffer();
        expect(detectImageType(buffer)).toBe('image/png');
        const result = await validateImage(buffer, 'image/png', 'shot.png', limits);
        expect(result).toMatchObject({ width: 16, height: 12, mimeType: 'image/png' });
        expect(result.imageHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('rejects declared MIME and magic-byte disagreement', async () => {
        const buffer = await sharp({
            create: { width: 2, height: 2, channels: 3, background: '#ffffff' },
        }).png().toBuffer();
        await expect(validateImage(buffer, 'image/jpeg', 'shot.jpg', limits)).rejects.toMatchObject({
            code: 'image_type_mismatch',
            statusCode: 415,
        } satisfies Partial<ServiceError>);
    });

    it('rejects decoded pixels above the configured limit', async () => {
        const buffer = await sharp({
            create: { width: 20, height: 20, channels: 3, background: '#ffffff' },
        }).webp().toBuffer();
        await expect(validateImage(buffer, 'image/webp', 'shot.webp', {
            ...limits,
            maxImagePixels: 300,
        })).rejects.toMatchObject({
            code: 'image_dimensions_too_large',
            statusCode: 413,
        } satisfies Partial<ServiceError>);
    });
});
