'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Search, X } from 'lucide-react';
import { AppModuleSlug, AppRoleSlug } from '@/lib/rbac/constants';
import { AccessAdminRoleRecord, AccessAdminUserRecord, ModuleOverrideEffect } from '@/lib/rbac/types';
import { Badge } from '@/components/atoms/Badge';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { Select } from '@/components/atoms/Select';
import { useAlert } from '@/lib/contexts/AlertContext';
import {
    AccessUsersResponse,
    createRole as createRoleAction,
    getAccessAdminData,
    saveRoleModules,
    saveUserAccess,
} from './actions';

interface UserDraftState {
    overrides: Partial<Record<AppModuleSlug, ModuleOverrideEffect | null>>;
    role: AppRoleSlug;
}

interface NewOverrideDraft {
    effect: ModuleOverrideEffect;
    module: AppModuleSlug | '';
}

interface NewRoleDraft {
    modules: AppModuleSlug[];
    role: string;
}

const DEFAULT_NEW_OVERRIDE: NewOverrideDraft = {
    module: '',
    effect: 'allow',
};

const DEFAULT_NEW_ROLE: NewRoleDraft = {
    role: '',
    modules: [],
};

function getUserLabel(user: AccessAdminUserRecord) {
    return user.displayName || user.email || user.id;
}

function getUserSubLabel(user: AccessAdminUserRecord) {
    return user.email || user.id;
}

function getInitials(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return 'U';

    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
        return parts[0].slice(0, 2).toUpperCase();
    }

    return `${parts[0][0] ?? ''}${parts[1][0] ?? ''}`.toUpperCase();
}

interface AccessControlClientProps {
    initialData: AccessUsersResponse;
}

