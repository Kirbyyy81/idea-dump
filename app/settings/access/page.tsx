import { AppShell } from '@/components/organisms/AppShell';
import { AccessControlClient } from './AccessControlClient';
import { getAccessAdminData } from './actions';

export default async function SettingsAccessPage() {
    const data = await getAccessAdminData();
    return (
        <AppShell contentClassName="p-4 md:p-8">
            <AccessControlClient initialData={data} />
        </AppShell>
    );
}
