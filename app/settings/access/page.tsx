import { requireAccessAdminPage } from '@/lib/rbac/guards';
import { AppShell } from '@/components/organisms/AppShell';
import { AccessManagementPanel } from '@/components/settings/AccessManagementPanel';

export default async function SettingsAccessPage() {
    await requireAccessAdminPage();
    return (
        <AppShell contentClassName="p-8">
            <AccessManagementPanel />
        </AppShell>
    );
}
