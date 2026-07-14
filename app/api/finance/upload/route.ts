import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeFinance, isFinanceSerializationError, jsonError } from '@/lib/finance/api';
import {
    FINANCE_AUTO_CONFIRM_THRESHOLD,
    FINANCE_V1_CURRENCY,
} from '@/lib/finance/constants';
import {
    assessFinanceDuplicate,
    financeDuplicateColumns,
} from '@/lib/finance/duplicates';
import {
    hashNormalizedFinanceText,
    normalizeFinanceOcrText,
} from '@/lib/finance/normalizer';
import { recognizeFinanceScreenshot } from '@/lib/finance/ocr';
import { parseFinanceText } from '@/lib/finance/parser';
import {
    FinanceCandidateTransaction,
    FinanceIntakeItem,
    FinanceRule,
    FinanceSource,
    FinanceTransaction,
} from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
const MAX_REQUEST_SIZE = MAX_IMAGE_SIZE + 256 * 1024;
const MAX_IMAGE_DIMENSION = 12_000;
const MAX_IMAGE_PIXELS = 25_000_000;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

interface BeginScreenshotIntakeResult {
    started: boolean;
    retried: boolean;
    reason?: string;
    intake: FinanceIntakeItem;
}

interface ConfirmCandidateResult {
    confirmed: boolean;
    reason?: string;
    transaction?: FinanceTransaction;
    candidate: FinanceCandidateTransaction;
    intake: FinanceIntakeItem;
}

function hasBytes(bytes: Uint8Array, offset: number, expected: number[]) {
    return expected.every((value, index) => bytes[offset + index] === value);
}

