import { redirect } from 'next/navigation';
import { canAccessModule, getSessionUserAppAccess } from '@/lib/rbac/access';
import { getInventory } from '@/lib/inventory/core/service';
import { InventoryClient } from './InventoryClient';

export async function InventoryPageContent({ view = 'shelf' }: { view?: 'shelf' | 'purchases' | 'usage' }) {
    const session = await getSessionUserAppAccess();
    if (!session) redirect('/login');
    if (!canAccessModule(session.access, 'inventory')) redirect('/dashboard');
    return <InventoryClient view={view} initialData={await getInventory(session.user.id)} canLinkFinance={canAccessModule(session.access, 'finance')} />;
}
