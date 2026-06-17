import { requirePageModuleAccess } from '@/lib/rbac/guards';

export default async function FilmLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requirePageModuleAccess('film_journal');
    return children;
}
