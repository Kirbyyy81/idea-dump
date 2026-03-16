export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev';
export const VERSION_CODE = process.env.NEXT_PUBLIC_VERSION_CODE ?? 'dev';
export const LAST_UPDATED = process.env.NEXT_PUBLIC_LAST_UPDATED ?? '';

export function shortVersionCode(code: string) {
    if (!code || code === 'dev') return code || 'dev';
    return code.slice(0, 8);
}
