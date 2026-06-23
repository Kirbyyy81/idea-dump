import { requirePageModuleAccess } from '@/lib/rbac/guards';

export default async function LogsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requirePageModuleAccess('logs');
    return children;
}
