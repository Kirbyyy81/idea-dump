import { AppShell } from '@/components/organisms/AppShell';
export default function InventoryLoading() {
    return <AppShell pageTitle="Inventory" isLoading loadingMessage="Loading your shelf..." />;
}
