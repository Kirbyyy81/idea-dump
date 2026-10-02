import { NextResponse } from 'next/server';
import { DocumentationError } from './notion';

const privateHeaders = {
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache',
    Vary: 'Cookie',
    'X-Content-Type-Options': 'nosniff',
};

export function documentationData<T>(data: T) {
    return NextResponse.json({ data }, { headers: privateHeaders });
}

export function documentationFailure(error: unknown, operation: string) {
    if (error instanceof DocumentationError) {
        return NextResponse.json(
            { error: error.status === 400 ? 'VALIDATION_ERROR' : error.status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR', message: error.message },
            { status: error.status, headers: privateHeaders }
        );
    }
    console.error('Documentation operation failed', {
        operation,
        error_name: error instanceof Error ? error.name : typeof error,
    });
    return NextResponse.json(
        { error: 'INTERNAL_ERROR', message: 'Documentation is unavailable. Please try again.' },
        { status: 502, headers: privateHeaders }
    );
}

export function documentationAssetHeaders(contentType: string) {
    const safeImageTypes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
    const type = contentType.split(';', 1)[0].trim().toLowerCase();
    const inline = safeImageTypes.has(type);
    return {
        ...privateHeaders,
        'Content-Type': inline ? type : 'application/octet-stream',
        'Content-Disposition': inline ? 'inline' : 'attachment',
        'Content-Security-Policy': "sandbox; default-src 'none'",
    };
}
