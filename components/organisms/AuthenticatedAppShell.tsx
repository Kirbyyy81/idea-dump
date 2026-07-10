import { AppShell } from '@/components/organisms/AppShell';
import { AccessProvider } from '@/lib/contexts/AccessContext';
import { getSessionUserAppAccess } from '@/lib/rbac/access';

export async function AuthenticatedAppShell({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSessionUserAppAccess();

    return (
        <AccessProvider access={session?.access ?? null}>
            <AppShell persistent>{children}</AppShell>
        </AccessProvider>
    );
}
