import { createRoot } from 'react-dom/client';
import DocumentationLibrary from '@/app/documentation/page';
import { DocumentReader } from '@/app/documentation/_components/DocumentReader';

const id = '11111111-1111-1111-1111-111111111111';
createRoot(document.getElementById('root')!).render(
    window.location.pathname === '/documentation'
        ? <DocumentationLibrary />
        : <DocumentReader pageId={id} initialQuery={new URLSearchParams(window.location.search).get('q') || ''} />
);
