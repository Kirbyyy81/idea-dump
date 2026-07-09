import Link from 'next/link';
import { Priority, Project, inferStatus, priorityConfig } from '@/lib/types';
import { formatRelativeTime, truncate } from '@/lib/utils';
import { Card } from '@/components/atoms/Card';
import { StatusBadge } from './StatusBadge';

interface ProjectCardProps {
    project: Project;
}

const priorityPillClass: Record<Priority, string> = {
    low: 'border-border-strong bg-bg-hover text-text-primary',
    medium: 'border-warning bg-warning-bg text-warning',
    high: 'border-error bg-error-bg text-error',
};

export function ProjectCard({ project }: ProjectCardProps) {
    const status = inferStatus(project);
    const priority = priorityConfig[project.priority];

    return (
        <Link href={`/projects/${project.id}`} className="block h-full">
            <Card hoverable className="h-full flex flex-col p-4 sm:p-6">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="font-heading font-bold text-text-primary line-clamp-2">
                        {project.title}
                    </h3>
                    <StatusBadge status={status} />
                </div>

                {/* Description */}
                {project.description && (
                    <p className="text-sm text-text-secondary mb-4 line-clamp-2 flex-1">
                        {truncate(project.description, 120)}
                    </p>
                )}

                {/* Footer */}
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-border-subtle">
                    <span
                        className={cn(
                            'inline-flex min-w-[56px] items-center justify-center rounded-full border px-2.5 py-1 text-xs font-semibold capitalize',
                            priorityPillClass[project.priority]
                        )}
                    >
                        {priority.label}
                    </span>

                    {/* Timestamp */}
                    <p className="text-xs text-text-muted">
                        {formatRelativeTime(project.updated_at)}
                    </p>
                </div>
            </Card>
        </Link>
    );
}

// Helper needed because we can't import cn in the render function without import
import { cn } from '@/lib/utils';
