'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Save } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { FilmRoll, filmRollStatusConfig } from '@/lib/types';
import { cn } from '@/lib/utils';

interface RollHeaderProps {
    roll: FilmRoll;
    isSaving?: boolean;
    onSave?: () => void;
    showSave?: boolean;
    alternateAction?: ReactNode;
}

export function RollHeader({ roll, isSaving, onSave, showSave = true, alternateAction }: RollHeaderProps) {
    return (
        <header className="flex flex-wrap items-start justify-between gap-4">
            <div>
                <Link href="/film" className="action-link inline-flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary">
                    <ArrowLeft size={16} />
                    Back to cupboard
                </Link>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                    <h1>{roll.film_name}</h1>
                    <span className={cn('rounded-full border px-3 py-1 text-xs', filmRollStatusConfig[roll.status].colorClass)}>
                        {filmRollStatusConfig[roll.status].label}
                    </span>
                </div>
            </div>
            {alternateAction ?? (showSave && (
                <Button icon={<Save size={16} />} onClick={onSave} isLoading={isSaving}>
                    Save Roll
                </Button>
            ))}
        </header>
    );
}
