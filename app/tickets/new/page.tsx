'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/organisms/AppShell';
import { TicketForm } from '@/components/organisms/TicketForm';
import { PageLoader } from '@/components/atoms/Loader';
import { CreateTicketInput, Project } from '@/lib/types';

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
                setError(err instanceof Error ? err.message : 'Failed to load projects');
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
                throw new Error(payload.error || 'Failed to create ticket');
            }

            router.push('/tickets');
            router.refresh();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create ticket');
        } finally {
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
                    <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                        {error}
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
