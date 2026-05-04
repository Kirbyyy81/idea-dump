import { requirePageModuleAccess } from '@/lib/rbac/guards';

export default async function TicketsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requirePageModuleAccess('tickets');
    return children;
}
