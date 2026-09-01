import 'server-only';

import { cache } from 'react';
import { redirect } from 'next/navigation';
import { canAccessModule, getSessionUserAppAccess } from '@/lib/rbac/access';

export const requireFinancePageAccess = cache(async () => {
    const session = await getSessionUserAppAccess();

    if (!session) {
        redirect('/login');
    }

    if (!canAccessModule(session.access, 'finance')) {
        redirect('/dashboard');
    }

    return session;
});
