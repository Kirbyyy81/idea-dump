'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { PageHeader } from '@/components/molecules/PageHeader';
import { FilmRoll, filmRollStatusConfig } from '@/lib/types';
import { cn } from '@/lib/utils';

interface RollHeaderProps {
    roll: FilmRoll;
    isSaving?: boolean;
    onSave?: () => void;
    showSave?: boolean;
    saveLabel?: string;
    alternateAction?: ReactNode;
}

export function RollHeader({ roll, isSaving, onSave, showSave = true, saveLabel = 'Save Roll', alternateAction }: RollHeaderProps) {
    const action = alternateAction ?? (showSave && (
        <Button icon={<Save size={16} />} onClick={onSave} isLoading={isSaving} className="w-full sm:w-auto">
            {saveLabel}
        </Button>
    ));

    return (
        <div>
            <Link href="/film" className="action-link inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary">
                <ArrowLeft size={16} />
                Back to cupboard
            </Link>
            <div className="mt-4">
                <PageHeader
                    title={roll.film_name}
                    action={(
                        <>
                            <span className={cn('rounded-full border px-3 py-1 text-xs', filmRollStatusConfig[roll.status].colorClass)}>
                                {filmRollStatusConfig[roll.status].label}
                            </span>
                            {action}
                        </>
                    )}
                    className="mb-0"
                />
            </div>
        </div>
    );
}
