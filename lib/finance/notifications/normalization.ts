/** Normalizes a working copy only; raw notification text defines replay identity. */
export function normalizeFinanceNotificationText(value: string): string {
    return value.normalize('NFKC').replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ').trim();
}
