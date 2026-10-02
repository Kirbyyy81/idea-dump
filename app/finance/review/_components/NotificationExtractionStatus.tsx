import type { FinanceNotificationExtractionTrace } from '@/lib/types';
const labels: Record<string,string>={amount:'amount',direction:'direction',merchant:'merchant',payee_name:'payee',transaction_date:'date',reference_number:'reference'};
export function NotificationExtractionStatus({trace}:{trace?:FinanceNotificationExtractionTrace}) {
    if (!trace) return null;
    const learned=Object.entries(trace.fields).filter(([,v])=>v?.learned).map(([field])=>labels[field]);
    return <>
        {learned.length ? <p className="mt-2 text-xs text-text-muted">Learned from your reviews: {learned.join(', ')}.</p> : null}
        {trace.conflicts.length ? <p role="status" className="mt-2 text-xs text-warning">Conflicting notification patterns. Review {trace.conflicts.map(f=>labels[f]).join(', ')}.</p> : null}
    </>;
}
