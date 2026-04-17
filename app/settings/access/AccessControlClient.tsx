'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AppModuleSlug, AppRoleSlug, MANAGED_MODULE_SLUGS, MODULE_LABELS } from '@/lib/rbac/constants';
import { AccessAdminRoleRecord, AccessAdminUserRecord, ModuleOverrideEffect } from '@/lib/rbac/types';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';

interface AccessUsersResponse {
    modules: AppModuleSlug[];
    roleAssignments: AccessAdminRoleRecord[];
    roles: AppRoleSlug[];
    users: AccessAdminUserRecord[];
}

export function AccessControlClient() {
    const [data, setData] = useState<AccessUsersResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [savingRole, setSavingRole] = useState<AppRoleSlug | null>(null);
    const [savingUserId, setSavingUserId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [roleDrafts, setRoleDrafts] = useState<Partial<Record<AppRoleSlug, AppModuleSlug[]>>>({});
    const [userDrafts, setUserDrafts] = useState<
        Record<string, { overrides: Partial<Record<AppModuleSlug, ModuleOverrideEffect | null>>; role: AppRoleSlug }>
    >({});

    async function loadAccessData() {
        try {
            const res = await fetch('/api/access/users');
            if (!res.ok) {
                const payload = await res.json();
                throw new Error(payload.message || 'Failed to load access data');
            }

            const payload = await res.json();
            setData(payload.data);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load access data');
        } finally {
            setIsLoading(false);
        }
    }

    useEffect(() => {
        loadAccessData();
    }, []);

    const filteredUsers = useMemo(() => {
        if (!data) return [];

        const query = search.trim().toLowerCase();
        if (!query) return data.users;

        return data.users.filter((user) =>
            [user.displayName, user.email, user.role]
                .filter(Boolean)
                .some((value) => String(value).toLowerCase().includes(query))
        );
    }, [data, search]);

    const getRoleDraft = (roleRecord: AccessAdminRoleRecord) =>
        roleDrafts[roleRecord.role] ?? [...roleRecord.modules];

    const getUserDraft = (user: AccessAdminUserRecord) =>
        userDrafts[user.id] ?? { overrides: { ...user.overrides }, role: user.role };

    const toggleRoleModule = (role: AppRoleSlug, moduleSlug: AppModuleSlug) => {
        setRoleDrafts((current) => {
            const existing = current[role] ?? data?.roleAssignments.find((record) => record.role === role)?.modules ?? [];
            const next = existing.includes(moduleSlug)
                ? existing.filter((value) => value !== moduleSlug)
                : [...existing, moduleSlug];

            return {
                ...current,
                [role]: MANAGED_MODULE_SLUGS.filter((managedModule) => next.includes(managedModule)),
            };
        });
    };

    const updateUserRole = (user: AccessAdminUserRecord, role: AppRoleSlug) => {
        setUserDrafts((current) => ({
            ...current,
            [user.id]: {
                ...getUserDraft(user),
                role,
            },
        }));
    };

    const updateUserOverride = (
        user: AccessAdminUserRecord,
        moduleSlug: AppModuleSlug,
        effect: ModuleOverrideEffect | null
    ) => {
        setUserDrafts((current) => ({
            ...current,
            [user.id]: {
                ...getUserDraft(user),
                overrides: {
                    ...getUserDraft(user).overrides,
                    [moduleSlug]: effect,
                },
            },
        }));
    };

    const saveRole = async (roleRecord: AccessAdminRoleRecord) => {
        const modules = getRoleDraft(roleRecord);
        setSavingRole(roleRecord.role);
        setError(null);

        try {
            const res = await fetch(`/api/access/roles/${roleRecord.role}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ modules }),
            });

            if (!res.ok) {
                const payload = await res.json();
                throw new Error(payload.message || 'Failed to save role modules');
            }

            setRoleDrafts((current) => {
                const next = { ...current };
                delete next[roleRecord.role];
                return next;
            });
            await loadAccessData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save role modules');
        } finally {
            setSavingRole(null);
        }
    };

    const saveUser = async (user: AccessAdminUserRecord) => {
        const draft = getUserDraft(user);
        setSavingUserId(user.id);
        setError(null);

        try {
            const res = await fetch(`/api/access/users/${user.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    overrides: draft.overrides,
                    role: draft.role,
                }),
            });

            if (!res.ok) {
                const payload = await res.json();
                throw new Error(payload.message || 'Failed to save access');
            }

            setUserDrafts((current) => {
                const next = { ...current };
                delete next[user.id];
                return next;
            });
            await loadAccessData();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save access');
        } finally {
            setSavingUserId(null);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen p-8 max-w-7xl mx-auto">
                <p className="text-text-secondary">Loading access controls...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-8 max-w-7xl mx-auto">
            <div className="flex items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-4">
                    <Link
                        href="/settings"
                        className="flex items-center gap-2 transition-colors text-text-secondary hover:text-text-primary"
                    >
                        <ArrowLeft size={20} />
                    </Link>
                    <h1 className="text-text-primary">Access Control</h1>
                </div>

                <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search users..."
                    className="max-w-xs"
                />
            </div>

            {error && (
                <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-sm text-red-400">{error}</p>
                </div>
            )}

            <div className="space-y-8">
                <Card className="p-0 overflow-hidden">
                    <div className="border-b border-border-default px-6 py-4">
                        <h2 className="text-lg font-semibold text-text-primary">Roles</h2>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-bg-hover text-left text-text-secondary">
                                <tr>
                                    <th className="px-6 py-3 font-medium">Role</th>
                                    <th className="px-6 py-3 font-medium">Assigned modules</th>
                                    <th className="px-6 py-3 font-medium w-32">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data?.roleAssignments.map((roleRecord) => {
                                    const draftModules = getRoleDraft(roleRecord);

                                    return (
                                        <tr key={roleRecord.role} className="border-t border-border-default align-top">
                                            <td className="px-6 py-4 font-medium text-text-primary uppercase">
                                                {roleRecord.role}
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-wrap gap-2">
                                                    {data.modules.map((moduleSlug) => {
                                                        const selected = draftModules.includes(moduleSlug);

                                                        return (
                                                            <button
                                                                key={`${roleRecord.role}-${moduleSlug}`}
                                                                type="button"
                                                                onClick={() =>
                                                                    toggleRoleModule(roleRecord.role, moduleSlug)
                                                                }
                                                                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                                                                    selected
                                                                        ? 'border-accent-rose bg-accent-rose/10 text-accent-rose'
                                                                        : 'border-border-default bg-bg-hover text-text-secondary hover:text-text-primary'
                                                                }`}
                                                            >
                                                                {MODULE_LABELS[moduleSlug]}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <Button
                                                    onClick={() => saveRole(roleRecord)}
                                                    isLoading={savingRole === roleRecord.role}
                                                    disabled={savingRole === roleRecord.role}
                                                >
                                                    Save
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>

                <Card className="p-0 overflow-hidden">
                    <div className="border-b border-border-default px-6 py-4">
                        <h2 className="text-lg font-semibold text-text-primary">Users</h2>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                            <thead className="bg-bg-hover text-left text-text-secondary">
                                <tr>
                                    <th className="px-6 py-3 font-medium">User</th>
                                    <th className="px-6 py-3 font-medium">Role</th>
                                    <th className="px-6 py-3 font-medium">Special modules</th>
                                    <th className="px-6 py-3 font-medium w-32">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredUsers.map((user) => {
                                    const draft = getUserDraft(user);
                                    const overrideEntries = MANAGED_MODULE_SLUGS.filter(
                                        (moduleSlug) => draft.overrides[moduleSlug]
                                    );

                                    return (
                                        <tr key={user.id} className="border-t border-border-default align-top">
                                            <td className="px-6 py-4">
                                                <div>
                                                    <p className="font-medium text-text-primary">
                                                        {user.displayName || user.email || user.id}
                                                    </p>
                                                    <p className="text-xs text-text-secondary">{user.email || user.id}</p>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <select
                                                    value={draft.role}
                                                    onChange={(e) =>
                                                        updateUserRole(user, e.target.value as AppRoleSlug)
                                                    }
                                                    className="input min-w-[160px]"
                                                >
                                                    {data?.roles.map((role) => (
                                                        <option key={role} value={role}>
                                                            {role}
                                                        </option>
                                                    ))}
                                                </select>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="mb-3 flex flex-wrap gap-2">
                                                    {overrideEntries.length > 0 ? (
                                                        overrideEntries.map((moduleSlug) => (
                                                            <Badge key={`${user.id}-badge-${moduleSlug}`}>
                                                                {MODULE_LABELS[moduleSlug]}: {draft.overrides[moduleSlug]}
                                                            </Badge>
                                                        ))
                                                    ) : (
                                                        <span className="text-xs text-text-muted">None</span>
                                                    )}
                                                </div>

                                                <div className="space-y-2">
                                                    {data?.modules.map((moduleSlug) => (
                                                        <div
                                                            key={`${user.id}-${moduleSlug}`}
                                                            className="grid grid-cols-[minmax(0,1fr)_140px] items-center gap-3"
                                                        >
                                                            <span className="text-xs text-text-secondary">
                                                                {MODULE_LABELS[moduleSlug]}
                                                            </span>
                                                            <select
                                                                value={draft.overrides[moduleSlug] ?? 'default'}
                                                                onChange={(e) =>
                                                                    updateUserOverride(
                                                                        user,
                                                                        moduleSlug,
                                                                        e.target.value === 'default'
                                                                            ? null
                                                                            : (e.target.value as ModuleOverrideEffect)
                                                                    )
                                                                }
                                                                className="input h-9 text-xs"
                                                            >
                                                                <option value="default">Role default</option>
                                                                <option value="allow">Allow</option>
                                                                <option value="deny">Deny</option>
                                                            </select>
                                                        </div>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <Button
                                                    onClick={() => saveUser(user)}
                                                    isLoading={savingUserId === user.id}
                                                    disabled={savingUserId === user.id}
                                                >
                                                    Save
                                                </Button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        </div>
    );
}
