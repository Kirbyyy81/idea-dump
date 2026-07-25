import { AppShell } from '@/components/organisms/AppShell';
import { AccessProvider } from '@/lib/contexts/AccessContext';
import { getSessionUserAppAccess } from '@/lib/rbac/access';
import { FinanceShareTargetProvider } from '@/app/finance/_components/FinanceShareTargetProvider';

export async function AuthenticatedAppShell({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSessionUserAppAccess();

    return (
        <AccessProvider access={session?.access ?? null}>
            <FinanceShareTargetProvider>
                <AppShell persistent>{children}</AppShell>
            </FinanceShareTargetProvider>
        </AccessProvider>
    );
}
