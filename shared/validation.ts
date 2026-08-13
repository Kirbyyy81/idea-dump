export function isTextWithinLength(value: string, maxLength: number): boolean {
    return value.trim().length <= maxLength;
}
