import { createRoot } from 'react-dom/client';
import { InventoryClient } from '@/app/inventory/_components/InventoryClient';
import { Sidebar } from '@/components/organisms/Sidebar';
import { AccessProvider } from '@/lib/contexts/AccessContext';
import { inventoryRequest } from '@/lib/inventory/core/client';
import type { InventoryData } from '@/lib/types';

async function render() {
    const data = await inventoryRequest<InventoryData>('/api/inventory');
    const view = window.location.pathname.endsWith('/purchases') ? 'purchases' : window.location.pathname.endsWith('/usage') ? 'usage' : 'shelf';
    createRoot(document.getElementById('root')!).render(<AccessProvider access={{
        allowedModules: ['inventory'], canManageAccess: false, overrides: {}, role: 'owner', userId: 'fixture-owner',
        modules: [{ slug: 'inventory', label: 'Inventory', path: '/inventory', icon: 'Package', description: null, enabled: true, isAlwaysAllowed: false, isManaged: true, sortOrder: 86 }],
    }}><style>{'aside.nav-shell { position: static; height: auto; max-height: none; }'}</style><Sidebar projects={[]} /><InventoryClient initialData={data} canLinkFinance view={view} /></AccessProvider>);
}
void render();
