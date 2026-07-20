import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { safeError } from './errors.js';

export const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export interface ImageLimits {
    maxImageBytes: number;
    maxImageDimension: number;
    maxImagePixels: number;
}

export interface ValidatedImage {
    buffer: Buffer;
    originalFilename: string;
    mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
    width: number;
    height: number;
    imageHash: string;
}

function hasBytes(bytes: Uint8Array, offset: number, expected: number[]) {
    return expected.every((value, index) => bytes[offset + index] === value);
}

export function detectImageType(bytes: Uint8Array): ValidatedImage['mimeType'] | null {
    if (bytes.length >= 3 && hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
    if (
        bytes.length >= 8
        && hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    ) return 'image/png';
    if (
        bytes.length >= 12
        && hasBytes(bytes, 0, [0x52, 0x49, 0x46, 0x46])
        && hasBytes(bytes, 8, [0x57, 0x45, 0x42, 0x50])
    ) return 'image/webp';
    return null;
}

export function sanitizeFilename(value: string) {
    const basename = value.split(/[\\/]/).pop() ?? '';
    return basename
        .normalize('NFKC')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 255);
}

export async function validateImage(
    buffer: Buffer,
    declaredMimeType: string,
    filename: string,
    limits: ImageLimits,
): Promise<ValidatedImage> {
    const originalFilename = sanitizeFilename(filename);
    if (!originalFilename) {
        throw safeError(400, 'invalid_filename', 'Screenshot filename is invalid.', false, 'validation');
    }
    const normalizedMimeType = declaredMimeType.toLowerCase();
    if (!ACCEPTED_IMAGE_TYPES.has(normalizedMimeType)) {
        throw safeError(415, 'unsupported_image_type', 'Use a PNG, JPEG, or WebP screenshot.', false, 'validation');
    }
    if (!buffer.length || buffer.length > limits.maxImageBytes) {
        throw safeError(413, 'image_too_large', 'Screenshot must be between 1 byte and 4 MB.', false, 'validation');
    }

    const detectedMimeType = detectImageType(buffer);
    if (!detectedMimeType || detectedMimeType !== normalizedMimeType) {
        throw safeError(
            415,
            'image_type_mismatch',
            'Screenshot content does not match its declared PNG, JPEG, or WebP type.',
            false,
            'validation',
        );
    }

    try {
        const image = sharp(buffer, {
            failOn: 'error',
            limitInputPixels: limits.maxImagePixels,
            sequentialRead: true,
        });
        const metadata = await image.metadata();
        const width = metadata.width ?? 0;
        const height = metadata.height ?? 0;
        if (!width || !height) {
            throw safeError(422, 'invalid_image', 'Screenshot dimensions could not be validated.', false, 'validation');
        }
        if (
            width > limits.maxImageDimension
            || height > limits.maxImageDimension
            || width * height > limits.maxImagePixels
        ) {
            throw safeError(
                413,
                'image_dimensions_too_large',
                'Screenshot dimensions are too large for safe OCR processing.',
                false,
                'validation',
            );
        }

        // Force a complete decode before OCR. Metadata-only parsing is not enough
        // to reject truncated or decompression-bomb payloads safely.
        const decoded = await image.clone().raw().toBuffer({ resolveWithObject: true });
        if (decoded.info.width !== width || decoded.info.height !== height) {
            throw safeError(422, 'invalid_image', 'Screenshot dimensions are inconsistent.', false, 'validation');
        }

        return {
            buffer,
            originalFilename,
            mimeType: detectedMimeType,
            width,
            height,
            imageHash: createHash('sha256').update(buffer).digest('hex'),
        };
    } catch (error) {
        if (error instanceof Error && error.name === 'ServiceError') throw error;
        const message = error instanceof Error ? error.message.toLowerCase() : '';
        if (message.includes('pixel limit')) {
            throw safeError(
                413,
                'image_dimensions_too_large',
                'Screenshot dimensions are too large for safe OCR processing.',
                false,
                'validation',
            );
        }
        throw safeError(422, 'invalid_image', 'Screenshot could not be decoded safely.', false, 'validation');
    }
}
