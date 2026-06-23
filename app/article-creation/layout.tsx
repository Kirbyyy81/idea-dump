import { requirePageModuleAccess } from '@/lib/rbac/guards';

export default async function ArticleCreationLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requirePageModuleAccess('article_creation');
    return children;
}
