import { redirect } from 'next/navigation';
import { canAccessModule, getSessionUserAppAccess } from '@/lib/rbac/access';
import { getInventory } from '@/lib/inventory/core/service';
import { InventoryClient } from './_components/InventoryClient';

export const dynamic = 'force-dynamic';
export default async function InventoryPage() {
    const session = await getSessionUserAppAccess();
    if (!session) redirect('/login');
    if (!canAccessModule(session.access, 'inventory')) redirect('/dashboard');
    return <InventoryClient initialData={await getInventory(session.user.id)} canLinkFinance={canAccessModule(session.access, 'finance')} />;
}
