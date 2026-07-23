import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
    authorizeFinance,
    getOwnedFinanceCategory,
    getOwnedFinanceSource,
    isFinanceTransactionDirection,
    isFinanceTextWithinLength,
    isFinanceUuid,
    jsonError,
    readFinanceJsonObject,
    toFinanceInteger,
    toNullableText,
    toRequiredText,
} from '@/lib/finance/api';

export const dynamic = 'force-dynamic';

const matchTypes = ['exact_phrase', 'merchant_alias', 'keyword', 'account_hint'] as const;

function isMatchType(value: unknown): value is (typeof matchTypes)[number] {
    return matchTypes.includes(value as (typeof matchTypes)[number]);
}

export async function GET() {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const admin = createAdminClient();
        const { data, error } = await admin
            .from('finance_rule_suggestions')
            .select('*, category:dim_finance_categories(*), finance_source:dim_finance_sources(*)')
            .eq('user_id', session.user.id)
            .eq('status', 'pending')
            .order('evidence_count', { ascending: false })
            .order('created_at', { ascending: false });
        if (error) throw error;
        return NextResponse.json({ data: data || [] });
    } catch (error) {
        console.error('Error fetching finance rule suggestions:', error);
        return jsonError('Failed to fetch rule suggestions', 500);
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const id = toRequiredText(body.id);
        const name = toRequiredText(body.name);
        const pattern = toRequiredText(body.pattern);
        const categoryId = toRequiredText(body.category_id);
        const sourceId = toNullableText(body.source_id);
        if (!id) return jsonError('Suggestion ID is required');
        if (!isFinanceUuid(id)) return jsonError('Suggestion ID must be a valid UUID');
        if (!name) return jsonError('Rule name is required');
        if (!pattern) return jsonError('Match pattern is required');
        if (!isFinanceTextWithinLength(body.name, 120)) return jsonError('Rule name must be 120 characters or fewer');
        if (!isFinanceTextWithinLength(body.pattern, 500)) return jsonError('Rule pattern must be 500 characters or fewer');
        if (!categoryId) return jsonError('Category is required');
        if (!isFinanceUuid(categoryId)) return jsonError('Category ID must be a valid UUID');
        if (sourceId && !isFinanceUuid(sourceId)) return jsonError('Source ID must be a valid UUID');
        if (!isMatchType(body.match_type)) return jsonError('Select a valid match type');
        if (!isFinanceTransactionDirection(body.direction)) return jsonError('Select a valid direction');

        const category = await getOwnedFinanceCategory(session.user.id, categoryId);
        if (!category || category.is_archived) return jsonError('Choose an active category', 404);
        if (category.type !== body.direction) return jsonError('Category type must match the rule direction');
        if (sourceId) {
            const source = await getOwnedFinanceSource(session.user.id, sourceId);
            if (!source || source.is_archived) return jsonError('Choose an active source', 404);
        }

        const priority = body.priority === undefined ? 100 : toFinanceInteger(body.priority);
        if (priority === null) return jsonError('Priority must be a valid whole number');
        const admin = createAdminClient();
        const { data, error } = await admin
            .from('finance_rule_suggestions')
            .update({
                name,
                pattern,
                match_type: body.match_type,
                category_id: categoryId,
                source_id: sourceId,
                direction: body.direction,
                priority,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .eq('user_id', session.user.id)
            .eq('status', 'pending')
            .select('*, category:dim_finance_categories(*), finance_source:dim_finance_sources(*)')
            .maybeSingle();
        if (error) throw error;
        if (!data) return jsonError('Rule suggestion not found', 404);
        return NextResponse.json({ data });
    } catch (error) {
        console.error('Error editing finance rule suggestion:', error);
        return jsonError('Failed to edit rule suggestion', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const id = toRequiredText(body.id);
        const action = toRequiredText(body.action);
        if (!id) return jsonError('Suggestion ID is required');
        if (!isFinanceUuid(id)) return jsonError('Suggestion ID must be a valid UUID');
        if (action !== 'accept' && action !== 'reject') return jsonError('Invalid suggestion action');

        const admin = createAdminClient();
        const { data: suggestion, error: findError } = await admin
            .from('finance_rule_suggestions')
            .select('*')
            .eq('id', id)
            .eq('user_id', session.user.id)
            .eq('status', 'pending')
            .maybeSingle();
        if (findError) throw findError;
        if (!suggestion) return jsonError('Rule suggestion not found', 404);

        if (action === 'accept') {
            const category = await getOwnedFinanceCategory(session.user.id, suggestion.category_id);
            if (!category || category.is_archived) return jsonError('Choose an active category', 404);
            if (category.type !== suggestion.direction) return jsonError('Category type must match the suggestion direction');
            if (suggestion.source_id) {
                const source = await getOwnedFinanceSource(session.user.id, suggestion.source_id);
                if (!source || source.is_archived) return jsonError('Choose an active source', 404);
            }
            const { data: rule, error: ruleError } = await admin.rpc('finance_accept_rule_suggestion', {
                p_user_id: session.user.id,
                p_suggestion_id: id,
            }).single();
            if (ruleError) throw ruleError;
            return NextResponse.json({ success: true, data: rule });
        }

        const { data: rejected, error: updateError } = await admin
            .from('finance_rule_suggestions')
            .update({ status: 'rejected', updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('user_id', session.user.id)
            .eq('status', 'pending')
            .select('id')
            .maybeSingle();
        if (updateError) throw updateError;
        if (!rejected) return jsonError('Rule suggestion changed while it was being dismissed', 409);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error resolving finance rule suggestion:', error);
        return jsonError('Failed to resolve rule suggestion', 500);
    }
}
