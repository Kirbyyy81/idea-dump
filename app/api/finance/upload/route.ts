import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeFinance, jsonError } from '@/lib/finance/api';
import { recognizeFinanceScreenshot } from '@/lib/finance/ocr';
import { parseFinanceText } from '@/lib/finance/parser';
import { FinanceAccount, FinanceRule } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

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
    let intakeId: string | null = null;
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const formData = await request.formData();
        const file = formData.get('screenshot');
        if (!(file instanceof File)) return jsonError('Choose a screenshot to upload');
        if (!ACCEPTED_IMAGE_TYPES.has(file.type)) return jsonError('Use a PNG, JPEG, or WebP screenshot');
        if (file.size <= 0 || file.size > MAX_IMAGE_SIZE) return jsonError('Screenshot must be between 1 byte and 10 MB');

        const image = Buffer.from(await file.arrayBuffer());
        const imageHash = createHash('sha256').update(image).digest('hex');
        const admin = createAdminClient();
        const { data: duplicateIntake, error: duplicateError } = await admin
            .from('finance_intake_items')
            .select('id, status')
            .eq('user_id', session.user.id)
            .eq('image_hash', imageHash)
            .maybeSingle();
        if (duplicateError) throw duplicateError;
        if (duplicateIntake) {
            return NextResponse.json(
                { error: 'This exact screenshot has already been processed', intake_id: duplicateIntake.id },
                { status: 409 }
            );
        }

        const { data: intake, error: intakeError } = await admin
            .from('finance_intake_items')
            .insert({ user_id: session.user.id, source: 'screenshot', status: 'processing', image_hash: imageHash })
            .select('*')
            .single();
        if (intakeError) {
            if (intakeError.code === '23505') return jsonError('This exact screenshot has already been processed', 409);
            throw intakeError;
        }
        intakeId = intake.id;

        await admin.from('finance_processing_events').insert({
            user_id: session.user.id,
            intake_item_id: intakeId,
            event_type: 'ocr_started',
            detail: { mime_type: file.type, size_bytes: file.size },
        });

        const ocrText = await recognizeFinanceScreenshot(image);
        if (!ocrText) throw new Error('No readable text was found in the screenshot');

        const [accountsResult, rulesResult] = await Promise.all([
            admin.from('finance_accounts').select('*').eq('user_id', session.user.id).eq('is_archived', false),
            admin.from('finance_rules').select('*').eq('user_id', session.user.id).eq('is_active', true),
        ]);
        if (accountsResult.error) throw accountsResult.error;
        if (rulesResult.error) throw rulesResult.error;

        const parsed = parseFinanceText(
            ocrText,
            (rulesResult.data || []) as FinanceRule[],
            (accountsResult.data || []).map((account) => ({ ...account, opening_balance: Number(account.opening_balance) })) as FinanceAccount[]
        );

        if (parsed.payload.amount && parsed.payload.transaction_date) {
            const { data: possibleDuplicates, error: transactionError } = await admin
                .from('finance_transactions')
                .select('id, merchant')
                .eq('user_id', session.user.id)
                .eq('amount', parsed.payload.amount)
                .eq('transaction_date', parsed.payload.transaction_date)
                .neq('status', 'rejected')
                .limit(10);
            if (transactionError) throw transactionError;
            const merchantKey = parsed.payload.merchant?.toLowerCase().replace(/\W/g, '') || '';
            const duplicate = (possibleDuplicates || []).find((transaction) => {
                const existingKey = transaction.merchant?.toLowerCase().replace(/\W/g, '') || '';
                return !merchantKey || !existingKey || merchantKey === existingKey;
            });
            parsed.payload.duplicate_transaction_id = duplicate?.id ?? null;
        }

        const canAutoConfirm = parsed.confidence >= 0.9
            && Boolean(parsed.matchedRuleId)
            && Boolean(parsed.payload.amount)
            && Boolean(parsed.payload.transaction_date)
            && Boolean(parsed.payload.direction)
            && Boolean(parsed.payload.account_id)
            && (parsed.payload.direction === 'transfer' || Boolean(parsed.payload.category_id))
            && !parsed.payload.duplicate_transaction_id;

        const { data: candidate, error: candidateError } = await admin
            .from('finance_candidate_transactions')
            .insert({
                user_id: session.user.id,
                intake_item_id: intakeId,
                payload: parsed.payload,
                confidence: parsed.confidence,
                matched_rule_id: parsed.matchedRuleId,
                status: canAutoConfirm ? 'accepted' : 'pending',
            })
            .select('*')
            .single();
        if (candidateError) throw candidateError;

        let transaction = null;
        if (canAutoConfirm) {
            const { data, error } = await admin
                .from('finance_transactions')
                .insert({
                    user_id: session.user.id,
                    account_id: parsed.payload.account_id,
                    category_id: parsed.payload.category_id,
                    intake_item_id: intakeId,
                    direction: parsed.payload.direction,
                    amount: parsed.payload.amount,
                    merchant: parsed.payload.merchant,
                    transaction_date: parsed.payload.transaction_date,
                    notes: parsed.payload.reference ? `Reference: ${parsed.payload.reference}` : null,
                    source: 'screenshot',
                    status: 'confirmed',
                })
                .select('*')
                .single();
            if (error) throw error;
            transaction = data;
        }

        const finalStatus = canAutoConfirm ? 'completed' : 'review';
        const processedAt = new Date().toISOString();
        const { data: updatedIntake, error: updateError } = await admin
            .from('finance_intake_items')
            .update({ status: finalStatus, ocr_text: ocrText, processed_at: processedAt, updated_at: processedAt })
            .eq('id', intakeId)
            .eq('user_id', session.user.id)
            .select('*')
            .single();
        if (updateError) throw updateError;

        await admin.from('finance_processing_events').insert({
            user_id: session.user.id,
            intake_item_id: intakeId,
            event_type: canAutoConfirm ? 'auto_confirmed' : 'sent_to_review',
            detail: { candidate_id: candidate.id, confidence: parsed.confidence, matched_rules: parsed.payload.matched_rule_names },
        });

        return NextResponse.json({
            data: { intake: updatedIntake, candidate, transaction, auto_confirmed: canAutoConfirm },
        }, { status: 201 });
    } catch (error) {
        console.error('Error processing finance screenshot:', error);
        if (intakeId) {
            const admin = createAdminClient();
            const now = new Date().toISOString();
            await admin
                .from('finance_intake_items')
                .update({
                    status: 'failed',
                    error_message: error instanceof Error ? error.message : 'Screenshot processing failed',
                    processed_at: now,
                    updated_at: now,
                })
                .eq('id', intakeId);
        }
        return jsonError(error instanceof Error ? error.message : 'Failed to process screenshot', 500);
    }
}