function detectFinanceImageType(bytes: Uint8Array) {
    if (bytes.length >= 3 && hasBytes(bytes, 0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
    if (bytes.length >= 8 && hasBytes(bytes, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
        return 'image/png';
    }
    if (
        bytes.length >= 12
        && hasBytes(bytes, 0, [0x52, 0x49, 0x46, 0x46])
        && hasBytes(bytes, 8, [0x57, 0x45, 0x42, 0x50])
    ) {
        return 'image/webp';
    }
    return null;
}

function readFinanceImageDimensions(image: Buffer, mimeType: string) {
    if (mimeType === 'image/png' && image.length >= 24) {
        return { width: image.readUInt32BE(16), height: image.readUInt32BE(20) };
    }
    if (mimeType === 'image/jpeg' && image.length >= 4) {
        let offset = 2;
        const startOfFrameMarkers = new Set([
            0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7,
            0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
        ]);
        while (offset + 3 < image.length) {
            if (image[offset] !== 0xff) {
                offset += 1;
                continue;
            }
            const marker = image[offset + 1];
            offset += 2;
            if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
            if (marker === 0xd9 || marker === 0xda || offset + 2 > image.length) break;
            const segmentLength = image.readUInt16BE(offset);
            if (segmentLength < 2 || offset + segmentLength > image.length) break;
            if (startOfFrameMarkers.has(marker) && segmentLength >= 7) {
                return {
                    width: image.readUInt16BE(offset + 5),
                    height: image.readUInt16BE(offset + 3),
                };
            }
            offset += segmentLength;
        }
        return null;
    }
    if (mimeType === 'image/webp' && image.length >= 30) {
        const chunk = image.toString('ascii', 12, 16);
        if (chunk === 'VP8X') {
            return {
                width: 1 + image.readUIntLE(24, 3),
                height: 1 + image.readUIntLE(27, 3),
            };
        }
        if (chunk === 'VP8 ' && image.length >= 30) {
            return {
                width: image.readUInt16LE(26) & 0x3fff,
                height: image.readUInt16LE(28) & 0x3fff,
            };
        }
        if (chunk === 'VP8L' && image.length >= 25 && image[20] === 0x2f) {
            return {
                width: 1 + image[21] + ((image[22] & 0x3f) << 8),
                height: 1 + (image[22] >> 6) + (image[23] << 2) + ((image[24] & 0x0f) << 10),
            };
        }
    }
    return null;
}

function sanitizeFinanceFilename(value: string) {
    const basename = value.split(/[\\/]/).pop() ?? '';
    return basename
        .normalize('NFKC')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 255);
}

export async function GET() {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const admin = createAdminClient();
        const { data, error } = await admin
            .from('finance_intake_items')
            .select('id, source, status, received_at, processed_at, error_message')
            .eq('user_id', session.user.id)
            .order('received_at', { ascending: false })
            .limit(20);
        if (error) throw error;
        return NextResponse.json({ data: data || [] });
    } catch (error) {
        console.error('Error fetching finance intake history:', error);
        return jsonError('Failed to fetch screenshot history', 500);
    }
}

export async function POST(request: NextRequest) {
    let userId: string | null = null;
    let intakeId: string | null = null;
    let candidateId: string | null = null;
    let resolved = false;
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        userId = session.user.id;
        const contentLengthHeader = request.headers.get('content-length');
        if (!contentLengthHeader) return jsonError('Screenshot uploads require a Content-Length header', 411);
        if (!/^\d+$/.test(contentLengthHeader)) return jsonError('Screenshot Content-Length is invalid');
        const contentLength = Number(contentLengthHeader);
        if (!Number.isSafeInteger(contentLength) || contentLength <= 0) return jsonError('Screenshot Content-Length is invalid');
        if (contentLength > MAX_REQUEST_SIZE) {
            return jsonError('Screenshot request must be about 4.25 MB or smaller', 413);
        }
        if (!request.headers.get('content-type')?.toLowerCase().startsWith('multipart/form-data;')) {
            return jsonError('Screenshot upload must use multipart form data', 415);
        }
        const formData = await request.formData();
        const file = formData.get('screenshot');
        if (!(file instanceof File)) return jsonError('Choose a screenshot to upload');
        const originalFilename = sanitizeFinanceFilename(file.name);
        if (!originalFilename) return jsonError('Screenshot filename is invalid');
        if (!ACCEPTED_IMAGE_TYPES.has(file.type)) return jsonError('Use a PNG, JPEG, or WebP screenshot');
        if (file.size <= 0 || file.size > MAX_IMAGE_SIZE) return jsonError('Screenshot must be between 1 byte and 4 MB');

        const image = Buffer.from(await file.arrayBuffer());
        const detectedImageType = detectFinanceImageType(image);
        if (!detectedImageType || detectedImageType !== file.type) {
            return jsonError('Screenshot content does not match its declared PNG, JPEG, or WebP file type');
        }
        const dimensions = readFinanceImageDimensions(image, detectedImageType);
        if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
            return jsonError('Screenshot dimensions could not be validated');
        }
        if (
            dimensions.width > MAX_IMAGE_DIMENSION
            || dimensions.height > MAX_IMAGE_DIMENSION
            || dimensions.width * dimensions.height > MAX_IMAGE_PIXELS
        ) {
            return jsonError('Screenshot dimensions are too large for safe OCR processing', 413);
        }
        const imageHash = createHash('sha256').update(image).digest('hex');
        const admin = createAdminClient();
        const { data: intakeStartData, error: intakeStartError } = await admin.rpc(
            'finance_begin_screenshot_intake',
            { p_user_id: session.user.id, p_image_hash: imageHash }
        );
        if (intakeStartError) throw intakeStartError;
        const intakeStart = intakeStartData as BeginScreenshotIntakeResult;
        if (!intakeStart?.started || !intakeStart.intake) {
            return NextResponse.json(
                {
                    error: intakeStart?.reason === 'failed_intake_has_lineage'
                        ? 'This failed screenshot has linked review data and cannot be reset automatically'
                        : 'This exact screenshot has already been processed or is currently processing',
                    intake_id: intakeStart?.intake?.id,
                    status: intakeStart?.intake?.status,
                },
                { status: 409 }
            );
        }
        const intake = intakeStart.intake;
        intakeId = intake.id;

        const { error: filenameUpdateError } = await admin
            .from('finance_intake_items')
            .update({ original_filename: originalFilename, updated_at: new Date().toISOString() })
            .eq('id', intakeId)
            .eq('user_id', session.user.id);
        if (filenameUpdateError) throw filenameUpdateError;

        const { error: startEventError } = await admin.from('finance_processing_events').insert({
            user_id: session.user.id,
            intake_item_id: intakeId,
            event_type: 'ocr_started',
            detail: { mime_type: file.type, size_bytes: file.size, original_filename: originalFilename },
        });
        if (startEventError) console.error('Failed to record finance OCR start event:', startEventError);

        const ocr = await recognizeFinanceScreenshot(image);
        if (!ocr.rawText.trim()) throw new Error('No readable text was found in the screenshot');
        const normalized = normalizeFinanceOcrText(ocr.rawText);
        if (!normalized.text) throw new Error('No readable text remained after normalization');
        const ocrTextHash = hashNormalizedFinanceText(normalized.text);
        const ocrCompletedAt = new Date().toISOString();

        const { error: ocrUpdateError } = await admin
            .from('finance_intake_items')
            .update({
                ocr_text: normalized.text,
                ocr_raw_text: ocr.rawText,
                ocr_normalized_text: normalized.text,
                ocr_confidence: ocr.confidence,
                ocr_text_hash: ocrTextHash,
                normalizer_version: normalized.version,
                updated_at: ocrCompletedAt,
            })
            .eq('id', intakeId)
            .eq('user_id', session.user.id)
            .select('*')
            .single();
        if (ocrUpdateError) throw ocrUpdateError;

        const { error: ocrEventError } = await admin.from('finance_processing_events').insert([
            {
                user_id: session.user.id,
                intake_item_id: intakeId,
                event_type: 'ocr_completed',
                detail: { confidence: ocr.confidence, character_count: ocr.rawText.length },
            },
            {
                user_id: session.user.id,
                intake_item_id: intakeId,
                event_type: 'normalization_completed',
                detail: {
                    normalizer_version: normalized.version,
                    character_count: normalized.text.length,
                    ocr_text_hash: ocrTextHash,
                },
            },
        ]);
        if (ocrEventError) console.error('Failed to record finance OCR events:', ocrEventError);

        const [sourcesResult, rulesResult, categoriesResult] = await Promise.all([
            admin.from('dim_finance_sources').select('*').eq('user_id', session.user.id).eq('is_archived', false),
            admin.from('finance_rules').select('*').eq('user_id', session.user.id).eq('is_active', true),
            admin.from('dim_finance_categories').select('id, type').eq('user_id', session.user.id).eq('is_archived', false),
        ]);
        if (sourcesResult.error) throw sourcesResult.error;
        if (rulesResult.error) throw rulesResult.error;
        if (categoriesResult.error) throw categoriesResult.error;

        const activeRules = (rulesResult.data || []) as FinanceRule[];
        const parsed = parseFinanceText(
            normalized.text,
            activeRules,
            (sourcesResult.data || []) as FinanceSource[],
            originalFilename
        );
        const { error: sourceEvidenceError } = await admin
            .from('finance_intake_items')
            .update({
                detected_source_id: parsed.payload.source_id,
                source_detection_signals: parsed.sourceDetectionSignals,
                updated_at: new Date().toISOString(),
            })
            .eq('id', intakeId)
            .eq('user_id', session.user.id);
        if (sourceEvidenceError) throw sourceEvidenceError;
        const assessment = await assessFinanceDuplicate({
            userId: session.user.id,
            intakeId,
            ocrTextHash,
            amount: parsed.payload.amount,
            currency: FINANCE_V1_CURRENCY,
            merchant: parsed.payload.merchant,
            transactionDate: parsed.payload.transaction_date,
            sourceId: parsed.payload.source_id,
            referenceNumber: parsed.payload.reference_number,
        });
        parsed.payload.duplicate_transaction_id = assessment.matchedTransactionId;

        const matchedRule = activeRules.find((rule) => rule.id === parsed.matchedRuleId);
        const hasStrongCategoryRule = (
            matchedRule?.match_type === 'exact_phrase'
            || matchedRule?.match_type === 'merchant_alias'
        ) && Boolean(
            matchedRule.category_id
            && matchedRule.category_id === parsed.payload.category_id
        );
        const hasValidCategory = (categoriesResult.data || []).some((category) => (
            category.id === parsed.payload.category_id && category.type === parsed.payload.direction
        ));
        const canAutoConfirm = parsed.confidence >= FINANCE_AUTO_CONFIRM_THRESHOLD
            && hasStrongCategoryRule
            && Boolean(parsed.payload.amount)
            && Boolean(parsed.payload.transaction_date)
            && Boolean(parsed.payload.direction)
            && Boolean(parsed.payload.source_id)
            && hasValidCategory
            && assessment.outcome === 'none';

        const { data: candidate, error: candidateError } = await admin
            .from('finance_candidate_transactions')
            .insert({
                user_id: session.user.id,
                intake_item_id: intakeId,
                payload: parsed.payload,
                confidence: parsed.confidence,
                matched_rule_id: parsed.matchedRuleId,
                status: 'pending',
                ...financeDuplicateColumns(assessment),
            })
            .select('*')
            .single();
        if (candidateError) throw candidateError;
        candidateId = candidate.id;

        const { error: parsedEventError } = await admin.from('finance_processing_events').insert([
            {
                user_id: session.user.id,
                intake_item_id: intakeId,
                event_type: 'parsing_completed',
                detail: {
                    candidate_id: candidate.id,
                    confidence: parsed.confidence,
                    source_detection_signals: parsed.sourceDetectionSignals,
                    fields_found: {
                        amount: parsed.payload.amount !== null,
                        merchant: parsed.payload.merchant !== null,
                        direction: parsed.payload.direction !== null,
                        transaction_date: parsed.payload.transaction_date !== null,
                        source: parsed.payload.source_id !== null,
                        category: parsed.payload.category_id !== null,
                        reference_number: parsed.payload.reference_number !== null,
                    },
                },
            },
            {
                user_id: session.user.id,
                intake_item_id: intakeId,
                event_type: 'duplicate_assessed',
                detail: {
                    candidate_id: candidate.id,
                    outcome: assessment.outcome,
                    score: assessment.score,
                    matched_transaction_id: assessment.matchedTransactionId,
                    signals: assessment.signals,
                },
            },
        ]);
        if (parsedEventError) console.error('Failed to record finance parse events:', parsedEventError);

        if (canAutoConfirm) {
            const { data: confirmationData, error: confirmError } = await admin.rpc('finance_confirm_candidate', {
                p_user_id: session.user.id,
                p_candidate_id: candidate.id,
                p_source_id: parsed.payload.source_id,
                p_category_id: parsed.payload.category_id,
                p_direction: parsed.payload.direction,
                p_amount: parsed.payload.amount,
                p_merchant: parsed.payload.merchant,
                p_transaction_date: parsed.payload.transaction_date,
                p_notes: null,
                p_currency: FINANCE_V1_CURRENCY,
                p_reference_number: parsed.payload.reference_number,
                p_allow_duplicate: false,
                p_duplicate_override_reason: null,
                p_confirmation_mode: 'automatic',
            });
            if (confirmError) throw confirmError;
            const confirmation = confirmationData as ConfirmCandidateResult;
            if (!confirmation?.confirmed || !confirmation.transaction) {
                resolved = true;
                return NextResponse.json({
                    data: {
                        intake: confirmation.intake,
                        candidate: confirmation.candidate,
                        transaction: null,
                        auto_confirmed: false,
                    },
                    warning: 'A possible duplicate was found during the final database check. Review it before confirming.',
                }, { status: 201 });
            }
            const confirmedTransaction = confirmation.transaction;
            resolved = true;
            return NextResponse.json({
                data: {
                    intake: confirmation.intake,
                    candidate: confirmation.candidate,
                    transaction: confirmedTransaction,
                    auto_confirmed: true,
                },
            }, { status: 201 });
        }

        const processedAt = new Date().toISOString();
        const { data: updatedIntake, error: updateError } = await admin
            .from('finance_intake_items')
            .update({ status: 'review', processed_at: processedAt, updated_at: processedAt })
            .eq('id', intakeId)
            .eq('user_id', session.user.id)
            .select('*')
            .single();
        if (updateError) throw updateError;
        const { error: reviewEventError } = await admin.from('finance_processing_events').insert({
            user_id: session.user.id,
            intake_item_id: intakeId,
            event_type: 'sent_to_review',
            detail: {
                candidate_id: candidate.id,
                confidence: parsed.confidence,
                matched_rules: parsed.payload.matched_rule_names,
                duplicate_outcome: assessment.outcome,
            },
        });
        if (reviewEventError) console.error('Failed to record finance review event:', reviewEventError);
        resolved = true;

        return NextResponse.json({
            data: { intake: updatedIntake, candidate, transaction: null, auto_confirmed: false },
        }, { status: 201 });
    } catch (error) {
        console.error('Error processing finance screenshot:', error);
        const isUnreadable = error instanceof Error && /no readable text/i.test(error.message);
        const isConcurrent = isFinanceSerializationError(error);
        const safeMessage = isConcurrent
            ? 'Finance data changed concurrently. Retry the upload.'
            : isUnreadable
            ? error.message
            : candidateId
                ? 'Automatic processing could not finish. Review the saved candidate.'
                : 'Screenshot processing failed';
        let recoveryError: unknown = null;
        let recoveredCandidate: FinanceCandidateTransaction | null = null;
        if (candidateId && intakeId && userId && !resolved) {
            const admin = createAdminClient();
            const { data, error: candidateRecoveryError } = await admin
                .from('finance_candidate_transactions')
                .select('*, intake:finance_intake_items(*)')
                .eq('id', candidateId)
                .eq('intake_item_id', intakeId)
                .eq('user_id', userId)
                .maybeSingle();
            recoveryError = candidateRecoveryError;
            recoveredCandidate = data as FinanceCandidateTransaction | null;

            if (!candidateRecoveryError && recoveredCandidate?.status === 'accepted'
                && recoveredCandidate.confirmed_transaction_id) {
                const { data: recoveredTransaction, error: transactionRecoveryError } = await admin
                    .from('finance_transactions')
                    .select('*')
                    .eq('id', recoveredCandidate.confirmed_transaction_id)
                    .eq('user_id', userId)
                    .maybeSingle();
                if (!transactionRecoveryError && recoveredTransaction) {
                    return NextResponse.json({
                        data: {
                            intake: recoveredCandidate.intake,
                            candidate: recoveredCandidate,
                            transaction: recoveredTransaction as FinanceTransaction,
                            auto_confirmed: true,
                            recovered: true,
                        },
                    }, { status: 201 });
                }
                recoveryError = transactionRecoveryError || new Error('Confirmed transaction could not be recovered');
            }
        }
        if (intakeId && userId && !resolved && !recoveryError) {
            const admin = createAdminClient();
            const now = new Date().toISOString();
            const { error: updateError } = await admin
                .from('finance_intake_items')
                .update({
                    status: candidateId ? 'review' : 'failed',
                    error_message: safeMessage,
                    processed_at: now,
                    updated_at: now,
                })
                .eq('id', intakeId)
                .eq('user_id', userId)
                .eq('status', 'processing');
            recoveryError = updateError;
        }
        if (candidateId && intakeId && !recoveryError) {
            return NextResponse.json({
                data: {
                    intake: { id: intakeId, status: 'review' },
                    candidate: recoveredCandidate || { id: candidateId, status: 'pending' },
                    transaction: null,
                    auto_confirmed: false,
                    recoverable: true,
                },
                warning: safeMessage,
            }, { status: 202 });
        }
        return jsonError(safeMessage, isUnreadable ? 422 : isConcurrent ? 409 : 500);
    }
}
