import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), authorize: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/finance/core/auth', async original => ({
    ...await original<typeof import('@/lib/finance/core/auth')>(), authorizeFinance: mocks.authorize,
}));
import { GET, POST, DELETE } from '@/app/api/finance/transfers/route';
import { GET as rules, PUT as setRule } from '@/app/api/finance/transfers/rules/route';

const id = '31000000-0000-4000-8000-000000000001';
const secondId = '31000000-0000-4000-8000-000000000002';
const entry = { kind: 'candidate', id, version: '2026-11-19T04:00:00+00:00' };
const request = (body: unknown, method = 'POST') => new NextRequest('http://localhost/api/finance/transfers', {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
beforeEach(() => { vi.clearAllMocks(); mocks.authorize.mockResolvedValue({ user: { id: 'verified-owner' } }); mocks.rpc.mockResolvedValue({ data: { id: 'transfer' }, error: null }); });

describe('Finance transfer API', () => {
    it('uses the verified owner and validated references, ignoring request ownership and automatic flags', async () => {
        const result = await POST(request({ first: { ...entry, user_id: 'attacker' }, second: { ...entry, id: secondId }, save_rule: true, user_id: 'attacker', automatic: true }));
        expect(result.status).toBe(200);
        expect(mocks.authorize).toHaveBeenCalledWith(expect.anything(), { requireJson: true });
        expect(mocks.rpc).toHaveBeenCalledWith('finance_link_internal_transfer', {
            p_user_id: 'verified-owner', p_first: entry, p_second: { ...entry, id: secondId }, p_save_rule: true, p_automatic: false,
        });
        expect(await result.json()).toMatchObject({ data: { resolved_candidate_ids: [id, secondId] } });
    });
    it.each([{ first: entry }, { first: entry, second: entry }, { first: { ...entry, version: 'bad' }, second: { ...entry, id: secondId } },
        { first: entry, second: { ...entry, id: secondId }, save_rule: 'true' }])('rejects invalid references before database access', async body => {
        expect((await POST(request(body))).status).toBe(422); expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it('preserves an authorization failure', async () => {
        mocks.authorize.mockResolvedValue({ response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });
        expect((await POST(request({ first: entry, second: { ...entry, id: secondId } }))).status).toBe(403);
        expect(mocks.rpc).not.toHaveBeenCalled();
    });
    it('maps a stale version to a conflict without exposing database errors', async () => {
        mocks.rpc.mockResolvedValue({ data: null, error: { code: '40001', message: 'Private database details' } });
        const result = await POST(request({ first: entry, second: { ...entry, id: secondId } }));
        expect(result.status).toBe(409); expect(JSON.stringify(await result.json())).not.toContain('Private database');
    });
    it('requires the saved transfer version when unlinking', async () => {
        expect((await DELETE(request({ id, version: entry.version }, 'DELETE'))).status).toBe(200);
        expect(mocks.rpc).toHaveBeenCalledWith('finance_unlink_internal_transfer', { p_user_id: 'verified-owner', p_id: id, p_version: entry.version });
    });
    it('returns only counterpart selection fields', async () => {
        mocks.rpc.mockResolvedValue({ data: { entry: { ...entry, payload: { notification_extraction: 'private' } }, options: [] }, error: null });
        const response = await GET(new NextRequest(`http://localhost/api/finance/transfers?kind=candidate&id=${id}`));
        expect(response.status).toBe(200); expect(JSON.stringify(await response.json())).not.toContain('private');
        expect(mocks.rpc).toHaveBeenCalledWith('finance_internal_transfer_options', { p_user_id: 'verified-owner', p_kind: 'candidate', p_id: id });
    });
    it('scopes listing and changing rules to the verified owner', async () => {
        await rules(new NextRequest('http://localhost/api/finance/transfers/rules'));
        expect(mocks.rpc).toHaveBeenCalledWith('finance_internal_transfer_rules', expect.objectContaining({ p_user_id: 'verified-owner', p_action: 'list' }));
        await setRule(request({ id, version: entry.version, is_active: false }, 'PUT'));
        expect(mocks.rpc).toHaveBeenCalledWith('finance_internal_transfer_rules', expect.objectContaining({ p_user_id: 'verified-owner', p_id: id, p_version: entry.version, p_action: 'set', p_active: false }));
    });
});
