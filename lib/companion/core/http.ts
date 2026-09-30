import { NextResponse } from 'next/server';

export class CompanionError extends Error {
    constructor(message: string, public readonly status = 400) { super(message); }
}

export async function readCompanionJson(request: Request, limit = 8192): Promise<Record<string, unknown>> {
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) {
        throw new CompanionError('JSON content is required', 415);
    }
    const reader = request.body?.getReader();
    if (!reader) throw new CompanionError('Request body is required');
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (true) {
            const next = await reader.read();
            if (next.done) break;
            length += next.value.byteLength;
            if (length > limit) { await reader.cancel(); throw new CompanionError('Request is too large', 413); }
            chunks.push(next.value);
        }
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
        return value as Record<string, unknown>;
    } catch (error) {
        if (error instanceof CompanionError) throw error;
        throw new CompanionError('Invalid JSON request');
    } finally { reader.releaseLock(); }
}

export async function companionResponse(action: () => Promise<unknown>) {
    try {
        return NextResponse.json(await action(), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof CompanionError ? error.message : 'Companion request failed' },
            { status: error instanceof CompanionError ? error.status : 500, headers: { 'Cache-Control': 'no-store' } },
        );
    }
}
