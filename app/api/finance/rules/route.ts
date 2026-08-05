import { NextRequest, NextResponse } from 'next/server';
import { authorizeFinance, jsonError, readFinanceJsonObject } from '@/lib/finance/auth';
import { isFinanceUuid, parseFinanceRuleCreate, parseFinanceRuleUpdate } from '@/lib/finance/schemas';
import {
    createFinanceRuleForUser,
    deleteFinanceRuleForUser,
    getFinanceRules,
    isFinanceServiceError,
    updateFinanceRuleForUser,
} from '@/lib/finance/service';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        return NextResponse.json({ data: await getFinanceRules(session.user.id) });
    } catch (error) {
        console.error('Error fetching finance rules:', error);
        return jsonError('Failed to fetch finance rules', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const parsed = parseFinanceRuleCreate(body);
        if ('error' in parsed) return jsonError(parsed.error);
        return NextResponse.json({ data: await createFinanceRuleForUser(session.user.id, parsed.data) }, { status: 201 });
    } catch (error) {
        console.error('Error creating finance rule:', error);
        if (isFinanceServiceError(error)) return jsonError(error.message, error.status);
        return jsonError('Failed to create finance rule', 500);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const parsed = parseFinanceRuleUpdate(body);
        if ('error' in parsed) return jsonError(parsed.error);
        return NextResponse.json({ data: await updateFinanceRuleForUser(session.user.id, parsed.data) });
    } catch (error) {
        console.error('Error updating finance rule:', error);
        if (isFinanceServiceError(error)) return jsonError(error.message, error.status);
        return jsonError('Failed to update finance rule', 500);
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await authorizeFinance(request);
        if ('response' in session) return session.response;
        const id = new URL(request.url).searchParams.get('id');
        if (!id) return jsonError('Rule ID is required');
        if (!isFinanceUuid(id)) return jsonError('Rule ID must be a valid UUID');
        await deleteFinanceRuleForUser(session.user.id, id);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting finance rule:', error);
        if (isFinanceServiceError(error)) return jsonError(error.message, error.status);
        return jsonError('Failed to delete finance rule', 500);
    }
}
