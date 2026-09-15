import type { FinanceBudgetConfiguration, FinanceBudgetDetailQuery, FinanceBudgetFieldErrors, FinanceBudgetListQuery, FinanceBudgetMutation } from '@/lib/types';
import { getFinanceDateInTimeZone, normalizeFinanceDate, toFinanceAmountMinorUnits } from '@/lib/finance/core/values';
import { budgetDecimal } from './calculations';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isBudgetUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);
type Validation<T> = { data: T } | { error: string; field_errors?: FinanceBudgetFieldErrors };

export function validateBudgetConfiguration(value: unknown, options: { allowPastStart?: boolean; now?: Date } = {}): Validation<FinanceBudgetConfiguration> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { error: 'Budget configuration must be an object' };
    const input = value as Record<string, unknown>;
    const errors: FinanceBudgetFieldErrors = {};
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name || Array.from(name).length > 120) errors.name = 'Enter a name of 1 to 120 characters';
    const amount = toFinanceAmountMinorUnits(input.amount);
    if (amount === null) errors.amount = 'Enter an amount between RM 0.01 and RM 999,999,999,999.99, with up to two decimal places';
    const cycleType = input.cycle_type;
    if (cycleType !== 'weekly' && cycleType !== 'monthly' && cycleType !== 'custom') errors.cycle_type = 'Choose weekly, monthly, or custom';
    const days = input.custom_days;
    if (cycleType === 'custom' && (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 365)) errors.custom_days = 'Enter a whole number from 1 to 365';
    const anchor = input.anchor_day;
    if (cycleType === 'monthly' && (typeof anchor !== 'number' || !Number.isInteger(anchor) || anchor < 1 || anchor > 31)) errors.anchor_day = 'Choose a renewal day from 1 to 31';
    const start = normalizeFinanceDate(input.start_date);
    if (!start || start < '1900-01-01' || start > '9998-12-31') errors.start_date = 'Choose a valid start date';
    let timeZone = typeof input.time_zone === 'string' ? input.time_zone : '';
    try {
        // Intl accepts named IANA zones. Fixed numeric offsets are not budget zones.
        if (!timeZone || timeZone.length > 100 || /^[+-]/.test(timeZone)) throw new Error('Invalid zone');
        new Intl.DateTimeFormat('en', { timeZone }).format(options.now ?? new Date());
        if (start && !options.allowPastStart && start < getFinanceDateInTimeZone(timeZone, options.now)) errors.start_date = 'Choose today or a future date';
    } catch {
        errors.time_zone = 'Your browser time zone is unavailable. Check your device settings and retry';
        timeZone = '';
    }
    if (input.filter_logic !== 'and' && input.filter_logic !== 'or') errors.filter_logic = 'Choose AND or OR';
    if (typeof input.include_uncategorised !== 'boolean') errors.include_uncategorised = 'Choose whether Uncategorised transactions count';
    const references = (key: 'source_ids' | 'category_ids') => {
        const values = input[key];
        if (!Array.isArray(values) || !values.every(isBudgetUuid)) {
            errors[key] = 'Remove unavailable selections and choose valid Finance options';
            return [];
        }
        return [...new Set(values.map((id) => id.toLowerCase()))].sort();
    };
    const sourceIds = references('source_ids');
    const categoryIds = references('category_ids');
    if (Object.keys(errors).length) return { error: 'Check the highlighted fields', field_errors: errors };
    return { data: {
        name, amount: budgetDecimal(amount!), cycle_type: cycleType as FinanceBudgetConfiguration['cycle_type'], start_date: start!,
        custom_days: cycleType === 'custom' ? days as number : null, anchor_day: cycleType === 'monthly' ? anchor as number : null,
        time_zone: timeZone, filter_logic: input.filter_logic as 'and' | 'or', include_uncategorised: input.include_uncategorised as boolean,
        source_ids: sourceIds, category_ids: categoryIds,
    } };
}

export function parseBudgetMutation(body: Record<string, unknown>, action: FinanceBudgetMutation['action'], pathId?: string): Validation<FinanceBudgetMutation> {
    const allowed = action === 'create' ? ['request_id', 'configuration'] : action === 'archive' ? ['action', 'revision']
        : action === 'restore' ? ['action', 'revision', 'configuration'] : ['id', 'revision', 'configuration'];
    if (Object.keys(body).some((key) => !allowed.includes(key))) return { error: 'Unexpected budget fields' };
    const id = pathId ?? body.id;
    if (action !== 'create' && !isBudgetUuid(id)) return { error: 'Budget ID must be a valid UUID' };
    if (action === 'create' && !isBudgetUuid(body.request_id)) return { error: 'A request UUID is required', field_errors: { request_id: 'Reload the form and retry' } };
    if (action !== 'create' && (typeof body.revision !== 'number' || !Number.isInteger(body.revision) || body.revision < 1 || body.revision > 2_147_483_647)) {
        return { error: 'A current revision is required', field_errors: { revision: 'Reload this budget and retry' } };
    }
    // Creation checks its idempotency key before the database validates local today.
    // An exact retry after midnight must still return the previously created budget.
    const config = action === 'archive' ? { data: null } : validateBudgetConfiguration(body.configuration, { allowPastStart: action !== 'restore' });
    if ('error' in config) return config;
    return { data: { action, id: action === 'create' ? null : id as string, revision: action === 'create' ? null : body.revision as number,
        request_id: action === 'create' ? body.request_id as string : null, configuration: config.data } };
}

function pageNumber(params: URLSearchParams, key: string, fallback: number, max: number): number | null {
    const value = params.get(key);
    if (value === null) return fallback;
    if (!/^[1-9]\d*$/.test(value)) return null;
    const result = Number(value);
    return Number.isSafeInteger(result) && result <= max ? result : null;
}

export function parseBudgetListQuery(params: URLSearchParams): Validation<FinanceBudgetListQuery> {
    const state = params.get('state') ?? 'active';
    const page = pageNumber(params, 'page', 1, 1_000_000);
    const pageSize = pageNumber(params, 'page_size', 20, 100);
    if (!['active', 'scheduled', 'archived', 'all'].includes(state) || page === null || pageSize === null) return { error: 'Invalid budget filters or pagination' };
    return { data: { state: state as FinanceBudgetListQuery['state'], page, page_size: pageSize } };
}

export function parseBudgetDetailQuery(params: URLSearchParams): Validation<FinanceBudgetDetailQuery> {
    const historyPage = pageNumber(params, 'history_page', 1, 1_000_000);
    const historySize = pageNumber(params, 'history_page_size', 20, 100);
    const transactionPage = pageNumber(params, 'transactions_page', 1, 1_000_000);
    const transactionSize = pageNumber(params, 'transactions_page_size', 50, 100);
    if (historyPage === null || historySize === null || transactionPage === null || transactionSize === null) return { error: 'Invalid budget pagination' };
    return { data: { history_page: historyPage, history_page_size: historySize, transactions_page: transactionPage, transactions_page_size: transactionSize } };
}
