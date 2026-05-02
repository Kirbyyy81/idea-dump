'use client';

import { useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { Textarea } from '@/components/atoms/Textarea';
import {
    CreateTicketInput,
    Priority,
    Project,
    Ticket,
    ticketSourceConfig,
    ticketStatusConfig,
    TicketSource,
    TicketStatus,
} from '@/lib/types';
import { parseTags } from '@/lib/utils';

interface TicketFormProps {
    projects: Project[];
    initialData?: Partial<CreateTicketInput> | Partial<Ticket>;
    lockedProjectId?: string;
    onSave: (data: CreateTicketInput) => Promise<void>;
    onCancel: () => void;
    isLoading?: boolean;
    title?: string;
}

export function TicketForm({
    projects,
    initialData,
    lockedProjectId,
    onSave,
    onCancel,
    isLoading = false,
    title = 'New Ticket',
}: TicketFormProps) {
    const defaultProjectId = lockedProjectId ?? initialData?.project_id ?? projects[0]?.id ?? '';
    const [projectId, setProjectId] = useState(defaultProjectId);
    const [ticketTitle, setTicketTitle] = useState(initialData?.title ?? '');
    const [description, setDescription] = useState(initialData?.description ?? '');
    const [notes, setNotes] = useState(initialData?.notes ?? '');
    const [status, setStatus] = useState<TicketStatus>(initialData?.status ?? 'todo');
    const [priority, setPriority] = useState<Priority>(initialData?.priority ?? 'medium');
    const [source, setSource] = useState<TicketSource>(initialData?.source ?? 'self');
    const [tags, setTags] = useState((initialData?.tags ?? []).join(', '));
    const [error, setError] = useState<string | null>(null);

    const statusOptions = useMemo(
        () => Object.entries(ticketStatusConfig) as Array<[TicketStatus, { label: string; color: string }]>,
        []
    );

    const handleSubmit = async () => {
        if (!projectId) {
            setError('Project is required');
            return;
        }
        if (!ticketTitle.trim()) {
            setError('Title is required');
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
        <Card className="p-6 mb-6">
            <h3 className="font-heading text-lg mb-4">{title}</h3>

            <div className="space-y-4">
                {!lockedProjectId && (
                    <div>
                        <label className="block text-sm text-text-secondary mb-1">Project</label>
                        <select
                            value={projectId}
                            onChange={(e) => setProjectId(e.target.value)}
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
                )}

                <div>
                    <label className="block text-sm text-text-secondary mb-1">Title</label>
                    <Input
                        value={ticketTitle}
                        onChange={(e) => setTicketTitle(e.target.value)}
                        placeholder="What needs to be fixed or tracked?"
                    />
                </div>

                <div>
                    <label className="block text-sm text-text-secondary mb-1">Description</label>
                    <Textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Add context for the issue or task"
                    />
                </div>

                <div>
                    <label className="block text-sm text-text-secondary mb-1">Notes</label>
                    <Textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Optional implementation notes or follow-up detail"
                    />
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                        <label className="block text-sm text-text-secondary mb-1">Status</label>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value as TicketStatus)}
                            className="input w-full"
                        >
                            {statusOptions.map(([value, config]) => (
                                <option key={value} value={value}>
                                    {config.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm text-text-secondary mb-1">Source</label>
                        <select
                            value={source}
                            onChange={(e) => setSource(e.target.value as TicketSource)}
                            className="input w-full"
                        >
                            {Object.entries(ticketSourceConfig).map(([value, config]) => (
                                <option key={value} value={value}>
                                    {config.label}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">Priority</label>
                    <div className="flex gap-2">
                        {(['low', 'medium', 'high'] as const).map((value) => (
                            <button
                                key={value}
                                type="button"
                                onClick={() => setPriority(value)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    priority === value
                                        ? value === 'high'
                                            ? 'bg-accent-rose text-white'
                                            : value === 'medium'
                                                ? 'bg-accent-apricot text-bg-base'
                                                : 'bg-accent-sage text-bg-base'
                                        : 'bg-bg-hover text-text-secondary hover:bg-bg-subtle'
                                }`}
                            >
                                {value.charAt(0).toUpperCase() + value.slice(1)}
                            </button>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-sm text-text-secondary mb-1">Tags</label>
                    <Input
                        value={tags}
                        onChange={(e) => setTags(e.target.value)}
                        placeholder="bug, checkout, onboarding"
                    />
                </div>

                {error && (
                    <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
                        {error}
                    </div>
                )}

                <div className="flex gap-2">
                    <Button variant="primary" onClick={handleSubmit} isLoading={isLoading} icon={<Save size={16} />}>
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
