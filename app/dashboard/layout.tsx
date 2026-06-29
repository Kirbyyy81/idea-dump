import { requirePageModuleAccess } from '@/lib/rbac/guards';
import { AccessProvider } from '@/lib/contexts/AccessContext';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await requirePageModuleAccess('dashboard');
    return <AccessProvider access={session.access}>{children}</AccessProvider>;
}
