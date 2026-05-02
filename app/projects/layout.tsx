import { requirePageModuleAccess } from '@/lib/rbac/guards';

export default async function ProjectsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requirePageModuleAccess('projects');
    return children;
}
