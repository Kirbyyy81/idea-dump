import sharp from 'sharp';
import type { FinanceContext } from '../../src/contracts.js';
import type { ValidatedImage } from '../../src/image.js';

// Generated test artwork only. No customer receipt or OCR dump is committed.
export async function sharedImage(width = 924, transparent = false, anchors = true): Promise<ValidatedImage> {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="924" height="1156">
    ${transparent ? '' : '<rect width="924" height="1156" fill="#f7f7f7"/>'}
    <rect width="924" height="442" fill="blue"/>
    <g fill="white" font-family="Arial" text-anchor="middle">
    <text x="462" y="100" font-size="48">Ryt Bank</text>
    <text x="462" y="195" font-size="58">RM 17.25</text>
    <text x="462" y="245" font-size="28">9 Sep 2026, 1:54 PM</text></g>
    <rect x="30" y="312" width="868" height="490" rx="30" fill="white"/>
    ${anchors ? '<rect x="30" y="487" width="868" height="4" fill="#ddd"/>' : ''}
    <g font-family="Arial" font-size="30" fill="#222">
    <text x="80" y="431">LOGO</text><text x="214" y="391">Recipient</text>
    <text x="214" y="443">SYNTHETIC CORNER SHOP</text>
    <text x="66" y="550">Reference ID</text><text x="66" y="603">SYN260909123ABC</text>
    <text x="66" y="703">Recipient reference</text><text x="66" y="755">Transfer</text></g>
    ${anchors ? '<rect x="30" y="820" width="868" height="206" rx="35" fill="#adf7f0"/>' : ''}
    <text x="215" y="890" font-size="30">Join Ryt Bank! Earn interest, paid daily.</text></svg>`;
    const buffer = await sharp(Buffer.from(svg)).resize({ width }).png().toBuffer();
    return { buffer, width, height: Math.round(width * 1156 / 924), mimeType: 'image/png', originalFilename: 'receipt.png', imageHash: 'a'.repeat(64) };
}

export const receiptContext: FinanceContext = {
    sources: [{ id: '11111111-1111-4111-8111-111111111111', name: 'Ryt Bank', filename_aliases: ['Ryt Bank'], ocr_aliases: ['Ryt Bank'], is_archived: false }],
    sourceTemplates: [], fieldTemplates: [], rules: [], fieldLearningRules: [], payees: [],
};
export const baselineText = '0) Recipient\nbuitNow | YNTHETIC CORNER SHOP\nReference ID\nSYN260909123ABC\nRecipient reference\nTransfer\nJoin Ryt Bank! Earn interest, paid daily.\nDownload now at rytbank.my';
export const regionTexts = ['Ryt Bank\nRM 17.25\n9 Sep 2026, 1:54 PM', 'Recipient\nSYNTHETIC CORNER SHOP', 'Reference ID\nSYN260909123ABC\nRecipient reference\nTransfer'];
