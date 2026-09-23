import 'server-only';
import type { FinanceBudgetDetail, FinanceBudgetDetailQuery, FinanceBudgetFieldErrors, FinanceBudgetListQuery, FinanceBudgetMutation, FinanceBudgetPage, FinanceBudgetSettings, FinanceBudgetSummary } from '@/lib/types';
import { FinanceServiceError } from '@/lib/finance/core/errors';
import { getBudgetRecord, listBudgetRecords, mutateBudgetRecord } from './repository';

const DETAIL_DEFAULTS: FinanceBudgetDetailQuery = { history_page: 1, history_page_size: 20, transactions_page: 1, transactions_page_size: 50 };
const FIELD_MESSAGES: FinanceBudgetFieldErrors = {
    name: 'Choose a unique name of 1 to 120 characters', amount: 'Choose a valid positive MYR amount',
    start_date: 'Choose a valid start date for this schedule', time_zone: 'The budget time zone is unavailable',
    cycle_type: 'Choose a valid cycle', custom_days: 'Choose a duration from 1 to 365 days', anchor_day: 'Choose a renewal day from 1 to 31',
    filter_logic: 'Choose AND or OR', include_uncategorised: 'Choose whether Uncategorised transactions count',
    source_ids: 'Remove missing sources or choose sources you own', category_ids: 'Remove missing categories or choose categories you own',
};

export function throwBudgetDatabaseError(error: { code?: string; message?: string }): never {
    if (error.code === '40001' || error.code === '40P01' || error.code === '55P03') throw new FinanceServiceError('This budget or its Finance data changed. Reload and retry.', 409);
    if (error.code === 'P0002') throw new FinanceServiceError('Budget not found', 404);
    if (error.code === '23505') throw new FinanceServiceError(error.message === 'request_id'
        ? 'This request was already used. Reload before creating another budget.' : 'An active or scheduled budget already uses this name.', 409);
    if (error.code === '22023' && error.message && error.message in FIELD_MESSAGES) {
        const field = error.message as keyof FinanceBudgetFieldErrors;
        throw new FinanceServiceError('Check the highlighted fields', 422, { field_errors: { [field]: FIELD_MESSAGES[field] } });
    }
    if (['22023', '23503', '23514'].includes(error.code ?? '')) throw new FinanceServiceError('The budget conflicts with current Finance data. Reload and check your selections.', 409);
    // SQL error text can contain names, values and filter IDs. Log only a safe stage and SQLSTATE.
    console.error('Finance budget database operation failed', { code: error.code ?? 'unknown' });
    throw new FinanceServiceError('Could not load or save this budget. Please retry.', 500);
}

function currentBudgetSettings(budget: FinanceBudgetSummary & { version?: FinanceBudgetSettings }): FinanceBudgetSummary {
    // Permit either deployment order while the release 15 database migration rolls out.
    const configuration = budget.configuration ?? budget.version;
    if (!configuration) throw new FinanceServiceError('Could not load this budget. Please retry.', 500);
    return { ...budget, configuration };
}

export async function getFinanceBudgets(userId: string, query: FinanceBudgetListQuery): Promise<FinanceBudgetPage<FinanceBudgetSummary>> {
    const { data, error } = await listBudgetRecords(userId, query);
    if (error) throwBudgetDatabaseError(error);
    const page = data as unknown as FinanceBudgetPage<FinanceBudgetSummary>;
    return { ...page, data: page.data.map(currentBudgetSettings) };
}

export async function getFinanceBudgetDetail(userId: string, id: string, query = DETAIL_DEFAULTS): Promise<FinanceBudgetDetail> {
    const { data, error } = await getBudgetRecord(userId, id, query);
    if (error) throwBudgetDatabaseError(error);
    const detail = data as unknown as FinanceBudgetDetail;
    return { ...detail, budget: currentBudgetSettings(detail.budget) };
}

export async function mutateFinanceBudget(userId: string, mutation: FinanceBudgetMutation): Promise<FinanceBudgetSummary> {
    const { data, error } = await mutateBudgetRecord(userId, mutation);
    if (error) throwBudgetDatabaseError(error);
    const detail = await getFinanceBudgetDetail(userId, data as string);
    return detail.budget;
}

export async function getFinanceDashboardBudgets(userId: string): Promise<FinanceBudgetSummary[]> {
    const { data, error } = await listBudgetRecords(userId, { state: 'active', page: 1, page_size: 3 }, true);
    if (error) throwBudgetDatabaseError(error);
    return (data as unknown as FinanceBudgetPage<FinanceBudgetSummary>).data.map(currentBudgetSettings);
}
