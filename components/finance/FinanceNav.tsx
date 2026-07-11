import Link from 'next/link';
import { ClipboardCheck, Landmark, List, ScanLine, SlidersHorizontal, Tags, WalletCards } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
    { href: '/finance', label: 'Overview', icon: Landmark },
    { href: '/finance/transactions', label: 'Transactions', icon: List },
    { href: '/finance/upload', label: 'Capture', icon: ScanLine },
    { href: '/finance/review', label: 'Review', icon: ClipboardCheck },
    { href: '/finance/accounts', label: 'Accounts', icon: WalletCards },
    { href: '/finance/categories', label: 'Categories', icon: Tags },
    { href: '/finance/rules', label: 'Rules', icon: SlidersHorizontal },
];

export function FinanceNav({ currentPath }: { currentPath: string }) {
    return (
        <nav aria-label="Finance navigation" className="flex overflow-x-auto border-b border-border-default">
            {items.map((item) => {
                const Icon = item.icon;
                const isActive = currentPath === item.href;
                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={cn(
                            'inline-flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors',
                            isActive
                                ? 'border-accent-blue text-text-primary'
                                : 'border-transparent text-text-muted hover:border-border-strong hover:text-text-primary'
                        )}
                    >
                        <Icon size={16} />
                        {item.label}
                    </Link>
                );
            })}
        </nav>
    );
}
