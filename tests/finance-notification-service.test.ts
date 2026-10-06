import { notificationPatterns } from './fixtures/notification-patterns';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinanceNotificationEventInput, FinanceOcrRule } from '@/lib/types';

const mocks = vi.hoisted(() => ({
    from: vi.fn(), rpc: vi.fn(), rules: vi.fn(), update: vi.fn(), assess: vi.fn(),
    payeeError: null as { message: string } | null,
    tables: {} as Record<string, Record<string, unknown>[]>,
    queries: [] as { table: string; filters: [string, unknown][] }[],
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock('@/lib/finance/core/repository', async importOriginal => ({
    ...await importOriginal<typeof import('@/lib/finance/core/repository')>(),
    listActiveFinanceRules: mocks.rules,
    listFinanceNotificationPatterns: vi.fn(async () => ({ data: notificationPatterns, error: null })),
    updateFinanceReviewCandidate: mocks.update,
}));
vi.mock('@/lib/finance/transactions/duplicates', async importOriginal => ({
    ...await importOriginal<typeof import('@/lib/finance/transactions/duplicates')>(),
    assessFinanceDuplicate: mocks.assess,
}));
import { acceptFinanceNotification, retryFinanceNotification, confirmFinanceNotification } from '@/lib/finance/notifications/service';
import { notificationPayloadDigest } from '@/lib/finance/notifications/replay';

const owner = '00000000-0000-4000-8000-000000000010';
const otherOwner = '00000000-0000-4000-8000-000000000011';
const event = (): FinanceNotificationEventInput => ({
    client_event_id: '00000000-0000-4000-8000-000000000001',
    source_id: '00000000-0000-4000-8000-000000000002', source_package: 'my.com.tngdigital.ewallet',
    notification_key_hash: 'a'.repeat(64), captured_at: '2026-09-25T16:01:00.000Z',
    notification: { title: 'ＴＮＧ eWallet', text: 'ＲＭ\u00a0１０.００ has been successfully\n transferred to alex-tan.', subtext: null, posted_at: '2026-09-25T16:00:00.000Z' },
});
const rule = (overrides: Partial<FinanceOcrRule> = {}): FinanceOcrRule => ({
    id: 'rule-1', name: 'Alex transfers', pattern: 'Alex Tan', match_type: 'merchant_alias', source: 'manual',
    source_id: event().source_id, category_id: 'category-1', direction: 'income', priority: 1, is_active: true,
    created_at: '2026-09-25', auto_created_at: null, ...overrides,
});
function storedNotification(input = event()) {
    return { user_id: owner, intake_item_id: 'intake-1', status: 'review',
        payload_digest: 'a'.repeat(64), client_event_id: input.client_event_id, source_id: input.source_id, source_package: input.source_package,
        notification_key_hash: input.notification_key_hash, captured_at: input.captured_at,
        title: input.notification.title, body: input.notification.text, subtext: input.notification.subtext, posted_at: input.notification.posted_at,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    mocks.queries = [];
    mocks.payeeError = null;
    mocks.tables = {
        dim_finance_payees: [
            { id: 'payee-1', user_id: owner, name: 'Alex Tan', normalized_name: 'alextan', is_archived: false },
            { id: 'archived-payee', user_id: owner, name: 'Alex-Tan', normalized_name: 'alextan', is_archived: true },
            { id: 'other-payee', user_id: otherOwner, name: 'ALEX TAN', normalized_name: 'alextan', is_archived: false },
        ],
        finance_notification_events: [storedNotification()],
    };
    mocks.from.mockImplementation((table: string) => {
        const request = { table, filters: [] as [string, unknown][] };
        mocks.queries.push(request);
        const rows = () => (mocks.tables[table] || []).filter(row => request.filters.every(([key, value]) => row[key] === value));
        const query = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn((key: string, value: unknown) => { request.filters.push([key, value]); return query; }),
            order: vi.fn(async () => ({ data: mocks.payeeError ? null : rows(), error: mocks.payeeError })),
            single: vi.fn(async () => ({ data: rows().length === 1 ? rows()[0] : null, error: rows().length === 1 ? null : { message: 'not found' } })),
        };
        return query;
    });
    mocks.rules.mockResolvedValue({ data: [rule()], error: null });
    mocks.rpc.mockImplementation(async (name, args) => ({ data: name === 'finance_retry_notification_v1'
        ? { confirmed: false, candidate: { id:'candidate-1', payload:args.p_parsed.payload } }
        : { status: 'review', intake_item_id: 'intake-1' }, error: null }));
    mocks.update.mockImplementation(async (_owner, _candidate, update) => ({ data: { id: 'candidate-1', ...update }, error: null }));
    mocks.assess.mockResolvedValue({ outcome: 'none', matchedTransactionId: null, score: 0, signals: [], explanation: 'No duplicate.' });
});

describe('notification preparation for intake and Retry', () => {
    it('keeps merchant payments out of saved payees on intake and Retry, then applies merchant rules', async () => {
        const input = event();
        input.source_package = 'my.rytbank.app';
        input.notification.title = 'Nice! Payment successful!';
        input.notification.text = 'You’ve paid ＲＭ12.30 to SYNTHETIC CAFE on 1/10/2026,\n 3:51 PM (GMT+8) using your Main Account.';
        mocks.tables.finance_notification_events = [storedNotification(input)];
        mocks.tables.dim_finance_payees.push({ id: 'cafe-payee', user_id: owner, name: 'SYNTHETIC CAFE', normalized_name: 'syntheticcafe', is_archived: false });
        mocks.rules.mockResolvedValue({ error: null, data: [rule({ name: 'Cafe purchases', pattern: 'SYNTHETIC CAFE', category_id: 'dining', direction: null })] });
        await acceptFinanceNotification(owner, 'device-1', input);
        const prepared = mocks.rpc.mock.calls[0][1].p_parsed;
        expect(prepared).toMatchObject({ date_provenance: 'notification_text', matched_rule_id: 'rule-1',
            payload: { amount: 12.3, direction: 'expense', merchant: 'Cafe purchases', payee_id: null, payee_name: null, category_id: 'dining', transaction_date: '2026-10-01', matched_rule_names: ['Cafe purchases'] },
        });
        await retryFinanceNotification(owner, 'candidate-1', 'intake-1');
        expect(mocks.rpc).toHaveBeenCalledWith('finance_retry_notification_v1', expect.objectContaining({p_user_id:owner,p_candidate_id:'candidate-1',p_expected_digest:'a'.repeat(64),p_parsed:expect.objectContaining({payload:prepared.payload,matched_rule_id:'rule-1'})}));
        expect(mocks.assess).toHaveBeenCalledWith(expect.objectContaining({ userId: owner, amount: 12.3, merchant: 'Cafe purchases', transactionDate: '2026-10-01' }));
    });

    it('uses the same extraction, saved-payee matching and manual rules on both paths', async () => {
        const input = event();
        const raw = structuredClone(input);
        const digest = notificationPayloadDigest(input);
        await acceptFinanceNotification(owner, 'device-1', input);
        const args = mocks.rpc.mock.calls[0][1];
        expect(args.p_parsed).toMatchObject({ status: 'review', date_provenance: 'posted_at', matched_rule_id: 'rule-1',
            payload: { amount: 10, payee_id: 'payee-1', payee_name: 'Alex Tan', category_id: 'category-1', direction: 'income', merchant: 'Alex transfers', transaction_date: '2026-09-26', matched_rule_names: ['Alex transfers'] },
        });
        expect(args.p_user_id).toBe(owner);
        expect(args.p_device_id).toBe('device-1');
        expect(args.p_event).toEqual(raw);
        expect(args.p_digest).toBe(digest);
        expect(input).toEqual(raw);
        expect(mocks.update).not.toHaveBeenCalled();
        const stored = structuredClone(mocks.tables.finance_notification_events);
        await retryFinanceNotification(owner, 'candidate-1', 'intake-1');
        expect(mocks.rpc).toHaveBeenCalledWith('finance_retry_notification_v1', expect.objectContaining({p_parsed:expect.objectContaining({payload:args.p_parsed.payload,matched_rule_id:'rule-1'})}));
        expect(mocks.tables.finance_notification_events).toEqual(stored);
        expect(mocks.rpc).toHaveBeenCalledTimes(2);
        expect(mocks.rules.mock.calls).toEqual([[owner], [owner]]);
        expect(mocks.queries.filter(query => query.table === 'dim_finance_payees')).toEqual([
            { table: 'dim_finance_payees', filters: [['user_id', owner], ['is_archived', false]] },
            { table: 'dim_finance_payees', filters: [['user_id', owner], ['is_archived', false]] },
        ]);
        expect(mocks.queries.find(query => query.table === 'finance_notification_events')?.filters).toEqual([['user_id', owner], ['intake_item_id', 'intake-1'], ['status', 'review']]);
        expect(mocks.assess.mock.calls.map(([assessment]) => assessment.intakeId)).toEqual([null, 'intake-1']);
        expect(mocks.assess).toHaveBeenCalledWith(expect.objectContaining({ userId: owner, amount: 10, merchant: 'Alex transfers', sourceId: input.source_id }));
    });
    it('retains the extracted name when only other-user or archived payees match', async () => {
        mocks.tables.dim_finance_payees = mocks.tables.dim_finance_payees.filter(row => row.id !== 'payee-1');
        await acceptFinanceNotification(owner, 'device-1', event());
        expect(mocks.rpc.mock.calls[0][1].p_parsed.payload).toMatchObject({ payee_id: null, payee_name: 'alex-tan', direction: 'expense', category_id: null });
    });
    it('retains the extracted name when multiple active payees match', async () => {
        mocks.tables.dim_finance_payees.push({ id: 'collision', user_id: owner, name: 'Alex-Tan', normalized_name: 'alextan', is_archived: false });
        await acceptFinanceNotification(owner, 'device-1', event());
        expect(mocks.rpc.mock.calls[0][1].p_parsed.payload).toMatchObject({ payee_id: null, payee_name: 'alex-tan', direction: 'expense' });
    });
    it('preserves manual rule precedence and exclusions after matching the canonical payee', async () => {
        mocks.rules.mockResolvedValue({ error: null, data: [
            rule({ id: 'later', name: 'Later', priority: 20, category_id: 'later' }),
            rule({ id: 'learned', source: 'learning', priority: 0 }),
            rule({ id: 'inactive', is_active: false, priority: 0 }),
            rule({ id: 'other-source', source_id: 'other', priority: 0 }),
            rule({ id: 'auto-conflict', auto_created_at: '2026-09-25', priority: 0 }),
            rule({ pattern: 'has been successfully transferred', match_type: 'exact_phrase' }),
        ] });
        await acceptFinanceNotification(owner, 'device-1', event());
        expect(mocks.rpc.mock.calls[0][1].p_parsed).toMatchObject({ matched_rule_id: 'rule-1', payload: { payee_id: 'payee-1', category_id: 'category-1', direction: 'income', matched_rule_names: ['Alex transfers', 'Later'] } });
    });
    it('does not load payees or rules for ignored notifications', async () => {
        const input = event();
        input.notification.text = 'Your ＯＴＰ is 123456 for payment ＲＭ １０.００';
        await acceptFinanceNotification(owner, 'device-1', input);
        expect(mocks.queries).toEqual([]);
        expect(mocks.rules).not.toHaveBeenCalled();
        expect(mocks.assess).not.toHaveBeenCalled();
        expect(mocks.rpc.mock.calls[0][1].p_parsed).toMatchObject({ status: 'ignored', payload: null });
    });
    it.each(['intake', 'retry'])('fails safely when saved payees cannot be loaded: %s', async path => {
        mocks.payeeError = { message: 'private database error' };
        const action = path === 'intake' ? acceptFinanceNotification(owner, 'device-1', event()) : retryFinanceNotification(owner, 'candidate-1', 'intake-1');
        await expect(action).rejects.toMatchObject({ message: 'Could not load Finance payees', status: 503 });
        expect(mocks.rpc).not.toHaveBeenCalled();
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.assess).not.toHaveBeenCalled();
    });
    it('does not retry another user’s or resolved notification', async () => {
        await expect(retryFinanceNotification(otherOwner, 'candidate-1', 'intake-1')).rejects.toMatchObject({ status: 409 });
        mocks.tables.finance_notification_events[0].status = 'resolved';
        await expect(retryFinanceNotification(owner, 'candidate-1', 'intake-1')).rejects.toMatchObject({ status: 409 });
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.rules).not.toHaveBeenCalled();
    });
});

