import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ admin: vi.fn(), user: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.admin }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.user } }) }));

import { getAllAppModules, getRoleModuleAssignments, getUserAppAccess } from '@/lib/rbac/access';
import { authorizeSessionModule } from '@/lib/rbac/guards';
import { saveModuleVisibility, saveRoleModules, saveUserAccess } from '@/app/settings/access/actions';

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let updates: { table: string; values: Row; filters: [string, unknown][] }[];
let disappearOnUpdate: boolean;
let from: ReturnType<typeof vi.fn>;
let rpc: ReturnType<typeof vi.fn>;

function moduleRow(slug: string, values: Row = {}): Row {
    return { modules: slug, name: `Label for ${slug}`, path: `/${slug.replaceAll('_', '-')}`,
        sort_order: 50, is_managed: true, is_always_allowed: false,
        icon: 'Files', description: null, enabled: true, ...values };
}

function query(table: string) {
    const filters: [string, unknown][] = [];
    let update: Row | undefined;
    let single = false;
    const result = () => {
        const rows = (tables[table] || []).filter((row) => filters.every(([key, value]) =>
            Array.isArray(value) ? value.includes(row[key]) : row[key] === value));
        if (update) {
            updates.push({ table, values: update, filters });
            if (disappearOnUpdate) return { data: null, error: { message: 'Module no longer exists' } };
            rows.forEach((row) => Object.assign(row, update));
        }
        return { data: single ? rows[0] ?? null : rows, error: null };
    };
    const builder = {
        select: () => builder,
        order: () => builder,
        eq: (key: string, value: unknown) => { filters.push([key, value]); return builder; },
        in: (key: string, value: unknown[]) => { filters.push([key, value]); return builder; },
        update: (value: Row) => { update = value; return builder; },
        single: () => { single = true; return builder; },
        maybeSingle: () => { single = true; return builder; },
        then: (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve),
    };
    return builder;
}

function grant(...slugs: string[]) {
    tables.bridge_role_modules = slugs.map((modules) => ({ role_id: 'role-member', dim_modules: { modules } }));
}

beforeEach(() => {
    vi.clearAllMocks();
    updates = [];
    disappearOnUpdate = false;
    tables = {
        dim_roles: [{ id: 'role-member', role: 'member' }],
        dim_modules: [moduleRow('dashboard', { is_always_allowed: true, is_managed: false }),
            moduleRow('future_module'), moduleRow('access_control')],
        bridge_user_roles: [{ user_id: 'user-1', dim_roles: { role: 'member' } }],
        bridge_role_modules: [], bridge_user_module_overrides: [],
    };
    from = vi.fn(query);
    rpc = vi.fn().mockResolvedValue({ error: null });
    mocks.admin.mockReturnValue({ from, rpc });
    mocks.user.mockResolvedValue({ data: { user: { id: 'user-1' } } });
});

