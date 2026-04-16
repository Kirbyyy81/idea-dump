import { requirePageModuleAccess } from '@/lib/rbac/guards';

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requirePageModuleAccess('dashboard');
    return children;
}
