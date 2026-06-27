import { requireAccessAdminPage } from '@/lib/rbac/guards';
import { AppShell } from '@/components/organisms/AppShell';
import { AccessControlClient } from './AccessControlClient';
import { getAccessAdminData } from './actions';

export default async function SettingsAccessPage() {
    await requireAccessAdminPage();
    const data = await getAccessAdminData();
    return (
        <AppShell contentClassName="p-8">
            <AccessControlClient initialData={data} />
        </AppShell>
    );
}
