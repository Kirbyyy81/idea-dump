import type { User } from '@supabase/supabase-js';

export interface CachedProfile {
    id: string;
    email: string | null;
    displayName: string | null;
    avatarUrl: string | null;
}

export const AUTH_PROFILE_STORAGE_KEY = 'idea-dump.auth-profile';

const isBrowser = () => typeof window !== 'undefined';

export function buildCachedProfile(user: User): CachedProfile {
    const metadata = user.user_metadata ?? {};
    const displayName =
        metadata.full_name ??
        metadata.name ??
        metadata.user_name ??
        metadata.preferred_username ??
        null;

    const avatarUrl =
        metadata.avatar_url ??
        metadata.picture ??
        null;

    return {
        id: user.id,
        email: user.email ?? null,
        displayName,
        avatarUrl,
    };
}

export function getCachedProfile(): CachedProfile | null {
    if (!isBrowser()) {
        return null;
    }

    const raw = window.localStorage.getItem(AUTH_PROFILE_STORAGE_KEY);
    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw) as CachedProfile;
    } catch {
        window.localStorage.removeItem(AUTH_PROFILE_STORAGE_KEY);
        return null;
    }
}

export function setCachedProfile(profile: CachedProfile) {
    if (!isBrowser()) {
        return;
    }

    window.localStorage.setItem(AUTH_PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function clearCachedProfile() {
    if (!isBrowser()) {
        return;
    }

    window.localStorage.removeItem(AUTH_PROFILE_STORAGE_KEY);
}
