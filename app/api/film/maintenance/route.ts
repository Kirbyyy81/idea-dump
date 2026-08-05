import { NextRequest, NextResponse } from 'next/server';
import { authorizeFilmJournal, filmServiceErrorResponse, jsonError } from '@/lib/film/core/api';
import {
    parseFilmMaintenanceCreate,
    parseFilmMaintenanceUpdate,
    parseFilmQueryId,
    readFilmRequestBody,
} from '@/lib/film/core/schemas';
import {
    createFilmMaintenanceForUser,
    deleteFilmMaintenanceForUser,
    listFilmMaintenanceForUser,
    updateFilmMaintenanceForUser,
} from '@/lib/film/core/service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;
        const cameraId = parseFilmQueryId(new URL(request.url).searchParams.get('camera_id'), 'Camera ID');
        if ('error' in cameraId) return jsonError(cameraId.error);
        return NextResponse.json({ data: await listFilmMaintenanceForUser(session.user.id, cameraId.data) });
    } catch (error) {
        const serviceError = filmServiceErrorResponse(error);
        if (serviceError) return serviceError;
        console.error('Error fetching maintenance records:', error);
        return jsonError('Failed to fetch maintenance records', 500);
    }
}

export async function POST(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;
        const body = await readFilmRequestBody(request);
        if ('error' in body) return jsonError(body.error);
        const input = parseFilmMaintenanceCreate(body.data);
        if ('error' in input) return jsonError(input.error);
        return NextResponse.json(
            { data: await createFilmMaintenanceForUser(session.user.id, input.data) },
            { status: 201 }
        );
    } catch (error) {
        const serviceError = filmServiceErrorResponse(error);
        if (serviceError) return serviceError;
        console.error('Error creating maintenance record:', error);
        return jsonError('Failed to create maintenance record', 500);
    }
}

export async function PUT(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;
        const body = await readFilmRequestBody(request);
        if ('error' in body) return jsonError(body.error);
        const input = parseFilmMaintenanceUpdate(body.data);
        if ('error' in input) return jsonError(input.error);
        return NextResponse.json({ data: await updateFilmMaintenanceForUser(session.user.id, input.data) });
    } catch (error) {
        const serviceError = filmServiceErrorResponse(error);
        if (serviceError) return serviceError;
        console.error('Error updating maintenance record:', error);
        return jsonError('Failed to update maintenance record', 500);
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const session = await authorizeFilmJournal();
        if ('response' in session) return session.response;
        const id = parseFilmQueryId(new URL(request.url).searchParams.get('id'), 'Maintenance record ID');
        if ('error' in id) return jsonError(id.error);
        await deleteFilmMaintenanceForUser(session.user.id, id.data);
        return NextResponse.json({ success: true });
    } catch (error) {
        const serviceError = filmServiceErrorResponse(error);
        if (serviceError) return serviceError;
        console.error('Error deleting maintenance record:', error);
        return jsonError('Failed to delete maintenance record', 500);
    }
}
