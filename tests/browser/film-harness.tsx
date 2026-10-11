import { createRoot } from 'react-dom/client';
import FilmJournalPage from '@/app/film/page';
import FilmCamerasPage from '@/app/film/cameras/page';
import { AlertProvider } from '@/lib/contexts/AlertContext';

createRoot(document.getElementById('root')!).render(
    <AlertProvider>
        {window.location.pathname === '/film/cameras' ? <FilmCamerasPage /> : <FilmJournalPage />}
    </AlertProvider>
);
