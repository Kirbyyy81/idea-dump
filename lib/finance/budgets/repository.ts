import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { FinanceBudgetDetailQuery, FinanceBudgetListQuery, FinanceBudgetMutation } from '@/lib/types';

export function listBudgetRecords(userId: string, query: FinanceBudgetListQuery, dashboard = false) {
    return createAdminClient().rpc('finance_budget_list', {
        p_user_id: userId, p_state: query.state, p_page: query.page, p_page_size: query.page_size, p_dashboard: dashboard,
    });
}

export function getBudgetRecord(userId: string, id: string, query: FinanceBudgetDetailQuery) {
    return createAdminClient().rpc('finance_budget_detail', {
        p_user_id: userId, p_budget_id: id, p_history_page: query.history_page, p_history_page_size: query.history_page_size,
        p_transactions_page: query.transactions_page, p_transactions_page_size: query.transactions_page_size,
    });
}

export function mutateBudgetRecord(userId: string, mutation: FinanceBudgetMutation) {
    return createAdminClient().rpc('finance_budget_mutate', {
        p_user_id: userId, p_action: mutation.action, p_budget_id: mutation.id, p_revision: mutation.revision,
        p_request_id: mutation.request_id, p_configuration: mutation.configuration,
    });
}
