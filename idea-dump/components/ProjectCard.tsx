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
                    <h3
                        className="font-semibold transition-colors line-clamp-2"
                        style={{
                            fontFamily: 'var(--font-body)',
                            color: 'var(--text-primary)'
                        }}
                    >
                        {project.title}
                    </h3>
                    <StatusBadge status={status} />
                </div>

                {/* Description */}
                {project.description && (
                    <p
                        className="text-sm mb-4 line-clamp-2 flex-1"
                        style={{ color: 'var(--text-secondary)' }}
                    >
                        {truncate(project.description, 120)}
                    </p>
                )}

                {/* Footer */}
                <div
                    className="flex items-center justify-between mt-auto pt-3"
                    style={{ borderTop: '1px solid var(--border-subtle)' }}
                >


                    {/* Priority indicator */}
                    <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: priorityColor }}
                        title={`${priorityConfig[project.priority].label} priority`}
                    />
                </div>

                {/* Timestamp */}
                <p
                    className="text-xs mt-2"
                    style={{ color: 'var(--text-muted)' }}
                >
                    {formatRelativeTime(project.updated_at)}
                </p>
            </article>
        </Link>
    );
}
