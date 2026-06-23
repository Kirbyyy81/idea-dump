import { NextResponse } from 'next/server';
import {
    canAccessModule,
    getDisplayName,
    getRoleModuleAssignments,
    getSessionUserAppAccess,
    getUserAppAccess,
} from '@/lib/rbac/access';
import { ACCESS_MANAGER_ROLES, MANAGED_MODULE_SLUGS } from '@/lib/rbac/constants';
import { createAdminClient } from '@/lib/supabase/admin';
import { AccessAdminRoleRecord, AccessAdminUserRecord } from '@/lib/rbac/types';

export async function GET() {
    const session = await getSessionUserAppAccess();
    if (!session) {
        return NextResponse.json(
            { error: 'Unauthorized', message: 'Authentication required' },
            { status: 401 }
        );
    }

    if (
        !canAccessModule(session.access, 'access_control') ||
        !ACCESS_MANAGER_ROLES.includes(session.access.role)
    ) {
        return NextResponse.json(
            { error: 'Forbidden', message: 'You do not have access to this module' },
            { status: 403 }
        );
    }

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
    });

    if (error) {
        return NextResponse.json({ error: 'Failed to load users', message: error.message }, { status: 500 });
    }

    const [roleAssignments, roleRows, users] = await Promise.all([
        getRoleModuleAssignments(),
        admin.from('DIM_roles').select('role').order('role', { ascending: true }),
        Promise.all(
            data.users.map(async (user) => {
                const access = await getUserAppAccess(user.id);

                return {
                    allowedModules: access.allowedModules,
                    displayName: getDisplayName(user),
                    email: user.email ?? null,
                    id: user.id,
                    overrides: access.overrides,
                    role: access.role,
                } satisfies AccessAdminUserRecord;
            })
        ),
    ]);

    if (roleRows.error) {
        return NextResponse.json(
            { error: 'Failed to load roles', message: roleRows.error.message },
            { status: 500 }
        );
    }

    const orderedRoles = [
        ...(roleRows.data || []).map((row) => row.role).filter((role) => role === 'owner' || role === 'admin' || role === 'member'),
        ...(roleRows.data || []).map((row) => row.role).filter((role) => role !== 'owner' && role !== 'admin' && role !== 'member'),
    ];

    return NextResponse.json({
        data: {
            modules: MANAGED_MODULE_SLUGS,
            roles: orderedRoles,
            roleAssignments: roleAssignments satisfies AccessAdminRoleRecord[],
            users,
        },
    });
}
