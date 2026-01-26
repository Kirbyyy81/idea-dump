import Link from 'next/link';
import { Project, inferStatus, priorityConfig } from '@/lib/types';
import { formatRelativeTime, truncate } from '@/lib/utils';
import { StatusBadge } from './StatusBadge';

interface ProjectCardProps {
    project: Project;
}

export function ProjectCard({ project }: ProjectCardProps) {
    const status = inferStatus(project);
    const priorityColor = priorityConfig[project.priority].color;

    return (
        <Link href={`/project/${project.id}`}>
            <article className="card group cursor-pointer h-full flex flex-col">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                    <h3 className="font-semibold text-text-primary group-hover:text-accent-rose transition-colors line-clamp-2">
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
                    {/* Tags */}
                    <div className="flex gap-1.5 flex-wrap">
                        {project.tags.slice(0, 3).map((tag) => (
                            <span
                                key={tag}
                                className="text-xs px-2 py-0.5 rounded-full bg-bg-hover text-text-muted"
                            >
                                #{tag}
                            </span>
                        ))}
                        {project.tags.length > 3 && (
                            <span className="text-xs text-text-muted">
                                +{project.tags.length - 3}
                            </span>
                        )}
                    </div>

                    {/* Priority indicator */}
                    <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: priorityColor }}
                        title={`${priorityConfig[project.priority].label} priority`}
                    />
                </div>

                {/* Timestamp */}
                <p className="text-xs text-text-muted mt-2">
                    {formatRelativeTime(project.updated_at)}
                </p>
            </article>
        </Link>
    );
}
