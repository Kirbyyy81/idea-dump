'use client';

import { useEffect, useState } from 'react';
import { Upload, Save } from 'lucide-react';
import { CreateProjectInput, Priority } from '@/lib/types';
import { Button } from '@/components/atoms/Button';
import { FormField } from './FormField';
import { Card } from '@/components/atoms/Card';
import { cn } from '@/lib/utils';

interface ProjectFormProps {
    initialData?: CreateProjectInput;
    onSubmit: (data: CreateProjectInput) => Promise<void>;
    isSubmitting?: boolean;
    submitLabel?: string;
    onCancel: () => void;
    serverErrors?: Record<string, string>;
}

export function ProjectForm({
    initialData,
    onSubmit,
    isSubmitting = false,
    submitLabel = 'Create Project',
    onCancel,
    serverErrors,
}: ProjectFormProps) {
    const [title, setTitle] = useState(initialData?.title || '');
    const [description, setDescription] = useState(initialData?.description || '');
    const [prdContent, setPrdContent] = useState(initialData?.prd_content || '');
    const [githubUrl, setGithubUrl] = useState(initialData?.github_url || '');
    const [deployUrl, setDeployUrl] = useState(initialData?.deploy_url || '');
    const [priority, setPriority] = useState<Priority>(initialData?.priority || 'medium');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [isDragOver, setIsDragOver] = useState(false);

    useEffect(() => {
        setErrors(serverErrors ?? {});
    }, [serverErrors]);

    const clearFieldError = (field: string) => {
        setErrors((current) => {
            if (!current[field]) return current;
            const next = { ...current };
            delete next[field];
            return next;
        });
    };

    const extractTitle = (content: string, fileName: string) => {
        const match = content.match(/^#\s+(.+)$/m);
        if (match?.[1]) return match[1].trim();
        return fileName.replace(/\.md$/i, '');
    };

    const loadMarkdownFile = async (file: File) => {
        const content = await file.text();
        setPrdContent(content);

        if (!title.trim()) {
            setTitle(extractTitle(content, file.name));
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        loadMarkdownFile(file);
    };

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);

        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.md') && !file.name.toLowerCase().endsWith('.markdown')) {
            return;
        }

        await loadMarkdownFile(file);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        const newErrors: Record<string, string> = {};
        if (!title.trim()) newErrors.title = 'Title is required';

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        setErrors({});
        await onSubmit({
            title: title.trim(),
            description: description.trim() || undefined,
            prd_content: prdContent.trim() || undefined,
            github_url: githubUrl.trim() || undefined,
            deploy_url: deployUrl.trim() || undefined,
            priority,
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <Card className="p-6 space-y-6">
                {/* Title */}
                <FormField
                    label="Title"
                    value={title}
                    onChange={(e) => {
                        setTitle(e.target.value);
                        clearFieldError('title');
                    }}
                    placeholder="Project name"
                    required
                    error={errors.title}
                />

                {/* Description */}
                <FormField
                    label="Description"
                    value={description}
                    onChange={(e) => {
                        setDescription(e.target.value);
                        clearFieldError('description');
                    }}
                    placeholder="Brief description of the project"
                    error={errors.description}
                />

                {/* PRD Content */}
                <div>
                    <div className="mb-2 flex justify-end">
                        <label className="btn-secondary text-sm flex items-center gap-2 cursor-pointer h-8 px-3 py-1">
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
                    <div
                        onDragEnter={(e) => {
                            e.preventDefault();
                            setIsDragOver(true);
                        }}
                        onDragOver={(e) => {
                            e.preventDefault();
                            setIsDragOver(true);
                        }}
                        onDragLeave={() => setIsDragOver(false)}
                        onDrop={handleDrop}
                        className={cn(
                            "rounded-lg transition-colors",
                            isDragOver && "ring-2 ring-accent-rose/40 bg-bg-subtle"
                        )}
                    >
                        <div className={cn("rounded-lg", isDragOver && "border border-dashed border-accent-rose/50")}>
                            <FormField // Using FormField for textarea via multiline prop
                                label="PRD Content (Markdown)"
                                multiline
                                value={prdContent}
                                onChange={(e) => {
                                    setPrdContent(e.target.value);
                                    clearFieldError('prd_content');
                                }}
                                placeholder="# Project PRD\n\nPaste, type, or drag & drop a .md file here..."
                                className="font-mono text-sm"
                                rows={12}
                                error={errors.prd_content}
                            />
                        </div>
                        {isDragOver && (
                            <div className="pointer-events-none -mt-3 pb-3 text-center text-xs text-text-muted">
                                Drop to import markdown
                            </div>
                        )}
                    </div>
                </div>

                {/* GitHub URL */}
                <FormField
                    label="GitHub URL"
                    type="url"
                    value={githubUrl}
                    onChange={(e) => {
                        setGithubUrl(e.target.value);
                        clearFieldError('github_url');
                    }}
                    placeholder="https://github.com/user/repo"
                    error={errors.github_url}
                />

                {/* Deploy URL */}
                <FormField
                    label="Deploy URL"
                    type="url"
                    value={deployUrl}
                    onChange={(e) => {
                        setDeployUrl(e.target.value);
                        clearFieldError('deploy_url');
                    }}
                    placeholder="https://your-app.vercel.app"
                    error={errors.deploy_url}
                />

                {/* Priority */}
                <fieldset>
                    <legend className="mb-2 block text-sm font-medium text-text-secondary">Priority</legend>
                    <div
                        role="radiogroup"
                        aria-label="Priority"
                        aria-describedby={errors.priority ? 'project-priority-error' : undefined}
                        className="flex gap-2"
                    >
                        {(['low', 'medium', 'high'] as const).map((p) => (
                            <button
                                key={p}
                                type="button"
                                onClick={() => {
                                    setPriority(p);
                                    clearFieldError('priority');
                                }}
                                role="radio"
                                aria-checked={priority === p}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${priority === p
                                    ? p === 'high'
                                        ? 'bg-accent-rose text-action-primary-text'
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
                    {errors.priority && (
                        <p id="project-priority-error" className="mt-2 text-sm text-error">{errors.priority}</p>
                    )}
                </fieldset>
            </Card>

            {/* Actions */}
            <div className="flex gap-4 pt-4">
                <Button
                    type="submit"
                    isLoading={isSubmitting}
                    icon={<Save size={18} />}
                >
                    {submitLabel}
                </Button>
                <Button
                    type="button"
                    variant="secondary"
                    onClick={onCancel}
                >
                    Cancel
                </Button>
            </div>
        </form>
    );
}
