import { ResolvedIdentity } from '@/lib/auth/resolveIdentity';
import { normalizeDailyLogEntry } from '@/lib/dailyLogs';
import { createAdminClient } from '@/lib/supabase/admin';
import { CreateDailyLogInput, DailyLogEntry } from '@/lib/types';

const DEFAULT_SORT_FIELD = 'created_at';
const DEFAULT_SORT_DIRECTION = 'desc';
const SUPPORTED_SORT_FIELDS = new Set(['created_at', 'updated_at', 'effective_date']);

interface LogListOptions {
    cursor?: string | null;
    from?: string | null;
    limit?: number;
    sort?: string | null;
    to?: string | null;
}

export interface AccessibleLogRecord {
    log: DailyLogEntry;
    storageUserId: string;
}

interface LogMutationResult {
    data?: DailyLogEntry;
    error?: string;
    message?: string;
    status: number;
}

function parseSort(sort?: string | null) {
    const [rawField, rawDirection] = (sort || `${DEFAULT_SORT_FIELD}.${DEFAULT_SORT_DIRECTION}`).split('.');
    const field = SUPPORTED_SORT_FIELDS.has(rawField) ? rawField : DEFAULT_SORT_FIELD;
    const ascending = rawDirection === 'asc';

    return { ascending, field };
}

function compareLogValues(left: DailyLogEntry, right: DailyLogEntry, field: string, ascending: boolean) {
    const leftValue = String(left[field as keyof DailyLogEntry] || '');
    const rightValue = String(right[field as keyof DailyLogEntry] || '');
    const valueOrder = leftValue.localeCompare(rightValue);

    if (valueOrder !== 0) {
        return ascending ? valueOrder : -valueOrder;
    }

    return right.created_at.localeCompare(left.created_at);
}

function sortLogs(logs: DailyLogEntry[], sort?: string | null) {
    const { ascending, field } = parseSort(sort);
    return logs.slice().sort((left, right) => compareLogValues(left, right, field, ascending));
}

async function fetchLogsForIdentity(identity: ResolvedIdentity, options: LogListOptions) {
    const client = createAdminClient();
    const { ascending, field } = parseSort(options.sort);

    let query = client
        .from('daily_logs')
        .select('*')
        .eq('user_id', identity.user_id);

    if (options.limit !== undefined) {
        query = query.limit(options.limit);
    }

    if (options.from) {
        query = query.gte('effective_date', options.from);
    }
    if (options.to) {
        query = query.lte('effective_date', options.to);
    }
    if (options.cursor) {
        query = query.lt('created_at', options.cursor);
    }

    query = query.order(field, { ascending });
    if (field !== 'created_at') {
        query = query.order('created_at', { ascending: false });
    }

    const { data, error } = await query;
    if (error) {
        throw new Error(error.message);
    }

    return (data || []).map(normalizeDailyLogEntry);
}

export async function listAccessibleLogs(identity: ResolvedIdentity, options: LogListOptions) {
    const logs = await fetchLogsForIdentity(identity, options);

    const sorted = sortLogs(logs, options.sort);
    const merged = options.limit !== undefined ? sorted.slice(0, options.limit) : sorted;
    const nextCursor = options.limit !== undefined && merged.length === options.limit
        ? merged[merged.length - 1].created_at
        : null;

    return {
        data: merged,
        nextCursor,
    };
}

async function findHumanLog(ownerUserId: string, id: string): Promise<AccessibleLogRecord | null> {
    const client = createAdminClient();
    const { data, error } = await client
        .from('daily_logs')
        .select('*')
        .eq('id', id)
        .eq('user_id', ownerUserId)
        .maybeSingle();

    if (error) {
        throw new Error(error.message);
    }

    if (!data) {
        return null;
    }

    return {
        log: normalizeDailyLogEntry(data),
        storageUserId: ownerUserId,
    };
}

export async function findAccessibleLog(identity: ResolvedIdentity, id: string): Promise<AccessibleLogRecord | null> {
    return findHumanLog(identity.user_id, id);
}

export async function createLogForIdentity(identity: ResolvedIdentity, body: CreateDailyLogInput): Promise<LogMutationResult> {
    if (!body.content || !body.content.date) {
        return {
            error: 'Validation error',
            message: 'content.date is required',
            status: 400,
        };
    }

    const client = createAdminClient();
    const effectiveDate = body.effective_date || body.content.date;
    const source = identity.role === 'agent' ? 'agent' : 'human';

    const { data, error } = await client
        .from('daily_logs')
        .insert({
            user_id: identity.user_id,
            source,
            content: body.content,
            effective_date: effectiveDate,
        })
        .select()
        .single();

    if (error || !data) {
        return {
            error: 'Database error',
            message: error?.message || 'Failed to create log entry',
            status: 500,
        };
    }

    return {
        data: normalizeDailyLogEntry(data),
        status: 201,
    };
}

export async function updateAccessibleLog(identity: ResolvedIdentity, record: AccessibleLogRecord, content: DailyLogEntry['content']) {
    const client = createAdminClient();
    const { data, error } = await client
        .from('daily_logs')
        .update({
            content,
            effective_date: content.date || record.log.effective_date,
            updated_at: new Date().toISOString(),
        })
        .eq('id', record.log.id)
        .eq('user_id', record.storageUserId)
        .select()
        .single();

    if (error) {
        return {
            error: 'Database error',
            message: error.message,
            status: 500,
        };
    }

    return {
        data: normalizeDailyLogEntry(data),
        status: 200,
    };
}

export async function deleteAccessibleLog(record: AccessibleLogRecord) {
    const client = createAdminClient();
    const { error } = await client
        .from('daily_logs')
        .delete()
        .eq('id', record.log.id)
        .eq('user_id', record.storageUserId);

    if (error) {
        return {
            error: 'Database error',
            message: error.message,
            status: 500,
        };
    }

    return { status: 204 };
}
