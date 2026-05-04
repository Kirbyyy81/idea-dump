import { redirect } from 'next/navigation';
import { AppShell } from '@/components/organisms/AppShell';
import { getSessionUserAppAccess } from '@/lib/rbac/access';
import { ManageTicketsClient } from '../_components/ManageTicketsClient';

export default async function ManageTicketsPage() {
    const session = await getSessionUserAppAccess();

    if (!session) {
        redirect('/login');
    }

    if (session.access.role !== 'owner' && session.access.role !== 'admin') {
        redirect('/tickets');
    }

    return (
        <AppShell contentClassName="p-8">
            <ManageTicketsClient />
        </AppShell>
    );
}
