import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizeFinance, getOwnedFinanceCategory, jsonError, toRequiredText } from '@/lib/finance/api';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const admin = createAdminClient();
        const { data, error } = await admin
            .from('finance_rule_suggestions')
            .select('*, category:finance_categories(*)')
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

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        const body = await request.json();
        const id = toRequiredText(body.id);
        const action = toRequiredText(body.action);
        if (!id) return jsonError('Suggestion ID is required');
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
            if (!category) return jsonError('Category not found', 404);
            const { error: ruleError } = await admin.from('finance_rules').insert({
                user_id: session.user.id,
                name: suggestion.name,
                match_type: 'merchant_alias',
                pattern: suggestion.pattern,
                category_id: suggestion.category_id,
                account_id: null,
                direction: suggestion.direction,
                priority: 100,
                is_active: true,
                source: 'learning',
            });
            if (ruleError) throw ruleError;
        }

        const { error: updateError } = await admin
            .from('finance_rule_suggestions')
            .update({ status: action === 'accept' ? 'accepted' : 'rejected', updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('user_id', session.user.id);
        if (updateError) throw updateError;
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error resolving finance rule suggestion:', error);
        return jsonError('Failed to resolve rule suggestion', 500);
    }
}
