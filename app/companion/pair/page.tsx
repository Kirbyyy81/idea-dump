import { redirect } from 'next/navigation';
import { getSessionUserAppAccess, canAccessModule } from '@/lib/rbac/access';
import { COMPANION_CODE } from '@/lib/companion/core/validation';
import { getPairingLabel } from '@/lib/companion/core/repository';
import { AppShell } from '@/components/organisms/AppShell';
import { PairCompanion } from './_components/PairCompanion';

export default async function PairPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
    const { code = '' } = await searchParams;
    const session = await getSessionUserAppAccess();
    if (!session) redirect('/login?next=' + encodeURIComponent('/companion/pair?code=' + encodeURIComponent(code)));
    if (!canAccessModule(session.access, 'finance')) redirect('/dashboard');
    const label = COMPANION_CODE.test(code) ? await getPairingLabel(code) : undefined;
    return <AppShell pageTitle="Connect companion" contentClassName="p-5 md:p-8">
        {label ? <PairCompanion code={code} label={label} account={session.user.email || 'your account'} />
            : <p role="status">This pairing code expired or was already used. Start again on your phone.</p>}
    </AppShell>;
}
