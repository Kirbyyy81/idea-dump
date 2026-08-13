import { redirect } from 'next/navigation';

export default function FinanceSourcesRedirect() {
    redirect('/finance/settings?section=sources');
}
