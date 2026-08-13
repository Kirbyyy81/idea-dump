const recipientReferenceLabel = /\bRECIPIENT\s+(?:REFERENCE|REF)(?:\s+(?:ID|NO\.?))?\b/i;
const fieldBoundary = /^(?:AMOUNT|TOTAL|DATE|TIME|MERCHANT|PAYEE|RECIPIENT|SENDER|REFERENCE|REF|AVAILABLE\s+BALANCE|CURRENT\s+BALANCE)\b/i;

function cleanRecipientReference(value: string) {
    const cleaned = value
        .replace(/^[\s:\-]+/, '')
        .replace(/^[\u00a7\u2030\u25a1]\s*/, '')
        .replace(/^(?:9|&|@|>|\()\s+(?=\S{2})/, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 200);
    return /^(?:copy|copied)$/i.test(cleaned) ? null : cleaned || null;
}

export function extractFinanceRecipientReference(text: string) {
    const lines = text
        .normalize('NFKC')
        .split(/\r?\n/)
        .map((line) => line.trim());

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        const label = recipientReferenceLabel.exec(line);
        if (!label) continue;

        const sameLine = cleanRecipientReference(line.slice((label.index ?? 0) + label[0].length));
        if (sameLine) return sameLine;

        for (let nextIndex = index + 1; nextIndex < lines.length && nextIndex <= index + 2; nextIndex += 1) {
            const nextLine = lines[nextIndex];
            if (!nextLine) continue;
            if (fieldBoundary.test(nextLine)) break;
            const nextValue = cleanRecipientReference(nextLine);
            if (nextValue) return nextValue;
        }
    }

    return null;
}

export function mergeFinanceRecipientReferenceIntoNotes(
    recipientReference: string | null | undefined,
    notes: string | null | undefined,
) {
    const reference = recipientReference?.trim() || '';
    const existingNotes = notes?.trim() || '';
    if (!reference) return existingNotes || null;
    if (!existingNotes) return reference;
    if (existingNotes === reference || existingNotes.split(/\r?\n/).includes(reference)) {
        return existingNotes;
    }
    return `${reference}\n${existingNotes}`;
}
