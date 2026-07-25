export interface ServiceConfig {
    host: string;
    port: number;
    logLevel: string;
    supabaseUrl: string;
    supabasePublishableKey: string;
    supabaseSecretKey: string;
    allowedOrigins: ReadonlySet<string>;
    maxImageBytes: number;
    maxRequestBytes: number;
    maxImageDimension: number;
    maxImagePixels: number;
    processingVersion: number;
    intakeLeaseSeconds: number;
    rateLimitWindowSeconds: number;
    ocrRateLimitMaxRequests: number;
    warmRateLimitMaxRequests: number;
    busyRetryAfterSeconds: number;
    financeShareBucket: string;
    financeShareQueue: string;
    financeQueueVisibilitySeconds: number;
    financeQueueWakeSecret: string;
}

function required(env: NodeJS.ProcessEnv, name: string) {
    const value = env[name]?.trim();
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
}

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, minimum = 1) {
    const raw = env[name]?.trim();
    const value = raw ? Number(raw) : fallback;
    if (!Number.isSafeInteger(value) || value < minimum) {
        throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
    }
    return value;
}

function origins(env: NodeJS.ProcessEnv) {
    const values = required(env, 'ALLOWED_ORIGINS')
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean);
    if (!values.length || values.includes('*')) {
        throw new Error('ALLOWED_ORIGINS must contain explicit origins and cannot contain a wildcard');
    }
    for (const value of values) {
        const parsed = new URL(value);
        if (parsed.origin !== value || !['http:', 'https:'].includes(parsed.protocol)) {
            throw new Error(`ALLOWED_ORIGINS contains an invalid origin: ${value}`);
        }
    }
    return new Set(values);
}

function identifier(env: NodeJS.ProcessEnv, name: string, fallback: string) {
    const value = env[name]?.trim() || fallback;
    if (!/^[a-z0-9][a-z0-9_-]{0,62}$/.test(value)) {
        throw new Error(`${name} must be a lowercase Storage or Queue identifier`);
    }
    return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServiceConfig {
    const maxImageBytes = integer(env, 'MAX_IMAGE_BYTES', 4 * 1024 * 1024);
    const maxRequestBytes = integer(env, 'MAX_REQUEST_BYTES', maxImageBytes + 256 * 1024);
    if (maxRequestBytes <= maxImageBytes) {
        throw new Error('MAX_REQUEST_BYTES must be greater than MAX_IMAGE_BYTES');
    }

    const intakeLeaseSeconds = integer(env, 'INTAKE_LEASE_SECONDS', 300, 30);
    const financeQueueVisibilitySeconds = integer(
        env,
        'FINANCE_QUEUE_VISIBILITY_SECONDS',
        intakeLeaseSeconds + 120,
        60,
    );
    if (financeQueueVisibilitySeconds < intakeLeaseSeconds + 30) {
        throw new Error(
            'FINANCE_QUEUE_VISIBILITY_SECONDS must be at least 30 seconds longer than INTAKE_LEASE_SECONDS',
        );
    }
    const financeQueueWakeSecret = required(env, 'FINANCE_QUEUE_WAKE_SECRET');
    if (Buffer.byteLength(financeQueueWakeSecret, 'utf8') < 32) {
        throw new Error('FINANCE_QUEUE_WAKE_SECRET must contain at least 32 bytes');
    }
    const financeShareBucket = identifier(
        env,
        'FINANCE_SHARE_BUCKET',
        'finance-share-batches',
    );
    const financeShareQueue = identifier(env, 'FINANCE_SHARE_QUEUE', 'finance_share_ocr');
    if (financeShareBucket !== 'finance-share-batches') {
        throw new Error('FINANCE_SHARE_BUCKET must match the deployed finance-share-batches contract');
    }
    if (financeShareQueue !== 'finance_share_ocr') {
        throw new Error('FINANCE_SHARE_QUEUE must match the deployed finance_share_ocr contract');
    }

    return {
        host: env.HOST?.trim() || '0.0.0.0',
        port: integer(env, 'PORT', 3001),
        logLevel: env.LOG_LEVEL?.trim() || 'info',
        supabaseUrl: required(env, 'SUPABASE_URL'),
        supabasePublishableKey: required(env, 'SUPABASE_PUBLISHABLE_KEY'),
        supabaseSecretKey: required(env, 'SUPABASE_SECRET_KEY'),
        allowedOrigins: origins(env),
        maxImageBytes,
        maxRequestBytes,
        maxImageDimension: integer(env, 'MAX_IMAGE_DIMENSION', 12_000),
        maxImagePixels: integer(env, 'MAX_IMAGE_PIXELS', 25_000_000),
        processingVersion: integer(env, 'PROCESSING_VERSION', 2),
        intakeLeaseSeconds,
        rateLimitWindowSeconds: integer(env, 'OCR_RATE_LIMIT_WINDOW_SECONDS', 60),
        ocrRateLimitMaxRequests: integer(env, 'OCR_RATE_LIMIT_MAX_REQUESTS', 4),
        warmRateLimitMaxRequests: integer(env, 'WARM_RATE_LIMIT_MAX_REQUESTS', 6),
        busyRetryAfterSeconds: integer(env, 'OCR_BUSY_RETRY_AFTER_SECONDS', 5),
        financeShareBucket,
        financeShareQueue,
        financeQueueVisibilitySeconds,
        financeQueueWakeSecret,
    };
}
