import { requirePageModuleAccess } from '@/lib/rbac/guards';

export default async function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    await requirePageModuleAccess('settings');
    return children;
}
