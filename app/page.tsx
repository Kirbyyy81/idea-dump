import { redirect } from 'next/navigation';
import { getSessionUserAppAccess } from '@/lib/rbac/access';

export default async function HomePage() {
    const session = await getSessionUserAppAccess();

    if (!session) {
        redirect('/login');
    }

    redirect('/dashboard');
}
