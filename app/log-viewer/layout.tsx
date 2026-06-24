import { requirePageModuleAccess } from '@/lib/rbac/guards';

export default async function LogViewerLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requirePageModuleAccess('log_viewer');
    return children;
}
