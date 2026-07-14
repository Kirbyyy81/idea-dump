import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    authorizeFinance,
    isFinanceTextWithinLength,
    isFinanceUuid,
    jsonError,
    readFinanceJsonObject,
    toRequiredText,
} from '@/lib/finance/api';
import {
    getFinanceSourcePreset,
    normalizeFinanceSourceAliases,
} from '@/lib/finance/sourceDetection';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const admin = createAdminClient();
        const { data, error } = await admin
            .from('dim_finance_sources')
            .select('*')
            .eq('user_id', session.user.id)
            .order('is_archived')
            .order('name');
        if (error) throw error;
        return NextResponse.json({ data: data || [] });
    } catch (error) {
        console.error('Error fetching finance sources:', error);
        return jsonError('Failed to fetch finance sources', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const name = toRequiredText(body.name);
        if (!name) return jsonError('Source name is required');
        if (!isFinanceTextWithinLength(body.name, 120)) return jsonError('Source name must be 120 characters or fewer');
        const preset = getFinanceSourcePreset(name);
        const filenameAliases = body.filename_aliases === undefined
            ? preset.filenameAliases
            : normalizeFinanceSourceAliases(body.filename_aliases);
        const ocrAliases = body.ocr_aliases === undefined
            ? preset.ocrAliases
            : normalizeFinanceSourceAliases(body.ocr_aliases);
        if (!filenameAliases) return jsonError('Filename aliases must contain up to 20 non-empty values of 120 characters or fewer');
        if (!ocrAliases) return jsonError('OCR aliases must contain up to 20 non-empty values of 120 characters or fewer');

        const admin = createAdminClient();
        const { data, error } = await admin
            .from('dim_finance_sources')
            .insert({
                user_id: session.user.id,
                name,
                filename_aliases: filenameAliases,
                ocr_aliases: ocrAliases,
            })
            .select('*')
            .single();
        if (error) {
            if (error.code === '23505') return jsonError('This source already exists. Restore it if it is archived.', 409);
            throw error;
        }
        return NextResponse.json({ data }, { status: 201 });
    } catch (error) {
        console.error('Error creating finance source:', error);
        return jsonError('Failed to create finance source', 500);
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const id = toRequiredText(body.id);
        if (!id) return jsonError('Source ID is required');
        if (!isFinanceUuid(id)) return jsonError('Source ID must be a valid UUID');

        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
        if (body.name !== undefined) {
            const name = toRequiredText(body.name);
            if (!name) return jsonError('Source name is required');
            if (!isFinanceTextWithinLength(body.name, 120)) return jsonError('Source name must be 120 characters or fewer');
            updates.name = name;
        }
        if (body.is_archived !== undefined) {
            if (typeof body.is_archived !== 'boolean') return jsonError('Archived state must be true or false');
            updates.is_archived = body.is_archived;
        }
        if (body.filename_aliases !== undefined) {
            const aliases = normalizeFinanceSourceAliases(body.filename_aliases);
            if (!aliases) return jsonError('Filename aliases must contain up to 20 non-empty values of 120 characters or fewer');
            updates.filename_aliases = aliases;
        }
        if (body.ocr_aliases !== undefined) {
            const aliases = normalizeFinanceSourceAliases(body.ocr_aliases);
            if (!aliases) return jsonError('OCR aliases must contain up to 20 non-empty values of 120 characters or fewer');
            updates.ocr_aliases = aliases;
        }
        if (Object.keys(updates).length === 1) return jsonError('No source changes were provided');

        const admin = createAdminClient();
        if (body.is_archived !== undefined) {
            const combinedFields = Object.keys(updates).filter((key) => !['updated_at', 'is_archived'].includes(key));
            if (combinedFields.length > 0) return jsonError('Archive or restore a source separately from other edits');

            const { data, error } = await admin
                .rpc('finance_set_source_archived', {
                    p_user_id: session.user.id,
                    p_source_id: id,
                    p_is_archived: body.is_archived,
                })
                .single();
            if (error) {
                if (error.code === 'P0002') return jsonError('Source not found', 404);
                if (error.code === '23514' || error.code === '40001') return jsonError(error.message, 409);
                throw error;
            }
            return NextResponse.json({ data });
        }

        const { data, error } = await admin
            .from('dim_finance_sources')
            .update(updates)
            .eq('id', id)
            .eq('user_id', session.user.id)
            .select('*')
            .maybeSingle();
        if (error) {
            if (error.code === '23505') return jsonError('This source name already exists', 409);
            throw error;
        }
        if (!data) return jsonError('Source not found', 404);
        return NextResponse.json({ data });
    } catch (error) {
        console.error('Error updating finance source:', error);
        return jsonError('Failed to update finance source', 500);
    }
}

export const PUT = PATCH;

export async function DELETE(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const id = request.nextUrl.searchParams.get('id');
        const confirmed = request.nextUrl.searchParams.get('confirm') === 'true';
        if (!id) return jsonError('Source ID is required');
        if (!isFinanceUuid(id)) return jsonError('Source ID must be a valid UUID');
        if (!confirmed) return jsonError('Permanent deletion requires explicit confirmation', 409);

        const admin = createAdminClient();
        const { data, error } = await admin.rpc('finance_delete_source', {
            p_user_id: session.user.id,
            p_source_id: id,
        });
        if (error) {
            if (error.code === 'P0001' || error.code === '23503') {
                return jsonError(error.message || 'Referenced sources cannot be deleted', 409);
            }
            throw error;
        }
        if (!data) return jsonError('Source not found', 404);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting finance source:', error);
        return jsonError('Failed to delete finance source', 500);
    }
}
