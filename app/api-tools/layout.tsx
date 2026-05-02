import { requirePageModuleAccess } from '@/lib/rbac/guards';

export default async function ApiToolsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requirePageModuleAccess('api');
    return children;
}
