import { useId, useLayoutEffect, useRef, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Card } from '@/components/atoms/Card';
import { cn } from '@/lib/utils';

interface RulesSettingsSectionProps {
    title: string;
    expanded: boolean;
    onToggle: () => void;
    children: ReactNode;
}

export function RulesSettingsSection({ title, expanded, onToggle, children }: RulesSettingsSectionProps) {
    const headingId = useId();
    const panelId = useId();
    const button = useRef<HTMLButtonElement>(null);

    useLayoutEffect(() => {
        if (expanded) button.current?.scrollIntoView?.({ block: 'nearest' });
    }, [expanded]);

    return (
        <Card className="min-w-0 p-0">
            <h2>
                <button
                    ref={button}
                    id={headingId}
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={event => {
                        event.currentTarget.focus({ preventScroll: true });
                        onToggle();
                    }}
                    className="flex min-h-14 w-full scroll-mt-16 items-center justify-between gap-3 rounded-lg px-4 py-3 text-left text-base font-bold hover:bg-bg-subtle focus-visible:outline-offset-[-3px] sm:px-5 md:scroll-mt-4"
                >
                    {title}
                    <ChevronDown aria-hidden="true" size={18} className={cn('shrink-0 text-text-secondary', expanded && 'rotate-180')} />
                </button>
            </h2>
            <div id={panelId} role="region" aria-labelledby={headingId} hidden={!expanded} className="border-t border-border-default">
                {children}
            </div>
        </Card>
    );
}
