import { DocumentReader } from '../_components/DocumentReader';

export const dynamic = 'force-dynamic';

export default async function DocumentationPage({
    params,
    searchParams,
}: {
    params: Promise<{ pageId: string }>;
    searchParams: Promise<{ q?: string }>;
}) {
    const [{ pageId }, { q }] = await Promise.all([params, searchParams]);
    return <DocumentReader key={pageId} pageId={pageId} initialQuery={typeof q === 'string' ? q.slice(0, 120) : ''} />;
}
