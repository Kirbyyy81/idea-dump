'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Save, Loader2, Upload } from 'lucide-react';

export default function NewProjectPage() {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [prdContent, setPrdContent] = useState('');
    const [githubUrl, setGithubUrl] = useState('');
    const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target?.result as string;
            setPrdContent(content);

            // Auto-fill title from filename if empty
            if (!title) {
                const fileName = file.name.replace(/\.md$/, '');
                setTitle(fileName);
            }
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
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim() || null,
                    prd_content: prdContent.trim() || null,
                    github_url: githubUrl.trim() || null,
                    priority,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to create project');
            }

            const { data } = await res.json();
            router.push(`/project/${data.id}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
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
                                Creating...
                            </>
                        ) : (
                            <>
                                <Save size={18} />
                                Create Project
                            </>
                        )}
                    </button>
                    <Link href="/dashboard" className="btn-secondary">
                        Cancel
                    </Link>
                </div>
            </form>
        </div>
    );
}
