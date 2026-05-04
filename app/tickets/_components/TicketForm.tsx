'use client';

import { useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { Textarea } from '@/components/atoms/Textarea';
import {
    CreateTicketInput,
    Priority,
    Project,
    TicketSource,
    ticketSourceConfig,
    TicketStatus,
    ticketStatusConfig,
} from '@/lib/types';
import { cn, parseTags } from '@/lib/utils';

interface TicketFormInitialData {
    project_id?: string;
    title?: string;
    description?: string | null;
    notes?: string | null;
    status?: TicketStatus;
    priority?: Priority;
    source?: TicketSource;
    tags?: string[] | null;
}

interface TicketFormProps {
    projects: Project[];
    initialData?: TicketFormInitialData;
    lockedProjectId?: string;
    onSave: (data: CreateTicketInput) => Promise<void>;
    onCancel: () => void;
    isLoading?: boolean;
    title?: string;
}

const STATUSES = Object.keys(ticketStatusConfig) as TicketStatus[];

export function TicketForm({
    projects,
    initialData,
    lockedProjectId,
    onSave,
    onCancel,
    isLoading = false,
    title = 'New Ticket',
}: TicketFormProps) {
    const [projectId, setProjectId] = useState(lockedProjectId || initialData?.project_id || '');
    const [ticketTitle, setTicketTitle] = useState(initialData?.title || '');
    const [description, setDescription] = useState(initialData?.description || '');
    const [notes, setNotes] = useState(initialData?.notes || '');
    const [status, setStatus] = useState<TicketStatus>(initialData?.status || 'todo');
    const [priority, setPriority] = useState<Priority>(initialData?.priority || 'medium');
    const [source, setSource] = useState<CreateTicketInput['source']>(
        initialData?.source || 'self'
    );
    const [tags, setTags] = useState(
        Array.isArray(initialData?.tags) ? initialData?.tags.join(', ') : ''
    );
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = async () => {
        if (!projectId || !ticketTitle.trim()) {
            setError('Project and title are required');
            return;
        }

        setError(null);
        await onSave({
            project_id: projectId,
            title: ticketTitle.trim(),
            description: description.trim() || undefined,
            notes: notes.trim() || undefined,
            status,
            priority,
            source,
            tags: parseTags(tags),
        });
    };

    return (
        <Card className="mb-6 p-6">
            <h3 className="mb-4 font-heading text-lg text-text-primary">{title}</h3>

            {error && (
                <div className="mb-4 rounded-lg border border-error bg-error-bg p-3">
                    <p className="text-sm text-error">{error}</p>
                </div>
            )}

            <div className="space-y-4">
                <div>
                    <label className="mb-1 block text-sm text-text-secondary">Project</label>
                    <select
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value)}
                        disabled={Boolean(lockedProjectId)}
                        className="input w-full"
                    >
                        <option value="">Select a project</option>
                        {projects.map((project) => (
                            <option key={project.id} value={project.id}>
                                {project.title}
                            </option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="mb-1 block text-sm text-text-secondary">Title</label>
                    <Input
                        value={ticketTitle}
                        onChange={(e) => setTicketTitle(e.target.value)}
                        placeholder="Describe the issue or request"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm text-text-secondary">Description</label>
                    <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        className="min-h-[100px]"
                        placeholder="Context, expected outcome, or reproduction details"
                    />
                </div>

                <div>
                    <label className="mb-1 block text-sm text-text-secondary">Notes</label>
                    <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="min-h-[100px]"
                        placeholder="Internal notes"
                    />
                </div>

                <div className="grid gap-4 md:grid-cols-3">
                    <div>
                        <label className="mb-1 block text-sm text-text-secondary">Status</label>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value as TicketStatus)}
                            className="input w-full"
                        >
                            {STATUSES.map((option) => (
                                <option key={option} value={option}>
                                    {ticketStatusConfig[option].label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm text-text-secondary">Source</label>
                        <select
                            value={source}
                            onChange={(e) => setSource(e.target.value as CreateTicketInput['source'])}
                            className="input w-full"
                        >
                            {Object.entries(ticketSourceConfig).map(([value, config]) => (
                                <option key={value} value={value}>
                                    {config.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm text-text-secondary">Tags</label>
                        <Input
                            value={tags}
                            onChange={(e) => setTags(e.target.value)}
                            placeholder="bug, qa, urgent"
                        />
                    </div>
                </div>

                <div>
                    <label className="mb-2 block text-sm text-text-secondary">Priority</label>
                    <div className="flex gap-2">
                        {(['low', 'medium', 'high'] as const).map((option) => (
                            <button
                                key={option}
                                type="button"
                                onClick={() => setPriority(option)}
                                className={cn(
                                    'rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                                    priority === option
                                        ? option === 'high'
                                            ? 'bg-accent-rose text-white'
                                            : option === 'medium'
                                                ? 'bg-accent-apricot text-bg-base'
                                                : 'bg-accent-sage text-bg-base'
                                        : 'bg-bg-hover text-text-secondary hover:bg-bg-subtle'
                                )}
                            >
                                {option.charAt(0).toUpperCase() + option.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex gap-2">
                    <Button
                        variant="primary"
                        isLoading={isLoading}
                        onClick={handleSubmit}
                        icon={<Save size={16} />}
                    >
                        Save Ticket
                    </Button>
                    <Button variant="ghost" onClick={onCancel}>
                        Cancel
                    </Button>
                </div>
            </div>
        </Card>
    );
}
