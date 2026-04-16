import { requireAccessAdminPage } from '@/lib/rbac/guards';
import { AccessManagementPanel } from '@/components/settings/AccessManagementPanel';

export default async function SettingsAccessPage() {
    await requireAccessAdminPage();
    return <AccessManagementPanel />;
}
