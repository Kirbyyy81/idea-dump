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
import { LogOut, User as UserIcon } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { APP_VERSION, LAST_UPDATED, shortVersionCode, VERSION_CODE } from '@/lib/version';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { AppShell } from '@/components/organisms/AppShell';

export default function SettingsPage() {
    const router = useRouter();
    const [profile, setProfile] = useState<CachedProfile | null>(null);
    const [isSigningOut, setIsSigningOut] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setProfile(getCachedProfile());

        const supabase = createClient();

        async function syncProfile() {
            try {
                const { data } = await supabase.auth.getUser();
                if (data.user) {
                    const nextProfile = buildCachedProfile(data.user);
                    setCachedProfile(nextProfile);
                    setProfile(nextProfile);
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
            } else {
                clearCachedProfile();
                setProfile(null);
            }
        });

        return () => {
            authListener.subscription.unsubscribe();
        };
    }, []);

    const handleSignOut = async () => {
        setIsSigningOut(true);
        setError(null);

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

    return (
        <AppShell contentClassName="p-8">
            <div className="max-w-3xl space-y-6">
                <h1 className="text-text-primary text-3xl font-heading font-medium">Settings</h1>

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
                                    <h2 className="text-xl font-semibold font-body text-text-primary">
                                        Profile
                                    </h2>
                                </div>
                                <p className="text-text-primary">
                                    {profile?.displayName || 'No display name set'}
                                </p>
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
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                        <p className="text-sm text-red-400">{error}</p>
                    </div>
                )}

                <div className="pt-4 text-xs text-text-muted">
                    <p>
                        Version {APP_VERSION} ({shortVersionCode(VERSION_CODE)})
                        {LAST_UPDATED ? ` | Updated ${formatDate(LAST_UPDATED)}` : ''}
                    </p>
                </div>
            </div>
        </AppShell>
    );
}
