import { createRoot } from 'react-dom/client';
import { InventoryClient } from '@/app/inventory/_components/InventoryClient';
import { inventoryFixture } from '../fixtures/inventory';
import type { InventoryData } from '@/lib/types';
const fixture = (window as unknown as { inventoryInitial?: InventoryData }).inventoryInitial ?? inventoryFixture;
createRoot(document.getElementById('root')!).render(<InventoryClient initialData={fixture} canLinkFinance />);
