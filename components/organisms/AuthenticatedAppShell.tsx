import { BarcodeSessionProvider } from '@/app/log-viewer/barcode-generator/_components/BarcodeSessionProvider';
import { AppShell } from '@/components/organisms/AppShell';
import { AccessProvider } from '@/lib/contexts/AccessContext';
import { getSessionUserAppAccess } from '@/lib/rbac/access';
import { FinanceShareRejectionBridge } from '@/app/_components/FinanceShareRejectionBridge';

export async function AuthenticatedAppShell({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSessionUserAppAccess();

    return (
        <AccessProvider access={session?.access ?? null}>
            <FinanceShareRejectionBridge />
            <BarcodeSessionProvider>
                <AppShell persistent>{children}</AppShell>
            </BarcodeSessionProvider>
        </AccessProvider>
    );
}