describe('notification confirmation preparation', () => {
    it('derives learning from owned original text and sends the replay digest to the atomic RPC', async () => {
        const input = event();
        input.source_package = 'my.rytbank.app';
        input.notification.text = 'Settled RM10.00 with EXAMPLE CAFE.';
        mocks.tables.finance_notification_events = [{ ...storedNotification(input), payload_digest: 'digest' }];
        await confirmFinanceNotification(owner, 'candidate-1', 'intake-1', {
            p_amount:10,p_direction:'expense',p_merchant:'EXAMPLE CAFE',p_payee_name:null,
            p_transaction_date:'2026-09-26',p_reference_number:null,
        });
        expect(mocks.rpc).toHaveBeenCalledWith('finance_confirm_notification_v1', expect.objectContaining({
            p_user_id:owner,p_candidate_id:'candidate-1',p_expected_digest:'digest',
            p_learning:expect.objectContaining({definition:expect.objectContaining({direction:'expense'})}),
        }));
        expect(mocks.queries).toContainEqual({table:'finance_notification_events',filters:[['user_id',owner],['intake_item_id','intake-1']]});
        expect(JSON.stringify(mocks.rpc.mock.calls.at(-1)?.[1].p_learning)).not.toContain('EXAMPLE CAFE');
    });
});

describe('notification automatic confirmation transport', () => {
    it('uses one atomic intake call and returns completed without training or changing upload data', async () => {
        mocks.rpc.mockResolvedValue({data:{status:'completed',replayed:false},error:null});
        const input=event();
        expect(await acceptFinanceNotification(owner,'device-1',input)).toEqual({status:'completed',replayed:false});
        expect(mocks.rpc).toHaveBeenCalledTimes(1);
        expect(mocks.rpc).toHaveBeenCalledWith('finance_accept_notification_v2',expect.objectContaining({p_event:input}));
    });
    it('returns automatic Retry completion without a separate non-atomic update', async () => {
        mocks.rpc.mockResolvedValue({data:{confirmed:true},error:null});
        expect(await retryFinanceNotification(owner,'candidate-1','intake-1')).toMatchObject({data:{confirmed:true}});
        expect(mocks.update).not.toHaveBeenCalled();
        expect(mocks.rpc).toHaveBeenCalledTimes(1);
    });
});
