'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ProjectForm } from '@/components/organisms/ProjectForm';
import { CreateProjectInput } from '@/lib/types';

export default function NewProjectPage() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async (data: CreateProjectInput) => {
        setIsSubmitting(true);
        setError(null);

        try {
            const res = await fetch('/api/projects', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            });

            if (!res.ok) {
                const resData = await res.json();
                throw new Error(resData.error || 'Failed to create project');
            }

            const { data: project } = await res.json();
            router.push(`/project/${project.id}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen p-8 max-w-3xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <Link
                    href="/dashboard"
                    className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
                >
                    <ArrowLeft size={20} />
                </Link>
                <h1 className="text-text-primary">New Project</h1>
            </div>

            {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 mb-6">
                    <p className="text-sm text-red-400">{error}</p>
                </div>
            )}

            <ProjectForm
                onSubmit={handleSubmit}
                isSubmitting={isSubmitting}
                onCancel={() => router.back()}
                submitLabel="Create Project"
            />
        </div>
    );
}
