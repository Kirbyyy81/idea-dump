import sharp from 'sharp';
import { detectFinanceSource, normalizeFinanceSourceSignal } from '@/lib/finance/ocr/sourceDetection';
import { rytTransactionText } from '@/lib/finance/ocr/receiptFormat';
import { parseFinanceText } from '@/lib/finance/ocr/parser';
import type { FinanceReceiptConflictField, FinanceReceiptProcessing } from '@/lib/types';
import type { FinanceContext } from './contracts.js';
import type { ValidatedImage } from './image.js';
import type { OcrResult } from './worker.js';

type Region = 'header' | 'recipient' | 'details';
interface Rect { left: number; top: number; width: number; height: number }
export interface RytLayout { header: Rect; recipient: Rect; details: Rect }

// Inspect a bounded thumbnail. Colour and card boundaries select the layout;
// the filename never supplies coordinates or authorises processing by itself.
export async function detectRytSharedLayout(buffer: Buffer): Promise<RytLayout | null> {
    const { data, info } = await sharp(buffer).flatten({ background: '#fff' }).removeAlpha()
        .resize({ width: 300, withoutEnlargement: true }).raw().toBuffer({ resolveWithObject: true });
    const { width: w, height: h, channels } = info;
    if (h < w * 0.9 || h > w * 2.6) return null;
    const pixel = (x: number, y: number) => {
        const n = (y * w + x) * channels;
        return [data[n], data[n + 1], data[n + 2]];
    };
    const fraction = (y: number, test: (r: number, g: number, b: number) => boolean) => {
        let count = 0;
        const left = Math.floor(w * 0.15), right = Math.floor(w * 0.85);
        for (let x = left; x < right; x++) { const [r, g, b] = pixel(x, y); if (test(r, g, b)) count++; }
        return count / (right - left);
    };
    const blue = (r: number, g: number, b: number) => b > 160 && r < 110 && g < 140 && b > g * 1.3;
    const white = (r: number, g: number, b: number) => Math.min(r, g, b) > 240;
    if (fraction(Math.floor(h * 0.04), blue) < 0.7 || fraction(Math.floor(h * 0.15), blue) < 0.5) return null;
    let top = -1, divider = -1, bottom = -1;
    for (let y = Math.floor(h * 0.18); y < h * 0.48; y++) {
        if (fraction(y, white) > 0.92 && fraction(y + 2, white) > 0.92) { top = y; break; }
    }
    if (top < 0) return null;
    for (let y = top + Math.floor(h * 0.07); y < h * 0.6; y++) {
        if (fraction(y, (r, g, b) => r > 180 && r < 240 && Math.abs(r - g) < 8 && Math.abs(g - b) < 8) > 0.7) { divider = y; break; }
    }
    if (divider < 0) return null;
    for (let y = divider + Math.floor(h * 0.12); y < h * 0.9; y++) {
        if (fraction(y, (r, g, b) => g > 200 && b > 190 && g - r > 30 && b - r > 20) > 0.7) { bottom = y; break; }
    }
    if (bottom < 0) return null;
    let x1 = w, x2 = 0, y1 = top, y2 = 0;
    for (let y = 1; y < top - 5; y++) for (let x = 2; x < w - 2; x++) {
        const [r, g, b] = pixel(x, y);
        if (r > 210 && g > 210 && b > 210) { x1 = Math.min(x1, x); x2 = Math.max(x2, x); y1 = Math.min(y1, y); y2 = Math.max(y2, y); }
    }
    if (x2 <= x1 || y2 <= y1) return null;
    const metadata = await sharp(buffer).metadata();
    const scaleX = metadata.width! / w, scaleY = metadata.height! / h;
    const rect = (left: number, top: number, right: number, end: number): Rect => {
        const x = Math.max(0, Math.floor(left * scaleX)), y = Math.max(0, Math.floor(top * scaleY));
        return { left: x, top: y, width: Math.min(metadata.width!, Math.ceil(right * scaleX)) - x, height: Math.min(metadata.height!, Math.ceil(end * scaleY)) - y };
    };
    return {
        header: rect(x1 - 8, y1 - 8, x2 + 9, y2 + 9),
        recipient: rect(w * 0.22, top + 3, w * 0.96, divider - 2),
        details: rect(w * 0.055, divider + 3, w * 0.96, bottom - 5),
    };
}

