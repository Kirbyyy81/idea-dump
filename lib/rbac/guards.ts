import { NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import { AppModuleSlug } from '@/lib/rbac/constants';
import {
    canAccessModule,
    getFirstAllowedModulePath,
    getSessionUserAppAccess,
    getUserAppAccess,
} from '@/lib/rbac/access';
import { ResolvedIdentity } from '@/lib/auth/resolveIdentity';

export async function requirePageModuleAccess(moduleSlug: AppModuleSlug) {
    const session = await getSessionUserAppAccess();
    if (!session) {
        redirect('/login');
    }

    if (!canAccessModule(session.access, moduleSlug)) {
        redirect(getFirstAllowedModulePath(session.access));
    }

    return session;
}

export async function requireAccessAdminPage() {
    const session = await getSessionUserAppAccess();
    if (!session) {
        redirect('/login');
    }

    if (!session.access.canManageAccess) {
        redirect(getFirstAllowedModulePath(session.access));
    }

    return session;
}

export async function authorizeSessionModule(moduleSlug: AppModuleSlug) {
    const session = await getSessionUserAppAccess();
    if (!session) {
        return { response: createUnauthorizedResponse() as NextResponse };
    }

    if (!canAccessModule(session.access, moduleSlug)) {
        return { response: createForbiddenModuleResponse() as NextResponse };
    }

    return session;
}

export async function authorizeIdentityModule(
    identity: ResolvedIdentity,
    moduleSlug: AppModuleSlug
) {
    const access = await getUserAppAccess(identity.user_id);

    if (!canAccessModule(access, moduleSlug)) {
        return { response: createForbiddenModuleResponse() as NextResponse };
    }

    return { access };
}

export function createForbiddenModuleResponse() {
    return NextResponse.json(
        { error: 'Forbidden', message: 'You do not have access to this module' },
        { status: 403 }
    );
}

export function createUnauthorizedResponse() {
    return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
    );
}
