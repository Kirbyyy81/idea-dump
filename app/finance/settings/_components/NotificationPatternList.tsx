import { Button } from '@/components/atoms/Button';
import { Toggle } from '@/components/atoms/Toggle';
import type { FinanceNotificationPart, FinanceNotificationPattern } from '@/lib/types';

export type NotificationPattern = Pick<FinanceNotificationPattern, 'id' | 'name' | 'definition' | 'is_active' | 'evidence_valid' | 'revision' | 'origin' | 'source_package'>;

interface NotificationPatternListProps {
    patterns: NotificationPattern[];
    disabled: boolean;
    onEdit: (pattern: NotificationPattern, trigger: HTMLButtonElement) => void;
    onToggle: (pattern: NotificationPattern, active: boolean) => void;
}

function slotLabel(part: Exclude<FinanceNotificationPart, string>) {
    return part.kind === 'foreign_money' ? 'foreign currency and amount' : part.field?.replace(/_/g, ' ') || part.kind;
}

const originLabels = {
    learned: 'Learned from your review',
    override: 'Your rule',
    starter: 'Starter pattern',
};

const formatClass = 'whitespace-pre-wrap font-mono text-xs leading-relaxed text-text-secondary [overflow-wrap:anywhere]';

export function NotificationPatternList({ patterns, disabled, onEdit, onToggle }: NotificationPatternListProps) {
    const rows = patterns.map(pattern => {
        const { action, direction, parts } = pattern.definition;
        const ignoresNotification = action === 'ignore';
        return {
            pattern,
            originLabel: originLabels[pattern.origin ?? 'starter'],
            format: (ignoresNotification ? 'Starts with: ' : '') + parts.map(part => typeof part === 'string' ? part : `[${slotLabel(part)}]`).join(''),
            actionLabel: ignoresNotification ? 'Ignore notification' : 'Extract fields',
            directionLabel: ignoresNotification ? 'Not applicable' : direction ? <span className="capitalize">{direction}</span> : 'Not specified',
        };
    });

    function editButton(pattern: NotificationPattern) {
        return <Button variant="ghost" className="min-h-11" aria-label={`Edit ${pattern.name}`} disabled={disabled}
            onClick={event => onEdit(pattern, event.currentTarget)}>Edit</Button>;
    }

    function statusToggle(pattern: NotificationPattern, hideLabel: boolean) {
        return <Toggle hideLabel={hideLabel} ariaLabel={`Enable ${pattern.name}`} toggleLabel={pattern.is_active ? 'Enabled' : 'Disabled'}
            className="min-h-11" checked={pattern.is_active} disabled={disabled} onChange={active => onToggle(pattern, active)} />;
    }

    function evidenceWarning(pattern: NotificationPattern) {
        return !pattern.evidence_valid && (
            <p className="mt-1 text-xs text-warning">Supporting transaction changed. Confirm a new example to relearn.</p>
        );
    }

    return (
        <div className="mt-4 min-w-0 [container-type:inline-size]">
            <ul role="list" aria-label="Notification patterns" className="space-y-3 [@container_(min-width:740px)]:hidden">
                {rows.map(({ pattern, originLabel, format, actionLabel, directionLabel }) => (
                    <li key={pattern.id} className="space-y-3 rounded-lg border border-border-default p-3 [overflow-wrap:anywhere]">
                        <div>
                            <h3 className="text-sm font-semibold">{pattern.name}</h3>
                            <p className="mt-1 text-xs text-text-secondary">{originLabel}</p>
                            {evidenceWarning(pattern)}
                        </div>
                        <dl className="space-y-2 text-sm">
                            <div>
                                <dt className="text-xs font-semibold">Matching format and fields</dt>
                                <dd className={formatClass}>{format}</dd>
                            </div>
                            <div className="flex flex-wrap gap-x-6 gap-y-2">
                                <div><dt className="text-xs font-semibold">Action</dt><dd className="text-text-secondary">{actionLabel}</dd></div>
                                <div><dt className="text-xs font-semibold">Direction</dt><dd className="text-text-secondary">{directionLabel}</dd></div>
                            </div>
                        </dl>
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-default pt-2">
                            {editButton(pattern)}
                            {statusToggle(pattern, false)}
                        </div>
                    </li>
                ))}
            </ul>
            <div className="hidden rounded-lg border border-border-default [@container_(min-width:740px)]:block">
                <table className="w-full table-fixed text-left text-sm" aria-label="Notification patterns">
                    <thead className="border-b border-border-default bg-bg-subtle text-xs text-text-secondary">
                        <tr>
                            <th scope="col" className="w-1/4 px-3 py-3 font-semibold">Pattern</th>
                            <th scope="col" className="px-3 py-3 font-semibold">Matching format and fields</th>
                            <th scope="col" className="w-28 px-3 py-3 font-semibold">Action</th>
                            <th scope="col" className="w-24 px-3 py-3 font-semibold">Direction</th>
                            <th scope="col" className="w-20 px-3 py-3 font-semibold">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border-default">
                        {rows.map(({ pattern, originLabel, format, actionLabel, directionLabel }) => (
                            <tr key={pattern.id} className="align-top">
                                <th scope="row" className="px-3 py-3 font-normal [overflow-wrap:anywhere]">
                                    <span className="font-semibold">{pattern.name}</span>
                                    <p className="mt-1 text-xs text-text-secondary">{originLabel}</p>
                                    {editButton(pattern)}
                                    {evidenceWarning(pattern)}
                                </th>
                                <td className={`px-3 py-3 ${formatClass}`}>{format}</td>
                                <td className="px-3 py-3 text-text-secondary">{actionLabel}</td>
                                <td className="px-3 py-3 text-text-secondary">{directionLabel}</td>
                                <td className="px-3 py-3">{statusToggle(pattern, true)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
