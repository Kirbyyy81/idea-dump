import { requirePageModuleAccess } from '@/lib/rbac/guards';
import { AccessProvider } from '@/lib/contexts/AccessContext';

export default async function ApiToolsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await requirePageModuleAccess('api');
    return <AccessProvider access={session.access}>{children}</AccessProvider>;
}
