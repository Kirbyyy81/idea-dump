import { requirePageModuleAccess } from '@/lib/rbac/guards';

export default async function LogViewerLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requirePageModuleAccess('logs');
    return children;
}
