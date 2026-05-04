'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/organisms/AppShell';
import { PageLoader } from '@/components/atoms/Loader';
import { Project, CreateTicketInput } from '@/lib/types';
import { TicketForm } from '../_components/TicketForm';

export default function NewTicketPage() {
    const router = useRouter();
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchProjects() {
            try {
                const res = await fetch('/api/projects');
                if (!res.ok) throw new Error('Failed to fetch projects');
                const payload = await res.json();
                setProjects(payload.data || []);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
            } finally {
                setIsLoading(false);
            }
        }

        fetchProjects();
    }, []);

    const handleCreate = async (data: CreateTicketInput) => {
        setIsSaving(true);
        setError(null);

        try {
            const res = await fetch('/api/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (!res.ok) {
                const payload = await res.json();
                throw new Error(payload.message || payload.error || 'Failed to create ticket');
            }

            router.push('/tickets');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
            setIsSaving(false);
        }
    };

    if (isLoading) {
        return <PageLoader />;
    }

    return (
        <AppShell contentClassName="p-8">
            <div className="max-w-3xl space-y-6">
                <h1 className="text-3xl font-heading font-medium">Raise Ticket</h1>

                {error && (
                    <div className="rounded-lg border border-error bg-error-bg p-3">
                        <p className="text-sm text-error">{error}</p>
                    </div>
                )}

                <TicketForm
                    projects={projects}
                    onSave={handleCreate}
                    onCancel={() => router.push('/tickets')}
                    isLoading={isSaving}
                    title="Raise Ticket"
                />
            </div>
        </AppShell>
    );
}
