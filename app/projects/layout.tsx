import { requirePageModuleAccess } from '@/lib/rbac/guards';
import { AccessProvider } from '@/lib/contexts/AccessContext';

export default async function ProjectsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await requirePageModuleAccess('projects');
    return <AccessProvider access={session.access}>{children}</AccessProvider>;
}
