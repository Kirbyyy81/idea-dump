import { requireAccessAdminPage } from '@/lib/rbac/guards';
import { AppShell } from '@/components/organisms/AppShell';
import { AccessControlClient } from './AccessControlClient';

export default async function SettingsAccessPage() {
    await requireAccessAdminPage();
    return (
        <AppShell contentClassName="p-8">
            <AccessControlClient />
        </AppShell>
    );
}
