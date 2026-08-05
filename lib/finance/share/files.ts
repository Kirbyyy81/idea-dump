'use client';

export const MAX_FINANCE_SHARE_FILES = 10;
export const MAX_FINANCE_SHARE_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_FINANCE_SHARE_BATCH_BYTES =
    MAX_FINANCE_SHARE_FILES * MAX_FINANCE_SHARE_FILE_BYTES;
export const MAX_FINANCE_SHARE_IMAGE_DIMENSION = 12_000;
export const MAX_FINANCE_SHARE_IMAGE_PIXELS = 25_000_000;
export const FINANCE_SHARE_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;

export interface FinanceSharedFileValidation {
    detectedMimeType: typeof FINANCE_SHARE_MIME_TYPES[number] | null;
    height: number | null;
    isValid: boolean;
    message: string | null;
    width: number | null;
}

function hasBytes(bytes: Uint8Array, offset: number, expected: number[]) {
    return expected.every((value, index) => bytes[offset + index] === value);
}

export function detectFinanceShareImageType(bytes: Uint8Array) {
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

export async function validateFinanceSharedFile(file: File): Promise<FinanceSharedFileValidation> {
    const normalizedType = file.type.toLowerCase();
    if (!file.size) {
        return {
            detectedMimeType: null,
            height: null,
            isValid: false,
            message: 'This file is empty.',
            width: null,
        };
    }
    if (file.size > MAX_FINANCE_SHARE_FILE_BYTES) {
        return {
            detectedMimeType: null,
            height: null,
            isValid: false,
            message: 'This image is larger than 4 MB.',
            width: null,
        };
    }
    if (!FINANCE_SHARE_MIME_TYPES.includes(normalizedType as typeof FINANCE_SHARE_MIME_TYPES[number])) {
        return {
            detectedMimeType: null,
            height: null,
            isValid: false,
            message: 'Use a PNG, JPEG, or WebP image.',
            width: null,
        };
    }

    const detectedMimeType = detectFinanceShareImageType(
        new Uint8Array(await file.slice(0, 12).arrayBuffer())
    );
    if (!detectedMimeType || detectedMimeType !== normalizedType) {
        return {
            detectedMimeType,
            height: null,
            isValid: false,
            message: 'The image content does not match its declared file type.',
            width: null,
        };
    }

    try {
        const bitmap = await createImageBitmap(file);
        const width = bitmap.width;
        const height = bitmap.height;
        bitmap.close();
        if (
            !width
            || !height
            || width > MAX_FINANCE_SHARE_IMAGE_DIMENSION
            || height > MAX_FINANCE_SHARE_IMAGE_DIMENSION
            || width * height > MAX_FINANCE_SHARE_IMAGE_PIXELS
        ) {
            return {
                detectedMimeType,
                height,
                isValid: false,
                message: 'The image dimensions are too large for safe processing.',
                width,
            };
        }
        return {
            detectedMimeType,
            height,
            isValid: true,
            message: null,
            width,
        };
    } catch {
        return {
            detectedMimeType,
            height: null,
            isValid: false,
            message: 'This image could not be decoded safely.',
            width: null,
        };
    }
}

export function formatFinanceShareFileSize(bytes: number) {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.ceil(bytes / 1024))} KB`;
}
