'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { ProjectForm } from '../../_components/ProjectForm';
import { CreateProjectInput } from '@/lib/types';
import { PageLoader } from '@/components/atoms/Loader';
import { getProject, updateProject } from '@/lib/projects/client';

export default function EditProjectPage() {
    const router = useRouter();
    const params = useParams();
    const projectId = params.id as string;

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [initialData, setInitialData] = useState<CreateProjectInput | undefined>(undefined);

    // Fetch existing project
    useEffect(() => {
        async function fetchProject() {
            try {
                const data = await getProject(projectId);

                setInitialData({
                    title: data.title,
                    description: data.description || '',
                    prd_content: data.prd_content || '',
                    github_url: data.github_url || '',
                    deploy_url: data.deploy_url || '',
                    priority: data.priority || 'medium',
                });
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
            } finally {
                setIsLoading(false);
            }
        }
        fetchProject();
    }, [projectId]);

    const handleSubmit = async (data: CreateProjectInput) => {
        setIsSubmitting(true);
        setError(null);

        try {
            await updateProject(projectId, data);

            router.push(`/projects/${projectId}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return <PageLoader />;
    }

    return (
        <AppShell
            contentClassName="p-5 md:p-8"
            pageTitle="Edit Project"
            headerAction={
                <Link
                    href={`/projects/${projectId}`}
                    aria-label="Back to project"
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

                {initialData && (
                    <ProjectForm
                        initialData={initialData}
                        onSubmit={handleSubmit}
                        isSubmitting={isSubmitting}
                        submitLabel="Save Changes"
                        onCancel={() => router.push(`/projects/${projectId}`)}
                    />
                )}
            </div>
        </AppShell>
    );
}