function baselineTransactionText(text: string) {
    const lines = rytTransactionText(text).split(/\r?\n/);
    // The final transaction field bounds the baseline even when OCR mangles
    // the banner's heading. Never append advertising as fallback evidence.
    const label = lines.findIndex((line) => /recipient\s+reference\b/i.test(line));
    if (label < 0) return '';
    const inline = lines[label].replace(/^.*?recipient\s+reference\b\s*[:\-]?\s*/i, '').trim();
    if (inline) return lines.slice(0, label + 1).join('\n');
    const value = lines.findIndex((line, index) => index > label && line.trim().length > 0);
    const end = value >= 0 && !/(?:paid\s+daily|download|earn|join|signature|computer generated|%)/i.test(lines[value]) ? value + 1 : label + 1;
    return lines.slice(0, end).join('\n');
}

const fields: FinanceReceiptConflictField[] = ['amount', 'transaction_date', 'payee_name', 'reference_number', 'direction', 'notes'];
export async function processRytReceipt(
    image: ValidatedImage, baseline: OcrResult, context: FinanceContext,
    recognize: (image: Buffer, mode?: 'block') => Promise<OcrResult>,
    deadline: number,
): Promise<{ text: string; processing: FinanceReceiptProcessing }> {
    const processing: FinanceReceiptProcessing = { format: 'unknown', detector_version: 1, failed_regions: [], conflicts: [] };
    const unchanged = { text: baseline.rawText, processing };
    const detection = detectFinanceSource(baseline.rawText, image.originalFilename, context.sources, context.sourceTemplates);
    const source = context.sources.find((item) => item.id === detection.sourceId);
    if (!source || source.is_archived || detection.hasConflict || normalizeFinanceSourceSignal(source.name) !== 'ryt bank') return unchanged;
    let layout: RytLayout | null;
    try { layout = await detectRytSharedLayout(image.buffer); } catch { return unchanged; }
    if (!layout) {
        if (/^Screenshot[_ -]/i.test(image.originalFilename)
            && /(?:paid from|from main account|status[^\n]*(?:completed|successful)|split with friends)/i.test(baseline.rawText)) processing.format = 'ryt_screenshot_v1';
        return unchanged;
    }
    if (!/reference\s+id/i.test(baseline.rawText) || !/recipient\s+reference/i.test(baseline.rawText)) return unchanged;
    processing.format = 'ryt_shared_v1';
    const original = baselineTransactionText(baseline.rawText);
    const pieces: Partial<Record<Region, string>> = {};
    for (const region of ['header', 'recipient', 'details'] as const) {
        try {
            if (Date.now() >= deadline) throw new Error('Region deadline reached');
            let pipeline = sharp(image.buffer).flatten({ background: '#fff' }).removeAlpha().extract(layout[region]).grayscale();
            if (region === 'header') pipeline = pipeline.normalize().negate({ alpha: false });
            const prepared = await pipeline.resize({ width: Math.min(1400, layout[region].width * 2) })
                .extend({ top: 12, bottom: 12, left: 12, right: 12, background: '#fff' }).png().toBuffer();
            const result = await recognize(prepared, 'block');
            if (!result.rawText.trim()) throw new Error('Empty region');
            pieces[region] = rytTransactionText(result.rawText);
        } catch { processing.failed_regions.push(region); }
    }
    // Keep independently readable baseline fields on partial failures. Never
    // add the advertising/footer section back to transaction parsing.
    const text = ['Ryt Bank', ...Object.values(pieces), original].join('\n');
    if (detectFinanceSource(text, image.originalFilename, context.sources, context.sourceTemplates).hasConflict) {
        processing.format = 'unknown';
        return unchanged;
    }
    const parse = (value: string) => parseFinanceText(value, [], context.sources, image.originalFilename, [], context.payees, [], [], processing).payload;
    const readings = [parse(original), ...Object.values(pieces).map(parse)];
    for (const field of fields) {
        const values = new Set(readings.map((row) => row[field]).filter((value) => value !== null)
            .map((value) => String(value).normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase()));
        if (values.size > 1) processing.conflicts.push(field);
    }
    return { text, processing };
}
