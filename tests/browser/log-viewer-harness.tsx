import { createRoot } from 'react-dom/client';
import { LogViewer } from '@/app/log-viewer/_components';

createRoot(document.getElementById('root')!).render(
  <main style={{ padding: 12, maxWidth: 1200, margin: '0 auto' }}><LogViewer /></main>
);