describe('database module catalog', () => {
    it('lists new and hidden database modules without a code registration', async () => {
        tables.dim_modules.push(moduleRow('hidden_future', { enabled: false }));
        const catalog = await getAllAppModules();
        expect(catalog.map((row) => row.slug)).toEqual(['dashboard', 'future_module', 'access_control', 'hidden_future']);
        expect(catalog[1]).toMatchObject({ label: 'Label for future_module', path: '/future-module', icon: 'Files' });
        expect(catalog[3].enabled).toBe(false);
    });

    it.each(['https://example.org', '//example.org', '/\\example.org', '/%2fexample.org', '/x\n', '/page?next=x', null])(
        'excludes unsafe navigation path %s', async (path) => {
            tables.dim_modules.push(moduleRow('unsafe_module', { path }));
            expect((await getAllAppModules()).some((row) => row.slug === 'unsafe_module')).toBe(false);
        });

    it('rejects malformed slugs and keeps valid catalog entries', async () => {
        tables.dim_modules.push(moduleRow('__proto__'), moduleRow('white space'), moduleRow('UPPER'));
        expect((await getAllAppModules()).map((row) => row.slug)).toEqual(['dashboard', 'future_module', 'access_control']);
    });

    it('uses database grants and user-scoped overrides for new modules', async () => {
        grant('future_module');
        tables.dim_modules.push(moduleRow('another_future'));
        tables.bridge_user_module_overrides = [
            { user_id: 'user-1', effect: 'deny', dim_modules: { modules: 'future_module' } },
            { user_id: 'user-1', effect: 'allow', dim_modules: { modules: 'another_future' } },
            { user_id: 'other-user', effect: 'allow', dim_modules: { modules: 'access_control' } },
            { user_id: 'user-1', effect: 'deny', dim_modules: { modules: 'dashboard' } },
        ];
        const access = await getUserAppAccess('user-1');
        expect(access.allowedModules).toEqual(['dashboard', 'another_future']);
        expect(access.canManageAccess).toBe(false);
        expect(access.overrides.future_module).toBe('deny');
    });

    it('never authorizes absent, disabled or invalid catalog modules through grants or overrides', async () => {
        tables.dim_modules[2].enabled = false;
        tables.dim_modules.push(moduleRow('unsafe_module', { path: '//example.org' }));
        grant('absent_module', 'access_control', 'unsafe_module');
        tables.bridge_user_module_overrides = ['absent_module', 'access_control', 'unsafe_module'].map((modules) =>
            ({ user_id: 'user-1', effect: 'allow', dim_modules: { modules } }));
        const access = await getUserAppAccess('user-1');
        expect(access.allowedModules).toEqual(['dashboard']);
        expect(access.overrides).toEqual({});
        expect(access.canManageAccess).toBe(false);
    });

    it('lists role assignments only for enabled managed catalog entries', async () => {
        tables.dim_modules.push(moduleRow('hidden_future', { enabled: false }));
        grant('future_module', 'hidden_future', 'absent_module', 'dashboard');
        expect(await getRoleModuleAssignments()).toEqual([{ role: 'member', modules: ['future_module'] }]);
    });

    it('requires authentication and explicit module access for new modules', async () => {
        mocks.user.mockResolvedValueOnce({ data: { user: null } });
        const anonymous = await authorizeSessionModule('future_module');
        expect('response' in anonymous && anonymous.response.status).toBe(401);
        expect(from).not.toHaveBeenCalled();
        const denied = await authorizeSessionModule('future_module');
        expect('response' in denied && denied.response.status).toBe(403);
        grant('future_module');
        const allowed = await authorizeSessionModule('future_module');
        expect('user' in allowed && allowed.user.id).toBe('user-1');
    });
});

describe('catalog-backed access administration', () => {
    it('allows managers to show a newly registered hidden module', async () => {
        grant('access_control');
        tables.dim_modules[1].enabled = false;
        await expect(saveModuleVisibility('future_module', true)).resolves.toEqual({ success: true });
        expect(updates).toEqual([{ table: 'dim_modules', values: { enabled: true }, filters: [['modules', 'future_module']] }]);
    });

    it('rejects visibility changes to unregistered modules and protected shell modules', async () => {
        grant('access_control');
        await expect(saveModuleVisibility('absent_module', true)).rejects.toThrow('Invalid module');
        await expect(saveModuleVisibility('dashboard', false)).rejects.toThrow('cannot be hidden');
        expect(updates).toEqual([]);
    });

    it('does not report success if the module is deleted during a visibility update', async () => {
        grant('access_control');
        disappearOnUpdate = true;
        await expect(saveModuleVisibility('future_module', true)).rejects.toThrow('Module no longer exists');
    });

    it('rejects administration by unauthenticated users and non-managers', async () => {
        mocks.user.mockResolvedValueOnce({ data: { user: null } });
        await expect(saveModuleVisibility('future_module', false)).rejects.toThrow('Authentication required');
        await expect(saveModuleVisibility('future_module', false)).rejects.toThrow('do not have access');
        expect(updates).toEqual([]);
    });

    it('accepts new managed modules in role assignments and overrides but rejects unknown names', async () => {
        grant('access_control');
        await saveRoleModules('member', ['future_module']);
        await saveUserAccess('user-2', 'member', { future_module: 'deny' });
        expect(rpc).toHaveBeenCalledWith('rbac_replace_role_modules', { p_role: 'member', p_modules: ['future_module'] });
        expect(rpc).toHaveBeenCalledWith('rbac_save_user_access', { p_user_id: 'user-2', p_role: 'member', p_overrides: { future_module: 'deny' } });
        await expect(saveRoleModules('member', ['absent_module'])).rejects.toThrow('Invalid module');
        await expect(saveUserAccess('user-2', 'member', { absent_module: 'allow' })).rejects.toThrow('Invalid module');
        expect(rpc).toHaveBeenCalledTimes(2);
    });
});
