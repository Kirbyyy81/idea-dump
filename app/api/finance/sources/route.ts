import { NextRequest, NextResponse } from 'next/server';
import { authorizeFinance, jsonError, readFinanceJsonObject } from '@/lib/finance/api';
import {
    isFinanceUuid,
    parseFinanceSourceCreate,
    parseFinanceSourceUpdate,
} from '@/lib/finance/schemas';
import {
    createFinanceSourceForUser,
    deleteFinanceSourceForUser,
    getFinanceSources,
    isFinanceServiceError,
    updateFinanceSourceForUser,
} from '@/lib/finance/service';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        return NextResponse.json({ data: await getFinanceSources(session.user.id) });
    } catch (error) {
        console.error('Error fetching finance sources:', error);
        return jsonError('Failed to fetch finance sources', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const parsed = parseFinanceSourceCreate(body);
        if ('error' in parsed) return jsonError(parsed.error);
        return NextResponse.json({ data: await createFinanceSourceForUser(session.user.id, parsed.data) }, { status: 201 });
    } catch (error) {
        console.error('Error creating finance source:', error);
        if (isFinanceServiceError(error)) return jsonError(error.message, error.status);
        return jsonError('Failed to create finance source', 500);
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const parsed = parseFinanceSourceUpdate(body);
        if ('error' in parsed) return jsonError(parsed.error);
        return NextResponse.json({ data: await updateFinanceSourceForUser(session.user.id, parsed.data) });
    } catch (error) {
        console.error('Error updating finance source:', error);
        if (isFinanceServiceError(error)) return jsonError(error.message, error.status);
        return jsonError('Failed to update finance source', 500);
    }
}

export const PUT = PATCH;

export async function DELETE(request: NextRequest) {
    try {
        const session = await authorizeFinance(request);
        if ('response' in session) return session.response;
        const id = request.nextUrl.searchParams.get('id');
        const confirmed = request.nextUrl.searchParams.get('confirm') === 'true';
        if (!id) return jsonError('Source ID is required');
        if (!isFinanceUuid(id)) return jsonError('Source ID must be a valid UUID');
        if (!confirmed) return jsonError('Permanent deletion requires explicit confirmation', 409);
        await deleteFinanceSourceForUser(session.user.id, id);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting finance source:', error);
        if (isFinanceServiceError(error)) return jsonError(error.message, error.status);
        return jsonError('Failed to delete finance source', 500);
    }
}