export function AccessControlClient({ initialData }: AccessControlClientProps) {
    const { showSuccess } = useAlert();
    const [data, setData] = useState<AccessUsersResponse>(initialData);
    const [error, setError] = useState<string | null>(null);
    const [savingRole, setSavingRole] = useState<AppRoleSlug | null>(null);
    const [savingUserId, setSavingUserId] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [roleDrafts, setRoleDrafts] = useState<Partial<Record<AppRoleSlug, AppModuleSlug[]>>>({});
    const [userDrafts, setUserDrafts] = useState<Record<string, UserDraftState>>({});
    const [newOverrideDrafts, setNewOverrideDrafts] = useState<Record<string, NewOverrideDraft>>({});
    const [newRoleDraft, setNewRoleDraft] = useState<NewRoleDraft>(DEFAULT_NEW_ROLE);
    const [isCreatingRole, setIsCreatingRole] = useState(false);
    const [showNewRoleRow, setShowNewRoleRow] = useState(false);

    async function reloadData() {
        const fresh = await getAccessAdminData();
        setData(fresh);
    }

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

    const moduleSlugs = useMemo(() => data?.modules.map((moduleRow) => moduleRow.slug) ?? [], [data]);
    const moduleLabels = useMemo(
        () => new Map(data?.modules.map((moduleRow) => [moduleRow.slug, moduleRow.label]) ?? []),
        [data]
    );
    const getModuleLabel = (moduleSlug: AppModuleSlug) => moduleLabels.get(moduleSlug) ?? moduleSlug;

    const getRoleDraft = (roleRecord: AccessAdminRoleRecord) =>
        roleDrafts[roleRecord.role] ?? [...roleRecord.modules];

    const getUserDraft = (user: AccessAdminUserRecord) =>
        userDrafts[user.id] ?? { overrides: { ...user.overrides }, role: user.role };

    const getNewOverrideDraft = (userId: string) => newOverrideDrafts[userId] ?? DEFAULT_NEW_OVERRIDE;

    const toggleRoleModule = (role: AppRoleSlug, moduleSlug: AppModuleSlug) => {
        setRoleDrafts((current) => {
            const existing = current[role] ?? data?.roleAssignments.find((record) => record.role === role)?.modules ?? [];
            const next = existing.includes(moduleSlug)
                ? existing.filter((value) => value !== moduleSlug)
                : [...existing, moduleSlug];

            return {
                ...current,
                [role]: moduleSlugs.filter((managedModule) => next.includes(managedModule)),
            };
        });
    };

    const toggleNewRoleModule = (moduleSlug: AppModuleSlug) => {
        setNewRoleDraft((current) => ({
            ...current,
            modules: current.modules.includes(moduleSlug)
                ? current.modules.filter((value) => value !== moduleSlug)
                : [...current.modules, moduleSlug],
        }));
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

    const updateNewOverrideDraft = (
        userId: string,
        field: keyof NewOverrideDraft,
        value: AppModuleSlug | '' | ModuleOverrideEffect
    ) => {
        setNewOverrideDrafts((current) => ({
            ...current,
            [userId]: {
                ...getNewOverrideDraft(userId),
                [field]: value,
            } as NewOverrideDraft,
        }));
    };

    const addUserOverride = (user: AccessAdminUserRecord) => {
        const draft = getNewOverrideDraft(user.id);
        if (!draft.module) {
            setError('Choose a module before adding an exception');
            return;
        }

        updateUserOverride(user, draft.module, draft.effect);
        setNewOverrideDrafts((current) => ({
            ...current,
            [user.id]: DEFAULT_NEW_OVERRIDE,
        }));
        setError(null);
    };

    const removeUserOverride = (user: AccessAdminUserRecord, moduleSlug: AppModuleSlug) => {
        updateUserOverride(user, moduleSlug, null);
    };

    const saveRole = async (roleRecord: AccessAdminRoleRecord) => {
        const modules = getRoleDraft(roleRecord);
        setSavingRole(roleRecord.role);
        setError(null);

        try {
            await saveRoleModules(roleRecord.role, modules);

            setRoleDrafts((current) => {
                const next = { ...current };
                delete next[roleRecord.role];
                return next;
            });
            await reloadData();
            showSuccess(`${roleRecord.role} modules were updated.`, 'Access saved');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save role modules');
        } finally {
            setSavingRole(null);
        }
    };

    const createRole = async () => {
        const role = newRoleDraft.role.trim();
        if (!role) {
            setError('Role name is required');
            return;
        }

        setIsCreatingRole(true);
        setError(null);

        try {
            await createRoleAction(role, newRoleDraft.modules);

            setNewRoleDraft(DEFAULT_NEW_ROLE);
            setShowNewRoleRow(false);
            await reloadData();
            showSuccess(`${role} was created.`, 'Role created');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create role');
        } finally {
            setIsCreatingRole(false);
        }
    };

    const cancelCreateRole = () => {
        setNewRoleDraft(DEFAULT_NEW_ROLE);
        setShowNewRoleRow(false);
        setError(null);
    };

    const saveUser = async (user: AccessAdminUserRecord) => {
        const draft = getUserDraft(user);
        setSavingUserId(user.id);
        setError(null);

        try {
            await saveUserAccess(user.id, draft.role, draft.overrides);

            setUserDrafts((current) => {
                const next = { ...current };
                delete next[user.id];
                return next;
            });
            setNewOverrideDrafts((current) => {
                const next = { ...current };
                delete next[user.id];
                return next;
            });
            await reloadData();
            showSuccess(`${getUserLabel(user)} access was updated.`, 'Access saved');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save access');
        } finally {
            setSavingUserId(null);
        }
    };

    return (
        <div className="mx-auto min-h-screen max-w-7xl space-y-8 p-8">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Link
                        href="/settings"
                        className="flex items-center gap-2 text-text-secondary transition-colors hover:text-text-primary"
                    >
                        <ArrowLeft size={20} />
                    </Link>
                    <h1 className="text-text-primary">Access Control</h1>
                </div>

                <div className="relative w-full max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search users"
                        className="pl-9"
                    />
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-error bg-error-bg px-4 py-3">
                    <p className="text-sm text-error">{error}</p>
                </div>
            )}

            <Card className="overflow-hidden rounded-2xl p-0">
                <div className="border-b border-border-default bg-bg-hover px-6 py-3">
                    <div className="grid grid-cols-[180px_minmax(0,1fr)_110px] items-center gap-4 text-xs uppercase tracking-[0.18em] text-text-muted">
                        <span>Role</span>
                        <span>Modules</span>
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => setShowNewRoleRow(true)}
                                className="inline-flex items-center gap-1 text-xs font-medium normal-case tracking-normal text-text-secondary transition-colors hover:text-text-primary"
                            >
                                <Plus size={14} />
                                New
                            </button>
                        </div>
                    </div>
                </div>

                <div>
                    {showNewRoleRow && (
                        <div className="grid grid-cols-[180px_minmax(0,1fr)_110px] items-start gap-4 border-b border-border-default px-6 py-4">
                            <div className="space-y-2 pt-0.5">
                                <span className="text-xs uppercase tracking-[0.14em] text-text-muted">New role</span>
                                <Input
                                    value={newRoleDraft.role}
                                    onChange={(e) =>
                                        setNewRoleDraft((current) => ({
                                            ...current,
                                            role: e.target.value,
                                        }))
                                    }
                                    placeholder="e.g. editor"
                                    className="h-10"
                                />
                            </div>

                            <div className="flex flex-wrap gap-2 pt-6">
                                {data?.modules.map((moduleRow) => {
                                    const selected = newRoleDraft.modules.includes(moduleRow.slug);

                                    return (
                                        <button
                                            key={`new-role-${moduleRow.slug}`}
                                            type="button"
                                            onClick={() => toggleNewRoleModule(moduleRow.slug)}
                                            className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                                                selected
                                                    ? 'border-accent-rose bg-accent-rose/10 text-accent-rose'
                                                    : 'border-border-default bg-transparent text-text-secondary hover:border-border-strong hover:text-text-primary'
                                            }`}
                                        >
                                            {moduleRow.label}
                                        </button>
                                    );
                                })}
                            </div>

                            <div className="flex justify-end gap-2 pt-6">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    onClick={cancelCreateRole}
                                    disabled={isCreatingRole}
                                    className="h-9 px-4 text-xs"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="button"
                                    onClick={createRole}
                                    isLoading={isCreatingRole}
                                    disabled={isCreatingRole}
                                    className="h-9 px-4 text-xs"
                                >
                                    Create
                                </Button>
                            </div>
                        </div>
                    )}

                    {data?.roleAssignments.map((roleRecord) => {
                        const draftModules = getRoleDraft(roleRecord);

                        return (
                            <div
                                key={roleRecord.role}
                                className="grid grid-cols-[180px_minmax(0,1fr)_110px] items-start gap-4 border-b border-border-default px-6 py-4 last:border-b-0 hover:bg-bg-hover"
                            >
                                <div className="pt-1">
                                    <span className="font-medium uppercase tracking-[0.14em] text-text-primary">
                                        {roleRecord.role}
                                    </span>
                                </div>

                                <div className="flex flex-wrap gap-2">
                                    {data.modules.map((moduleRow) => {
                                        const selected = draftModules.includes(moduleRow.slug);

                                        return (
                                            <button
                                                key={`${roleRecord.role}-${moduleRow.slug}`}
                                                type="button"
                                                onClick={() => toggleRoleModule(roleRecord.role, moduleRow.slug)}
                                                className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${
                                                    selected
                                                        ? 'border-accent-rose bg-accent-rose/10 text-accent-rose'
                                                        : 'border-border-default bg-transparent text-text-secondary hover:border-border-strong hover:text-text-primary'
                                                }`}
                                            >
                                                {moduleRow.label}
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="flex justify-end">
                                    <Button
                                        onClick={() => saveRole(roleRecord)}
                                        isLoading={savingRole === roleRecord.role}
                                        disabled={savingRole === roleRecord.role}
                                        className="h-9 px-4 text-xs"
                                    >
                                        Save
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Card>

            <Card className="overflow-hidden rounded-2xl p-0">
                <div className="border-b border-border-default bg-bg-hover px-6 py-3">
                    <div className="grid grid-cols-[minmax(0,1.4fr)_180px_minmax(0,1.2fr)_110px] items-center gap-4 text-xs uppercase tracking-[0.18em] text-text-muted">
                        <span>User</span>
                        <span>Role</span>
                        <span>Exceptions</span>
                        <span>Action</span>
                    </div>
                </div>

                <div>
                    {filteredUsers.map((user) => {
                        const draft = getUserDraft(user);
                        const newOverride = getNewOverrideDraft(user.id);
                        const overrideEntries = moduleSlugs.filter(
                            (moduleSlug) => draft.overrides[moduleSlug]
                        );
                        const availableModules = data?.modules.filter(
                            (moduleRow) => !overrideEntries.includes(moduleRow.slug)
                        ) ?? [];
                        const userLabel = getUserLabel(user);

                        return (
                            <div
                                key={user.id}
                                className="grid grid-cols-[minmax(0,1.4fr)_180px_minmax(0,1.2fr)_110px] items-start gap-4 border-b border-border-default px-6 py-4 last:border-b-0 hover:bg-bg-hover"
                            >
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border-default bg-bg-hover text-xs font-semibold uppercase text-text-primary">
                                        {getInitials(userLabel)}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="truncate font-medium text-text-primary">{userLabel}</p>
                                        <p className="truncate text-xs text-text-secondary">{getUserSubLabel(user)}</p>
                                    </div>
                                </div>

                                <div className="pt-0.5">
                                    <Select
                                        value={draft.role}
                                        onChange={(nextValue) => updateUserRole(user, nextValue as AppRoleSlug)}
                                        className="min-w-[160px]"
                                        buttonClassName="h-10 text-sm"
                                        options={(data?.roles ?? []).map((role) => ({ value: role, label: role }))}
                                    />
                                </div>

                                <div className="space-y-3">
                                    {overrideEntries.length > 0 ? (
                                        <div className="space-y-2">
                                            {overrideEntries.map((moduleSlug) => (
                                                <div
                                                    key={`${user.id}-${moduleSlug}`}
                                                    className="flex items-center gap-2 rounded-xl border border-border-default bg-bg-hover px-3 py-2"
                                                >
                                                    <Badge className="shrink-0">{getModuleLabel(moduleSlug)}</Badge>
                                                    <Select
                                                        value={draft.overrides[moduleSlug] ?? 'allow'}
                                                        onChange={(nextValue) =>
                                                            updateUserOverride(
                                                                user,
                                                                moduleSlug,
                                                                nextValue as ModuleOverrideEffect
                                                            )
                                                        }
                                                        className="min-w-[110px]"
                                                        buttonClassName="h-8 border-0 bg-transparent px-2 text-xs"
                                                        options={[
                                                            { value: 'allow', label: 'Allow' },
                                                            { value: 'deny', label: 'Deny' },
                                                        ]}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={() => removeUserOverride(user, moduleSlug)}
                                                        className="ml-auto rounded-full p-1 text-text-muted transition-colors hover:bg-bg-hover hover:text-text-primary"
                                                        aria-label={`Remove ${getModuleLabel(moduleSlug)} override`}
                                                    >
                                                        <X size={14} />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <span className="inline-flex h-10 items-center text-sm text-text-muted">
                                            None
                                        </span>
                                    )}

                                    {availableModules.length > 0 && (
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Select
                                                value={newOverride.module}
                                                onChange={(nextValue) =>
                                                    updateNewOverrideDraft(
                                                        user.id,
                                                        'module',
                                                        nextValue as AppModuleSlug | ''
                                                    )
                                                }
                                                className="min-w-[150px]"
                                                buttonClassName="h-9 text-xs"
                                                options={[
                                                    { value: '', label: 'Add module' },
                                                    ...availableModules.map((moduleRow) => ({
                                                        value: moduleRow.slug,
                                                        label: moduleRow.label,
                                                    })),
                                                ]}
                                            />
                                            <Select
                                                value={newOverride.effect}
                                                onChange={(nextValue) =>
                                                    updateNewOverrideDraft(
                                                        user.id,
                                                        'effect',
                                                        nextValue as ModuleOverrideEffect
                                                    )
                                                }
                                                className="min-w-[110px]"
                                                buttonClassName="h-9 text-xs"
                                                options={[
                                                    { value: 'allow', label: 'Allow' },
                                                    { value: 'deny', label: 'Deny' },
                                                ]}
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                onClick={() => addUserOverride(user)}
                                                className="h-9 px-3 text-xs"
                                                icon={<Plus size={14} />}
                                            >
                                                Add
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                <div className="flex justify-end">
                                    <Button
                                        onClick={() => saveUser(user)}
                                        isLoading={savingUserId === user.id}
                                        disabled={savingUserId === user.id}
                                        className="h-9 px-4 text-xs"
                                    >
                                        Save
                                    </Button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </Card>
        </div>
    );
}
