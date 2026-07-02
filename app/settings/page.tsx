'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
    buildCachedProfile,
    clearCachedProfile,
    getCachedProfile,
    type CachedProfile,
    setCachedProfile,
} from '@/lib/auth/profileCache';
import { CheckCircle, LogOut, Pencil, Save, User as UserIcon } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { APP_VERSION, LAST_UPDATED, shortVersionCode, VERSION_CODE } from '@/lib/version';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { AppShell } from '@/components/organisms/AppShell';
import { Project } from '@/lib/types';

const DISPLAY_NAME_MAX_LENGTH = 80;

export default function SettingsPage() {
    const router = useRouter();
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [profile, setProfile] = useState<CachedProfile | null>(null);
    const [displayNameInput, setDisplayNameInput] = useState('');
    const [isEditingDisplayName, setIsEditingDisplayName] = useState(false);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [isSigningOut, setIsSigningOut] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setProfile(getCachedProfile());

        // Fetch projects
        async function fetchProjects() {
            try {
                const res = await fetch('/api/projects');
                if (res.ok) {
                    const payload = await res.json();
                    setProjects(payload.data || []);
                }
            } catch {
                // Project navigation is best-effort when the user lacks Projects access.
            } finally {
                setIsLoading(false);
            }
        }

        fetchProjects();

        const supabase = createClient();

        async function syncProfile() {
            try {
                const { data } = await supabase.auth.getUser();
                if (data.user) {
                    const nextProfile = buildCachedProfile(data.user);
                    setCachedProfile(nextProfile);
                    setProfile(nextProfile);
                    if (!isEditingDisplayName) {
                        setDisplayNameInput(nextProfile.displayName ?? '');
                    }
                }
            } catch {
                // Keep cached profile when live fetch fails.
            }
        }

        syncProfile();

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.user) {
                const nextProfile = buildCachedProfile(session.user);
                setCachedProfile(nextProfile);
                setProfile(nextProfile);
                if (!isEditingDisplayName) {
                    setDisplayNameInput(nextProfile.displayName ?? '');
                }
            } else {
                clearCachedProfile();
                setProfile(null);
                setDisplayNameInput('');
                setIsEditingDisplayName(false);
            }
        });

        return () => {
            authListener.subscription.unsubscribe();
        };
    }, [isEditingDisplayName]);

    useEffect(() => {
        if (!toastMessage) return;

        const timeout = window.setTimeout(() => {
            setToastMessage(null);
        }, 3000);

        return () => window.clearTimeout(timeout);
    }, [toastMessage]);

    const startDisplayNameEdit = () => {
        setDisplayNameInput(profile?.displayName ?? '');
        setIsEditingDisplayName(true);
        setToastMessage(null);
        setError(null);
    };

    const cancelDisplayNameEdit = () => {
        setDisplayNameInput(profile?.displayName ?? '');
        setIsEditingDisplayName(false);
        setError(null);
    };

    const handleSaveProfile = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        const trimmedDisplayName = displayNameInput.trim();
        setError(null);
        setToastMessage(null);

        if (trimmedDisplayName.length > DISPLAY_NAME_MAX_LENGTH) {
            setError(`Display name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer`);
            return;
        }

        setIsSavingProfile(true);

        try {
            const supabase = createClient();
            const { data, error: updateError } = await supabase.auth.updateUser({
                data: { name: trimmedDisplayName || null },
            });

            if (updateError) {
                throw updateError;
            }

            if (!data.user) {
                throw new Error('Profile update succeeded but no user was returned');
            }

            const nextProfile = buildCachedProfile(data.user);
            setCachedProfile(nextProfile);
            setProfile(nextProfile);
            setDisplayNameInput(nextProfile.displayName ?? '');
            setIsEditingDisplayName(false);
            setToastMessage('Profile updated');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to update profile');
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleSignOut = async () => {
        setIsSigningOut(true);
        setError(null);
        setToastMessage(null);

        try {
            const supabase = createClient();
            clearCachedProfile();
            await supabase.auth.signOut();
            router.replace('/login');
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to sign out');
            setIsSigningOut(false);
        }
    };

    const profileInitial =
        profile?.displayName?.trim()?.charAt(0).toUpperCase() ??
        profile?.email?.trim()?.charAt(0).toUpperCase() ??
        'U';
    const currentDisplayName = profile?.displayName ?? '';
    const hasDisplayName = Boolean(currentDisplayName.trim());
    const trimmedDisplayNameInput = displayNameInput.trim();
    const hasDisplayNameChanged = trimmedDisplayNameInput !== currentDisplayName;
    const displayNameError = trimmedDisplayNameInput.length > DISPLAY_NAME_MAX_LENGTH
        ? `Display name must be ${DISPLAY_NAME_MAX_LENGTH} characters or fewer`
        : null;

    return (
        <AppShell contentClassName="p-8" projects={projects} isLoading={isLoading}>
            <div className="max-w-3xl space-y-6">
                <h1 className="text-text-primary text-2xl font-extrabold">Settings</h1>

                <Card className="p-6">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-bg-hover text-text-primary">
                                {profile?.avatarUrl ? (
                                    <Image
                                        src={profile.avatarUrl}
                                        alt={profile.displayName ?? profile.email ?? 'User avatar'}
                                        width={64}
                                        height={64}
                                        className="h-full w-full object-cover"
                                        unoptimized
                                    />
                                ) : (
                                    <span className="text-lg font-semibold">{profileInitial}</span>
                                )}
                            </div>

                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <UserIcon size={18} className="text-accent-rose" />
                                    <h2 className="text-lg font-bold font-body text-text-primary">
                                        Profile
                                    </h2>
                                </div>
                                {isEditingDisplayName ? (
                                    <form onSubmit={handleSaveProfile} className="mt-2 space-y-2">
                                        <div>
                                            <label htmlFor="displayName" className="sr-only">
                                                Display name
                                            </label>
                                            <div className="relative">
                                                <Input
                                                    id="displayName"
                                                    value={displayNameInput}
                                                    onChange={(event) => {
                                                        setDisplayNameInput(event.target.value);
                                                        setToastMessage(null);
                                                        if (error) setError(null);
                                                    }}
                                                    onBlur={() => {
                                                        if (!isSavingProfile) {
                                                            cancelDisplayNameEdit();
                                                        }
                                                    }}
                                                    onKeyDown={(event) => {
                                                        if (event.key === 'Escape') {
                                                            cancelDisplayNameEdit();
                                                        }
                                                    }}
                                                    autoFocus
                                                    maxLength={DISPLAY_NAME_MAX_LENGTH + 1}
                                                    placeholder="Name shown in IdeaDump"
                                                    error={Boolean(displayNameError)}
                                                    className="pr-11"
                                                />
                                                <button
                                                    type="submit"
                                                    disabled={!hasDisplayNameChanged || Boolean(displayNameError)}
                                                    onMouseDown={(event) => event.preventDefault()}
                                                    aria-label="Save display name"
                                                    aria-busy={isSavingProfile || undefined}
                                                    className="absolute right-1 top-1/2 inline-grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-text-secondary transition hover:bg-bg-hover hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
                                                >
                                                    <Save size={15} />
                                                </button>
                                            </div>
                                            {displayNameError ? (
                                                <p className="mt-2 text-sm text-error">{displayNameError}</p>
                                            ) : null}
                                        </div>
                                    </form>
                                ) : (
                                    <div className="group/display-name inline-flex items-center gap-2">
                                        <p className="text-text-primary">
                                            {profile?.displayName || 'No display name set'}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={startDisplayNameEdit}
                                            aria-label={hasDisplayName ? 'Edit display name' : 'Set display name'}
                                            className="inline-grid h-8 w-8 place-items-center rounded-full border border-border-default bg-bg-surface text-text-secondary opacity-0 transition hover:bg-bg-hover hover:text-text-primary focus-visible:opacity-100 group-hover/display-name:opacity-100"
                                        >
                                            <Pencil size={14} />
                                        </button>
                                    </div>
                                )}
                                <p className="text-sm text-text-secondary">
                                    {profile?.email || 'No email available'}
                                </p>
                            </div>
                        </div>

                        <Button
                            variant="secondary"
                            onClick={handleSignOut}
                            disabled={isSigningOut}
                            isLoading={isSigningOut}
                            icon={<LogOut size={16} />}
                        >
                            Sign Out
                        </Button>
                    </div>
                </Card>

                {error && (
                    <div className="p-3 rounded-lg bg-error-bg border border-error">
                        <p className="text-sm text-error">{error}</p>
                    </div>
                )}

                <div className="pt-4 text-xs text-text-muted">
                    <p>
                        Version {APP_VERSION} ({shortVersionCode(VERSION_CODE)})
                        {LAST_UPDATED ? ` | Updated ${formatDate(LAST_UPDATED)}` : ''}
                    </p>
                </div>
            </div>

            {toastMessage && (
                <div className="toast-slide-in fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg border border-success bg-success-bg px-4 py-3 text-sm font-medium text-success">
                    <CheckCircle size={16} />
                    <span>{toastMessage}</span>
                </div>
            )}
        </AppShell>
    );
}
