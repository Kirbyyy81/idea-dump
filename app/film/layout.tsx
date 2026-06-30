import { requirePageModuleAccess } from '@/lib/rbac/guards';
import { AccessProvider } from '@/lib/contexts/AccessContext';

export default async function FilmLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await requirePageModuleAccess('film_journal');
    return <AccessProvider access={session.access}>{children}</AccessProvider>;
}
