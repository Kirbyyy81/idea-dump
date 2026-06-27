import { requirePageModuleAccess } from '@/lib/rbac/guards';
import { AccessProvider } from '@/lib/contexts/AccessContext';

export default async function TicketsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await requirePageModuleAccess('tickets');
    return <AccessProvider access={session.access}>{children}</AccessProvider>;
}
