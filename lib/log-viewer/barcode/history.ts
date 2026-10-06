export const BARCODE_HISTORY_LIMIT = 7;
export const BARCODE_INPUT_LIMIT = 256;
export const BARCODE_STORAGE_PREFIX = 'idea-dump:barcode-generator:v1:';

export function barcodeInputError(value: string): string | undefined {
    if (!value) return undefined;
    if (/[^0-9]/.test(value)) return 'Use numbers only, without spaces or punctuation.';
    if (value.length > BARCODE_INPUT_LIMIT) return `Use ${BARCODE_INPUT_LIMIT} digits or fewer.`;
    return undefined;
}

export function recentBarcodes(values: unknown): string[] {
    if (!Array.isArray(values)) return [];
    const result: string[] = [];
    for (const value of values) {
        if (typeof value !== 'string' || !value || barcodeInputError(value) || result.includes(value)) continue;
        result.push(value);
        if (result.length === BARCODE_HISTORY_LIMIT) break;
    }
    return result;
}

export function parseBarcodeHistory(raw: string | null): string[] {
    try {
        const record: unknown = JSON.parse(raw ?? 'null');
        if (!record || typeof record !== 'object' || !('version' in record) || record.version !== 1 || !('values' in record)) return [];
        return recentBarcodes(record.values);
    } catch {
        return [];
    }
}

export function serializeBarcodeHistory(values: string[]): string {
    return JSON.stringify({ version: 1, values: recentBarcodes(values) });
}
