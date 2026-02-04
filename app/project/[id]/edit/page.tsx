'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Loader2, Upload } from 'lucide-react';
import { Project } from '@/lib/types';

export default function EditProjectPage() {
    const router = useRouter();
    const params = useParams();
    const projectId = params.id as string;

    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [prdContent, setPrdContent] = useState('');
    const [githubUrl, setGithubUrl] = useState('');
    const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');

    // Fetch existing project
    useEffect(() => {
        async function fetchProject() {
            try {
                const res = await fetch(`/api/projects?id=${projectId}`);
                if (!res.ok) throw new Error('Failed to fetch project');
                const { data } = await res.json();

                if (!data) throw new Error('Project not found');

                setTitle(data.title || '');
                setDescription(data.description || '');
                setPrdContent(data.prd_content || '');
                setGithubUrl(data.github_url || '');
                setPriority(data.priority || 'medium');
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
            } finally {
                setIsLoading(false);
            }
        }
        fetchProject();
    }, [projectId]);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            setPrdContent(content);
        };
        reader.readAsText(file);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!title.trim()) {
            setError('Title is required');
            return;
        }

        setIsSubmitting(true);
        setError(null);

        try {
            const res = await fetch('/api/projects', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: projectId,
                    title: title.trim(),
                    description: description.trim() || null,
                    prd_content: prdContent.trim() || null,
                    github_url: githubUrl.trim() || null,
                    priority,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to update project');
            }

            router.push(`/project/${projectId}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 size={32} className="animate-spin text-accent-rose" />
            </div>
        );
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

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Title */}
                <div>
                    <label htmlFor="title" className="block text-sm font-medium text-text-secondary mb-2">
                        Title <span className="text-accent-rose">*</span>
                    </label>
                    <input
                        id="title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Project name"
                        className="input w-full"
                        required
                    />
                </div>

                {/* Description */}
                <div>
                    <label htmlFor="description" className="block text-sm font-medium text-text-secondary mb-2">
                        Description
                    </label>
                    <input
                        id="description"
                        type="text"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Brief description of the project"
                        className="input w-full"
                    />
                </div>

                {/* PRD Content */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label htmlFor="prd" className="block text-sm font-medium text-text-secondary">
                            PRD Content (Markdown)
                        </label>
                        <label className="btn-secondary text-sm flex items-center gap-2 cursor-pointer">
                            <Upload size={14} />
                            Upload .md file
                            <input
                                type="file"
                                accept=".md,.markdown"
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                        </label>
                    </div>
                    <textarea
                        id="prd"
                        value={prdContent}
                        onChange={(e) => setPrdContent(e.target.value)}
                        placeholder="# Project PRD\n\nPaste or type your PRD content here..."
                        className="input w-full h-64 font-mono text-sm"
                    />
                </div>

                {/* GitHub URL */}
                <div>
                    <label htmlFor="github" className="block text-sm font-medium text-text-secondary mb-2">
                        GitHub URL
                    </label>
                    <input
                        id="github"
                        type="url"
                        value={githubUrl}
                        onChange={(e) => setGithubUrl(e.target.value)}
                        placeholder="https://github.com/user/repo"
                        className="input w-full"
                    />
                </div>

                {/* Priority */}
                <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                        Priority
                    </label>
                    <div className="flex gap-2">
                        {(['low', 'medium', 'high'] as const).map((p) => (
                            <button
                                key={p}
                                type="button"
                                onClick={() => setPriority(p)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${priority === p
                                    ? p === 'high'
                                        ? 'bg-accent-rose text-white'
                                        : p === 'medium'
                                            ? 'bg-accent-apricot text-bg-base'
                                            : 'bg-accent-sage text-bg-base'
                                    : 'bg-bg-hover text-text-secondary hover:bg-bg-subtle'
                                    }`}
                            >
                                {p.charAt(0).toUpperCase() + p.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                        <p className="text-sm text-red-400">{error}</p>
                    </div>
                )}

                {/* Submit */}
                <div className="flex gap-4 pt-4">
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="btn-primary flex items-center gap-2"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 size={18} className="animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Save size={18} />
                                Save Changes
                            </>
                        )}
                    </button>
                    <Link href={`/project/${projectId}`} className="btn-secondary">
                        Cancel
                    </Link>
                </div>
            </form>
        </div>
    );
}
