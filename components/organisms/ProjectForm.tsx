'use client';

import { useState } from 'react';
import { Upload, Save } from 'lucide-react';
import { CreateProjectInput, Priority } from '@/lib/types';
import { Button } from '@/components/atoms/Button';
import { FormField } from '@/components/molecules/FormField';
import { Card } from '@/components/atoms/Card';

interface ProjectFormProps {
    initialData?: CreateProjectInput;
    onSubmit: (data: CreateProjectInput) => Promise<void>;
    isSubmitting?: boolean;
    submitLabel?: string;
    onCancel: () => void;
}

export function ProjectForm({
    initialData,
    onSubmit,
    isSubmitting = false,
    submitLabel = 'Create Project',
    onCancel
}: ProjectFormProps) {
    const [title, setTitle] = useState(initialData?.title || '');
    const [description, setDescription] = useState(initialData?.description || '');
    const [prdContent, setPrdContent] = useState(initialData?.prd_content || '');
    const [githubUrl, setGithubUrl] = useState(initialData?.github_url || '');
    const [priority, setPriority] = useState<Priority>(initialData?.priority || 'medium');
    const [errors, setErrors] = useState<Record<string, string>>({});

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
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Project name"
                    required
                    error={errors.title}
                />

                {/* Description */}
                <FormField
                    label="Description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Brief description of the project"
                />

                {/* PRD Content */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-text-secondary">
                            PRD Content (Markdown)
                        </label>
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
                    <FormField // Using FormField for textarea via multiline prop
                        label="" // Label is handled above custom
                        multiline
                        value={prdContent}
                        onChange={(e) => setPrdContent(e.target.value)}
                        placeholder="# Project PRD\n\nPaste or type your PRD content here..."
                        className="font-mono text-sm"
                        rows={12}
                    />
                </div>

                {/* GitHub URL */}
                <FormField
                    label="GitHub URL"
                    type="url"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    placeholder="https://github.com/user/repo"
                />

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
