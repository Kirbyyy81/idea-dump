import Link from 'next/link';
import { Plus } from 'lucide-react';

export function AddRollLink() {
    return (
        <Link
            href="/film/new-roll"
            aria-label="Add roll"
            title="Add roll"
            className="action-link inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border-strong bg-bg-surface text-text-primary hover:bg-bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-current"
        >
            <Plus size={22} aria-hidden="true" />
        </Link>
    );
}
