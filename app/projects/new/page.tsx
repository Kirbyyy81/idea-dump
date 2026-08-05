'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { ProjectForm } from '../_components/ProjectForm';
import { CreateProjectInput } from '@/lib/types';
import { createProject } from '@/lib/projects/client';

export default function NewProjectPage() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (data: CreateProjectInput) => {
        setIsSubmitting(true);
        setError(null);

        try {
            const project = await createProject(data);
            router.push(`/projects/${project.id}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
            setIsSubmitting(false);
        }
    };

    return (
        <AppShell
            contentClassName="p-5 md:p-8"
            pageTitle="New Project"
            headerAction={
                <Link
                    href="/projects"
                    aria-label="Back to projects"
                    className="flex items-center gap-2 text-text-secondary transition-colors hover:text-text-primary"
                >
                    <ArrowLeft size={20} />
                </Link>
            }
        >
            <div className="max-w-3xl">
                {error && (
                    <div className="p-3 rounded-lg bg-error-bg border border-error mb-6">
                        <p className="text-sm text-error">{error}</p>
                    </div>
                )}

                <ProjectForm
                    onSubmit={handleSubmit}
                    isSubmitting={isSubmitting}
                    onCancel={() => router.push('/projects')}
                    submitLabel="Create Project"
                />
            </div>
        </AppShell>
    );
}
