import Link from 'next/link';
import { Project, inferStatus, priorityConfig } from '@/lib/types';
import { formatRelativeTime, truncate } from '@/lib/utils';
import { Card } from '@/components/atoms/Card';
import { StatusBadge } from '@/components/molecules/StatusBadge';

interface ProjectCardProps {
    project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
    const status = inferStatus(project);
    const priority = priorityConfig[project.priority];

    return (
        <Link href={`/project/${project.id}`} className="block h-full">
            <Card hoverable className="h-full flex flex-col p-4 sm:p-6">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="font-heading font-semibold text-lg text-text-primary line-clamp-2">
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
                    <div className="flex items-center gap-2">
                        <div
                            className={cn("w-2 h-2 rounded-full", priority.indicatorClass)}
                            title={`${priority.label} priority`}
                        />
                        <span className="text-xs text-text-muted capitalize">{priority.label}</span>
                    </div>

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
