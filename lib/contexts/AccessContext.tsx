'use client';

import { createContext, useContext } from 'react';
import { UserAppAccess } from '@/lib/rbac/types';

const AccessContext = createContext<UserAppAccess | null>(null);

export function AccessProvider({
    access,
    children,
}: {
    access: UserAppAccess;
    children: React.ReactNode;
}) {
    return <AccessContext.Provider value={access}>{children}</AccessContext.Provider>;
}

export function useAccess(): UserAppAccess | null {
    return useContext(AccessContext);
}
