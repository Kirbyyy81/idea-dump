import { beforeEach, expect, it, vi } from 'vitest';
import { inventoryFixture } from '../fixtures/inventory';

const mocks = vi.hoisted(() => ({ session: vi.fn(), access: vi.fn(), read: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); } }));
vi.mock('@/lib/rbac/access', () => ({ getSessionUserAppAccess: mocks.session, canAccessModule: mocks.access }));
vi.mock('@/lib/inventory/core/service', () => ({ getInventory: mocks.read }));
vi.mock('@/app/inventory/_components/InventoryClient', () => ({ InventoryClient: () => null }));
import ShelfPage from '@/app/inventory/page';
import PurchasesPage from '@/app/inventory/purchases/page';
import UsagePage from '@/app/inventory/usage/page';
import { InventoryPageContent } from '@/app/inventory/_components/InventoryPageContent';

beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockResolvedValue({ user: { id: 'verified-owner' }, access: {} });
    mocks.access.mockImplementation((_access, module) => module === 'inventory');
    mocks.read.mockResolvedValue(inventoryFixture);
});

it.each([[ShelfPage, 'shelf'], [PurchasesPage, 'purchases'], [UsagePage, 'usage']] as const)(
    'protects each submodule and loads its requested view (%s)', async (Page, view) => {
        const page = Page();
        expect(page.type).toBe(InventoryPageContent);
        expect(page.props.view).toBe(view);
        const result = await InventoryPageContent(page.props);
        expect(result.props).toMatchObject({ view, initialData: inventoryFixture, canLinkFinance: false });
        expect(mocks.read).toHaveBeenCalledWith('verified-owner');
        mocks.read.mockClear();
        mocks.access.mockReturnValue(false);
        await expect(InventoryPageContent(page.props)).rejects.toThrow('redirect:/dashboard');
        expect(mocks.read).not.toHaveBeenCalled();
        mocks.session.mockResolvedValue(null);
        await expect(InventoryPageContent(page.props)).rejects.toThrow('redirect:/login');
        expect(mocks.read).not.toHaveBeenCalled();
    }
);
