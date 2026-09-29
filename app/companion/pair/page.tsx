import { redirect } from 'next/navigation';
import { getSessionUserAppAccess, canAccessModule } from '@/lib/rbac/access';
import { COMPANION_CODE } from '@/lib/companion/core/validation';
import { getPairingLabel } from '@/lib/companion/core/repository';
import { CompanionError } from '@/lib/companion/core/http';
import { AppShell } from '@/components/organisms/AppShell';
import { PairCompanion } from './_components/PairCompanion';

export default async function PairPage({ searchParams }: { searchParams: Promise<{ code?: string | string[] }> }) {
    const params = await searchParams;
    const code = typeof params.code === 'string' ? params.code : '';
    const session = await getSessionUserAppAccess();
    if (!session) redirect('/login?next=' + encodeURIComponent('/companion/pair?code=' + encodeURIComponent(code)));
    if (!canAccessModule(session.access, 'finance')) redirect('/dashboard');
    let label: string | undefined;
    let message = 'This pairing code expired or was already used. Start again on your phone.';
    try {
        label = COMPANION_CODE.test(code) ? await getPairingLabel(session.user.id, code) : undefined;
    } catch (error) {
        if (!(error instanceof CompanionError)) throw error;
        message = error.message;
    }
    return <AppShell pageTitle="Connect companion" contentClassName="p-5 md:p-8">
        {label ? <PairCompanion code={code} label={label} account={session.user.email || 'your account'} />
            : <p role="status">{message}</p>}
    </AppShell>;
}
