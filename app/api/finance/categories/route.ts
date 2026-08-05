import { NextRequest, NextResponse } from 'next/server';
import { authorizeFinance, jsonError, readFinanceJsonObject } from '@/lib/finance/auth';
import {
    isFinanceUuid,
    parseFinanceCategoryCreate,
    parseFinanceCategoryUpdate,
} from '@/lib/finance/schemas';
import {
    createFinanceCategoryForUser,
    deleteFinanceCategoryForUser,
    getFinanceCategories,
    isFinanceServiceError,
    updateFinanceCategoryForUser,
} from '@/lib/finance/service';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const session = await authorizeFinance();
        if ('response' in session) return session.response;
        return NextResponse.json({ data: await getFinanceCategories(session.user.id) });
    } catch (error) {
        console.error('Error fetching finance categories:', error);
        return jsonError('Failed to fetch finance categories', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const parsed = parseFinanceCategoryCreate(body);
        if ('error' in parsed) return jsonError(parsed.error);
        const result = await createFinanceCategoryForUser(session.user.id, parsed.data);
        return NextResponse.json({ data: result.data, created: result.created }, { status: result.status });
    } catch (error) {
        console.error('Error creating finance category:', error);
        if (isFinanceServiceError(error)) return jsonError(error.message, error.status);
        return jsonError('Failed to create finance category', 500);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await authorizeFinance(request, { requireJson: true });
        if ('response' in session) return session.response;
        const body = await readFinanceJsonObject(request);
        if (!body) return jsonError('Request body must be a JSON object');
        const parsed = parseFinanceCategoryUpdate(body);
        if ('error' in parsed) return jsonError(parsed.error);
        return NextResponse.json({ data: await updateFinanceCategoryForUser(session.user.id, parsed.data) });
    } catch (error) {
        console.error('Error updating finance category:', error);
        if (isFinanceServiceError(error)) return jsonError(error.message, error.status);
        return jsonError('Failed to update finance category', 500);
    }
}

export const PATCH = PUT;

export async function DELETE(request: NextRequest) {
    try {
        const session = await authorizeFinance(request);
        if ('response' in session) return session.response;
        const id = request.nextUrl.searchParams.get('id');
        const confirmed = request.nextUrl.searchParams.get('confirm') === 'true';
        if (!id) return jsonError('Category ID is required');
        if (!isFinanceUuid(id)) return jsonError('Category ID must be a valid UUID');
        if (!confirmed) return jsonError('Permanent deletion requires explicit confirmation', 409);
        await deleteFinanceCategoryForUser(session.user.id, id);
        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting finance category:', error);
        if (isFinanceServiceError(error)) return jsonError(error.message, error.status);
        return jsonError('Failed to delete finance category', 500);
    }
}
