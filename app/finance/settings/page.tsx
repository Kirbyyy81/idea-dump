import Link from 'next/link';
import type { ComponentType } from 'react';
import { AppShell } from '@/components/organisms/AppShell';
import { cn } from '@/lib/utils';
import { CategoriesSettingsPanel } from './_components/CategoriesSettingsPanel';
import { RulesSettingsPanel } from './_components/RulesSettingsPanel';
import { SourcesSettingsPanel } from './_components/SourcesSettingsPanel';
import {
    FINANCE_SETTINGS_SECTIONS,
    FinanceSettingsSection,
    getFinanceSettingsSection,
} from './sections';

const SECTION_LABELS: Record<FinanceSettingsSection, string> = {
    sources: 'Sources',
    categories: 'Categories',
    rules: 'Rules',
};

const PANELS: Record<FinanceSettingsSection, ComponentType> = {
    sources: SourcesSettingsPanel,
    categories: CategoriesSettingsPanel,
    rules: RulesSettingsPanel,
};

export default async function FinanceSettingsPage({
    searchParams,
}: {
    searchParams: Promise<{ section?: string | string[] }>;
}) {
    const section = getFinanceSettingsSection((await searchParams).section);
    const ActivePanel = PANELS[section];

    return (
        <AppShell contentClassName="p-5 md:p-8" pageTitle="Finance settings" headerClassName="mb-3">
            <nav aria-label="Finance settings sections" className="mx-auto mb-5 flex max-w-7xl gap-2 overflow-x-auto border-b border-border-default">
                {FINANCE_SETTINGS_SECTIONS.map((item) => (
                    <Link
                        key={item}
                        href={`/finance/settings?section=${item}`}
                        aria-current={section === item ? 'page' : undefined}
                        className={cn(
                            'min-h-10 shrink-0 border-b-2 px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-dark focus-visible:ring-offset-2',
                            section === item
                                ? 'border-text-primary text-text-primary'
                                : 'border-transparent text-text-muted hover:text-text-primary'
                        )}
                    >
                        {SECTION_LABELS[item]}
                    </Link>
                ))}
            </nav>
            <ActivePanel />
        </AppShell>
    );
}
