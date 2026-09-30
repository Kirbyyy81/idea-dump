export const COMPANION_TOKEN = /^idc_[a-f0-9]{64}$/;
export const COMPANION_PROOF = /^[a-f0-9]{64}$/;
export const COMPANION_CODE = /^[A-F0-9]{8}$/;
export const COMPANION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function pairingLabel(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 80
        && !/[\x00-\x1f\x7f]/.test(value) ? value.trim() : null;
}
export function matches(value: unknown, pattern: RegExp): value is string {
    return typeof value === 'string' && pattern.test(value);
}
