'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AppModuleSlug, AppRoleSlug, MODULE_LABELS } from '@/lib/rbac/constants';
import { ModuleOverrideEffect } from '@/lib/rbac/types';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';

interface AccessAdminUserRecord {
    allowedModules: AppModuleSlug[];
    displayName: string | null;
    email: string | null;
    id: string;
    overrides: Partial<Record<AppModuleSlug, ModuleOverrideEffect>>;
    role: AppRoleSlug;
}

interface AccessUsersResponse {
    modules: AppModuleSlug[];
    roles: AppRoleSlug[];
    users: AccessAdminUserRecord[];
}

export function AccessManagementPanel() {
    const [data, setData] = useState<AccessUsersResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [savingUserId, setSavingUserId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [drafts, setDrafts] = useState<
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

    const getDraft = (user: AccessAdminUserRecord) =>
        drafts[user.id] ?? { overrides: { ...user.overrides }, role: user.role };

    const updateRole = (user: AccessAdminUserRecord, role: AppRoleSlug) => {
        setDrafts((current) => ({
            ...current,
            [user.id]: {
                ...getDraft(user),
                role,
            },
        }));
    };

    const updateOverride = (
        user: AccessAdminUserRecord,
        moduleSlug: AppModuleSlug,
        effect: ModuleOverrideEffect | null
    ) => {
        setDrafts((current) => ({
            ...current,
            [user.id]: {
                ...getDraft(user),
                overrides: {
                    ...getDraft(user).overrides,
                    [moduleSlug]: effect,
                },
            },
        }));
    };

    const saveUser = async (user: AccessAdminUserRecord) => {
        const draft = getDraft(user);
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

            setDrafts((current) => {
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
            <div className="min-h-screen p-8 max-w-6xl mx-auto">
                <p className="text-text-secondary">Loading access controls...</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen p-8 max-w-6xl mx-auto">
            <div className="flex items-center justify-between gap-4 mb-8">
                <div className="flex items-center gap-4">
                    <Link
                        href="/settings"
                        className="flex items-center gap-2 transition-colors text-text-secondary hover:text-text-primary"
                    >
                        <ArrowLeft size={20} />
                    </Link>
                    <div>
                        <h1 className="text-text-primary">Access Control</h1>
                        <p className="text-sm text-text-secondary">
                            Manage role-based module access and user overrides.
                        </p>
                    </div>
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

            <div className="space-y-4">
                {filteredUsers.map((user) => {
                    const draft = getDraft(user);
                    const effectiveModules = new Set(user.allowedModules);

                    return (
                        <Card key={user.id} className="p-6">
                            <div className="flex items-start justify-between gap-6">
                                <div>
                                    <h2 className="text-lg font-semibold text-text-primary">
                                        {user.displayName || user.email || user.id}
                                    </h2>
                                    <p className="text-sm text-text-secondary">{user.email || user.id}</p>
                                </div>

                                <div className="flex items-center gap-3">
                                    <select
                                        value={draft.role}
                                        onChange={(e) => updateRole(user, e.target.value as AppRoleSlug)}
                                        className="input min-w-[160px]"
                                    >
                                        {data?.roles.map((role) => (
                                            <option key={role} value={role}>
                                                {role}
                                            </option>
                                        ))}
                                    </select>

                                    <Button
                                        onClick={() => saveUser(user)}
                                        isLoading={savingUserId === user.id}
                                        disabled={savingUserId === user.id}
                                    >
                                        Save
                                    </Button>
                                </div>
                            </div>

                            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                {data?.modules.map((moduleSlug) => {
                                    const override = draft.overrides[moduleSlug] ?? null;
                                    const isEffective = effectiveModules.has(moduleSlug);

                                    return (
                                        <div
                                            key={moduleSlug}
                                            className="rounded-lg border border-border-default p-4 bg-bg-hover"
                                        >
                                            <div className="flex items-center justify-between gap-2 mb-3">
                                                <div>
                                                    <p className="font-medium text-text-primary">
                                                        {MODULE_LABELS[moduleSlug]}
                                                    </p>
                                                    <p className="text-xs text-text-muted">
                                                        Effective: {isEffective ? 'Allowed' : 'Denied'}
                                                    </p>
                                                </div>
                                                <span className="text-xs uppercase text-text-muted">
                                                    {override ? `Override: ${override}` : 'Role default'}
                                                </span>
                                            </div>

                                            <div className="flex gap-2">
                                                <Button
                                                    variant={override === 'allow' ? 'primary' : 'ghost'}
                                                    className="flex-1"
                                                    onClick={() => updateOverride(user, moduleSlug, 'allow')}
                                                >
                                                    Allow
                                                </Button>
                                                <Button
                                                    variant={override === 'deny' ? 'primary' : 'ghost'}
                                                    className="flex-1"
                                                    onClick={() => updateOverride(user, moduleSlug, 'deny')}
                                                >
                                                    Deny
                                                </Button>
                                                <Button
                                                    variant={!override ? 'primary' : 'ghost'}
                                                    className="flex-1"
                                                    onClick={() => updateOverride(user, moduleSlug, null)}
                                                >
                                                    Default
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </Card>
                    );
                })}
            </div>
        </div>
    );
}
