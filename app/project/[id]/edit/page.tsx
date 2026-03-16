'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ProjectForm } from '@/components/organisms/ProjectForm';
import { CreateProjectInput } from '@/lib/types';
import { PageLoader } from '@/components/atoms/Loader';

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
                const res = await fetch(`/api/projects?id=${projectId}`);
                if (!res.ok) throw new Error('Failed to fetch project');
                const { data } = await res.json();

                if (!data) throw new Error('Project not found');

                setInitialData({
                    title: data.title,
                    description: data.description || '',
                    prd_content: data.prd_content || '',
                    github_url: data.github_url || '',
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
            const res = await fetch('/api/projects', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: projectId,
                    ...data,
                }),
            });

            if (!res.ok) {
                const resData = await res.json();
                throw new Error(resData.error || 'Failed to update project');
            }

            router.push(`/project/${projectId}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return <PageLoader />;
    }

    return (
        <div className="min-h-screen p-8 max-w-3xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <Link
                    href={`/project/${projectId}`}
                    className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
                >
                    <ArrowLeft size={20} />
                </Link>
                <h1 className="text-text-primary">Edit Project</h1>
            </div>

            {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-6">
                    <p className="text-sm text-red-400">{error}</p>
                </div>
            )}

            {initialData && (
                <ProjectForm
                    initialData={initialData}
                    onSubmit={handleSubmit}
                    isSubmitting={isSubmitting}
                    submitLabel="Save Changes"
                    onCancel={() => router.push(`/project/${projectId}`)}
                />
            )}
        </div>
    );
}
