'use client';

import { useState } from 'react';
import { Button } from '@/components/atoms/Button';
import { financeTemplateFieldLabels } from '@/lib/finance/shadowRules';
import type { FinanceShadowRulesSummary } from '@/lib/types';

const pageSize = 5;
const percentage = (value: number | null) => value === null ? 'Not measured' : `${Math.round(value * 100)}%`;
const date = (value: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export function ShadowRulesList({ summary }: { summary: FinanceShadowRulesSummary }) {
    const [page, setPage] = useState(0);
    const rules = summary.availability === 'available' ? summary.rules : [];
    const lastPage = Math.max(0, Math.ceil(rules.length / pageSize) - 1);
    const currentPage = Math.min(page, lastPage);
    return (
        <section aria-labelledby="shadow-rules-heading" className="space-y-2 border-t border-border-default px-5 py-3">
            <h3 id="shadow-rules-heading" className="text-sm font-semibold">Rules in shadow testing</h3>
            {summary.availability === 'unavailable' ? (
                <p role="status" className="text-sm text-error">Shadow rule details are unavailable. Other rules remain available.</p>
            ) : rules.length === 0 ? (
                <p className="text-sm text-text-muted">No rules are currently in shadow testing.</p>
            ) : (
                <>
                    <ul className="divide-y divide-border-default rounded-lg border border-border-default">
                        {rules.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map((rule) => (
                            <li key={rule.id} className="min-w-0 space-y-1 px-3 py-2">
                                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                                    <h4 className="min-w-0 break-words text-sm font-semibold">
                                        {rule.source_name ?? 'Source unavailable'}: {financeTemplateFieldLabels[rule.field_name]}
                                    </h4>
                                    <span className="rounded-full bg-bg-subtle px-2 py-0.5 text-xs text-text-secondary">
                                        Algorithm {rule.algorithm_version} · Version {rule.template_version}
                                    </span>
                                </div>
                                <dl className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                                    {[
                                        ['Supporting transactions', rule.evidence_count],
                                        ['Evaluations', rule.evaluation_count],
                                        ['Contradictions', rule.contradiction_count],
                                        ['Replay precision', percentage(rule.precision)],
                                        ['Replay coverage', percentage(rule.coverage)],
                                    ].map(([label, value]) => (
                                        <div key={label} className="flex gap-1"><dt className="text-text-secondary">{label}:</dt><dd className="font-semibold tabular-nums">{value}</dd></div>
                                    ))}
                                </dl>
                                <p className="text-xs text-text-secondary">
                                    {rule.shadow_started_at ? <>Testing since <time dateTime={rule.shadow_started_at}>{date(rule.shadow_started_at)}</time>. </> : 'Testing start not recorded. '}
                                    {rule.evaluated_at ? <>Last evaluated <time dateTime={rule.evaluated_at}>{date(rule.evaluated_at)}</time>.</> : 'Not evaluated yet.'}
                                </p>
                            </li>
                        ))}
                    </ul>
                    <p className="text-xs text-text-secondary">
                        Replay counts include historical evidence, not just fresh shadow reviews. These metrics do not indicate approval to activate.
                    </p>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs text-text-secondary" role="status">
                            Showing {currentPage * pageSize + 1}-{Math.min((currentPage + 1) * pageSize, rules.length)} of {summary.total} shadow rules.
                            {summary.total > rules.length ? ` The newest ${rules.length} rules are available here.` : ''}
                        </p>
                        {lastPage > 0 ? <div className="flex gap-2">
                            <Button variant="secondary" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button>
                            <Button variant="secondary" disabled={currentPage === lastPage} onClick={() => setPage(currentPage + 1)}>Next</Button>
                        </div> : null}
                    </div>
                </>
            )}
        </section>
    );
}
