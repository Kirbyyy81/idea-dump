export type ApiKeyValidationResult<T> = { data: T } | { error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function readApiKeyRequestBody(request: Request): Promise<ApiKeyValidationResult<unknown>> {
    try {
        return { data: await request.json() };
    } catch {
        return { error: 'Request body must be valid JSON' };
    }
}

export function parseApiKeyName(body: unknown): ApiKeyValidationResult<string> {
    if (!isRecord(body)) return { error: 'Request body must be an object' };

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return { error: 'Key name is required' };

    return { data: name };
}

export function parseApiKeyId(value: string | null): ApiKeyValidationResult<string> {
    const id = typeof value === 'string' ? value.trim() : '';
    if (!id) return { error: 'Key ID is required' };

    return { data: id };
}
