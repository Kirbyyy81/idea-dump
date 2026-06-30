import { redirect } from 'next/navigation';
import { getFirstAllowedModulePath, getSessionUserAppAccess } from '@/lib/rbac/access';
import { AccessProvider } from '@/lib/contexts/AccessContext';

export default async function ManageTicketsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSessionUserAppAccess();

    if (!session) {
        redirect('/login');
    }

    if (!session.access.canManageAccess) {
        redirect(getFirstAllowedModulePath(session.access));
    }

    return <AccessProvider access={session.access}>{children}</AccessProvider>;
}
