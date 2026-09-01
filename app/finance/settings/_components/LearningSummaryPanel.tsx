import { Card } from '@/components/atoms/Card';
import { SparkleDoodleIcon } from '@/components/atoms/DoodleIcons';
import { InlineLoadingState } from '@/components/molecules/InlineLoadingState';
import type { FinanceLearningSummary, FinanceParserTemplateField } from '@/lib/types';

interface LearningSummaryPanelProps {
    isLoading: boolean;
    summary: FinanceLearningSummary;
}

const fieldLabels: Record<FinanceParserTemplateField, string> = {
    source_id: 'Source',
    reference_number: 'Reference number',
    merchant: 'Merchant',
    transaction_date: 'Transaction date',
    direction: 'Direction',
    payee_name: 'Payee',
    notes: 'Notes',
    recipient_reference: 'Recipient reference',
    amount: 'Amount',
};

function formatRunTime(value: string) {
    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}

function formatPercentage(value: number | null) {
    return value == null ? 'Not measured' : `${Math.round(value * 100)}%`;
}

export function LearningSummaryPanel({ isLoading, summary }: LearningSummaryPanelProps) {
    return (
        <Card className="overflow-hidden p-0">
            <div className="flex items-center gap-2 border-b border-border-default px-5 py-4">
                <SparkleDoodleIcon size={17} className="text-accent-apricot" />
                <h2 className="text-base font-bold">Learning</h2>
            </div>
            {isLoading ? <InlineLoadingState label="Loading learning status..." /> : null}
            {!isLoading && summary.availability === 'unavailable' ? (
                <p className="px-5 py-4 text-sm text-error" role="status">
                    Learning status is unavailable. Rules remain available.
                </p>
            ) : null}
            {!isLoading && summary.availability === 'never_run' ? (
                <p className="px-5 py-4 text-sm text-text-muted">No learning run has completed yet.</p>
            ) : null}
            {!isLoading && summary.availability === 'available' ? (
                <div className="space-y-5 px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm text-text-secondary">
                            Last completed <time dateTime={summary.latest_run.finished_at}>{formatRunTime(summary.latest_run.finished_at)}</time>
                        </p>
                        <span className={summary.latest_run.status === 'succeeded'
                            ? 'rounded-full bg-bg-subtle px-2 py-1 text-xs font-semibold text-success'
                            : 'rounded-full bg-bg-subtle px-2 py-1 text-xs font-semibold text-error'}>
                            {summary.latest_run.status === 'succeeded' ? 'Succeeded' : 'Failed'}
                        </span>
                    </div>

                    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
                        {[
                            ['Corrections examined', summary.latest_run.corrections_examined],
                            ['Active source', summary.template_counts.active_source],
                            ['Active field', summary.template_counts.active_field],
                            ['Shadow', summary.template_counts.shadow],
                            ['Gathering evidence', summary.template_counts.proposed],
                            ['Rejected', summary.template_counts.rejected],
                            ['Disabled', summary.template_counts.disabled],
                        ].map(([label, count]) => (
                            <div key={label} className="border border-border-default bg-bg-subtle px-3 py-3">
                                <dt className="text-xs text-text-muted">{label}</dt>
                                <dd className="mt-1 text-lg font-bold">{count}</dd>
                            </div>
                        ))}
                    </dl>

                    <div className="grid gap-4 text-sm md:grid-cols-2">
                        <div>
                            <h3 className="font-semibold">Compatibility rules</h3>
                            <p className="mt-1 text-text-secondary">
                                {summary.active_reference_rules} active reference transforms
                            </p>
                            <p className="mt-1 text-text-muted">
                                {summary.latest_run.category_rules_created + summary.latest_run.reference_rules_created} created,{' '}
                                {summary.latest_run.category_rules_updated + summary.latest_run.reference_rules_updated} updated,{' '}
                                {summary.latest_run.category_rules_disabled + summary.latest_run.reference_rules_disabled} disabled
                            </p>
                        </div>
                        <div>
                            <h3 className="font-semibold">Active template metrics</h3>
                            {summary.active_metrics.length ? (
                                <ul className="mt-1 space-y-1 text-text-secondary">
                                    {summary.active_metrics.map((metric) => (
                                        <li key={metric.field_name}>
                                            {fieldLabels[metric.field_name]}: {formatPercentage(metric.minimum_precision)} precision,{' '}
                                            {formatPercentage(metric.average_coverage)} coverage
                                        </li>
                                    ))}
                                </ul>
                            ) : <p className="mt-1 text-text-muted">No active parser templates.</p>}
                        </div>
                    </div>

                    {summary.recent_outcomes.length ? (
                        <div>
                            <h3 className="font-semibold">Recent outcomes</h3>
                            <ul className="mt-2 divide-y divide-border-default border border-border-default">
                                {summary.recent_outcomes.map((outcome) => (
                                    <li key={`${outcome.field_name}-${outcome.updated_at}`} className="px-3 py-2 text-sm">
                                        <span className="font-semibold">{fieldLabels[outcome.field_name]} {outcome.status}</span>
                                        <span className="text-text-secondary">: {outcome.reason}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ) : null}
                </div>
            ) : null}
        </Card>
    );
}
