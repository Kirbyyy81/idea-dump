import { redirect } from 'next/navigation';
import { FinanceShareTargetProvider } from '@/app/finance/_components/FinanceShareTargetProvider';
import { canAccessModule, getSessionUserAppAccess } from '@/lib/rbac/access';

export default async function FinanceLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await getSessionUserAppAccess();

    if (!session) {
        redirect('/login');
    }

    if (!canAccessModule(session.access, 'finance')) {
        redirect('/dashboard');
    }

    return <FinanceShareTargetProvider>{children}</FinanceShareTargetProvider>;
}
