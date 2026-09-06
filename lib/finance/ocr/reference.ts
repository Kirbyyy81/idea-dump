import { receiptReferenceValue } from '@/lib/finance/ocr/receiptPatterns';
interface ReferenceCandidate {
    value: string;
    labelRank: number;
    lineDistance: number;
}

const referenceLabelPattern = /\b(REFERENCE(?:\s+(?:ID|NO\.?))?|REF(?:\s+(?:ID|NO\.?))?)(?![A-Z])/g;
const fieldBoundaryPattern = /^(?:AMOUNT|TOTAL|DATE|TIME|MERCHANT|RECIPIENT|PAYEE|SENDER|AVAILABLE\s+BALANCE|CURRENT\s+BALANCE)\b/;

function referenceLabelRank(label: string) {
    const normalized = label.replace(/\s+/g, ' ').replace(/\.$/, '');
    const isQualified = /\s(?:ID|NO)$/.test(normalized);
    if (normalized.startsWith('REFERENCE')) return isQualified ? 0 : 2;
    return isQualified ? 1 : 3;
}

function referenceTokens(value: string) {
    const tokens = value.match(/[A-Z0-9-]+/g) ?? [];
    return tokens.filter((token) => (
        token.length >= 5
        && token.length <= 200
        && /[0-9]/.test(token)
        && !token.startsWith('-')
        && !token.endsWith('-')
    ));
}

function windowCandidates(
    value: string,
    labelRank: number,
    lineDistance: number,
): ReferenceCandidate[] {
    return Array.from(new Set(referenceTokens(value))).map((candidate) => ({
        value: candidate,
        labelRank,
        lineDistance,
    }));
}

export function extractFinanceReferenceNumber(text: string) {
    for (const label of ['reference id', 'wallet ref', 'reference no', 'transaction no'] as const) {
        for (let maxLines = 3; maxLines >= 1; maxLines -= 1) {
            const values = new Set<string>();
            for (const placement of ['inline', 'after', 'before'] as const) {
                const value = receiptReferenceValue(text, {
                    type: 'reference_label', label, placement, max_lines: maxLines, join: 'concat',
                });
                if (value) values.add(value);
            }
            if (values.size > 1) return null;
            if (values.size === 1) return [...values][0];
        }
    }
    const lines = text
        .normalize('NFKC')
        .toUpperCase()
        .split(/\r?\n/)
        .map((line) => line.trim());
    const candidates: ReferenceCandidate[] = [];

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const line = lines[lineIndex];
        for (const labelMatch of Array.from(line.matchAll(referenceLabelPattern))) {
            const labelPrefix = line.slice(0, labelMatch.index ?? 0);
            if (/\bRECIPIENT\s*$/.test(labelPrefix)) continue;
            const label = labelMatch[1];
            const labelRank = referenceLabelRank(label);
            const sameLineCandidates = windowCandidates(
                line.slice((labelMatch.index ?? 0) + labelMatch[0].length),
                labelRank,
                0,
            );
            if (sameLineCandidates.length > 0) {
                candidates.push(...sameLineCandidates);
                continue;
            }

            let nonEmptyLinesSeen = 0;
            for (let nextIndex = lineIndex + 1; nextIndex < lines.length; nextIndex += 1) {
                const nextLine = lines[nextIndex];
                if (!nextLine) continue;
                nonEmptyLinesSeen += 1;
                if (fieldBoundaryPattern.test(nextLine)) break;
                const nextLineCandidates = windowCandidates(
                    nextLine,
                    labelRank,
                    nonEmptyLinesSeen,
                );
                if (nextLineCandidates.length > 0) {
                    candidates.push(...nextLineCandidates);
                    break;
                }
                if (nonEmptyLinesSeen === 2) break;
            }
        }
    }

    candidates.sort((left, right) => (
        left.labelRank - right.labelRank
        || left.lineDistance - right.lineDistance
        || right.value.length - left.value.length
    ));
    const best = candidates[0];
    if (!best) return null;
    const equallyRankedValues = new Set(
        candidates
            .filter((candidate) => (
                candidate.labelRank === best.labelRank
                && candidate.lineDistance === best.lineDistance
                && candidate.value.length === best.value.length
            ))
            .map((candidate) => candidate.value)
    );
    return equallyRankedValues.size === 1 ? best.value : null;
}
