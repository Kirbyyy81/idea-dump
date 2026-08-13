import { redirect } from 'next/navigation';

export default function FinanceRulesRedirect() {
    redirect('/finance/settings?section=rules');
}
