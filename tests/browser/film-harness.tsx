import { createRoot } from 'react-dom/client';
import FilmJournalPage from '@/app/film/page';
import FilmCamerasPage from '@/app/film/cameras/page';
import NewFilmRollPage from '@/app/film/new-roll/page';
import FilmRollDetailPage from '@/app/film/rolls/[id]/page';
import { AlertProvider } from '@/lib/contexts/AlertContext';

createRoot(document.getElementById('root')!).render(
    <AlertProvider>
        {window.location.pathname === '/film/cameras' ? <FilmCamerasPage />
            : window.location.pathname === '/film/new-roll' ? <NewFilmRollPage />
                : window.location.pathname.startsWith('/film/rolls/') ? <FilmRollDetailPage />
                    : <FilmJournalPage />}
    </AlertProvider>
);
