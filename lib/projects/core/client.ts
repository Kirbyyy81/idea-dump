'use client';

import type { CreateProjectInput, Project, UpdateProjectInput } from '@/lib/types';

interface ProjectResponse<T> {
    data: T;
}

interface ProjectErrorResponse {
    error?: string;
}

export class ProjectClientError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = 'ProjectClientError';
        this.status = status;
    }
}

async function requestProject<T>(url: string, init?: RequestInit): Promise<T> {
    const response = await fetch(url, init);
    const payload = await response.json().catch(() => null) as ProjectResponse<T> | ProjectErrorResponse | null;

    if (!response.ok) {
        const message = payload && 'error' in payload ? payload.error : undefined;
        throw new ProjectClientError(message ?? 'Project request failed', response.status);
    }

    return (payload as ProjectResponse<T>).data;
}

export function listProjects(): Promise<Project[]> {
    return requestProject<Project[]>('/api/projects');
}

export function getProject(projectId: string): Promise<Project> {
    const searchParams = new URLSearchParams({ id: projectId });
    return requestProject<Project>(`/api/projects?${searchParams.toString()}`);
}

export function createProject(input: CreateProjectInput): Promise<Project> {
    return requestProject<Project>('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    });
}

export function updateProject(projectId: string, input: UpdateProjectInput): Promise<Project> {
    return requestProject<Project>('/api/projects', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: projectId, ...input }),
    });
}

export async function deleteProject(projectId: string) {
    const searchParams = new URLSearchParams({ id: projectId });
    await requestProject<unknown>(`/api/projects?${searchParams.toString()}`, { method: 'DELETE' });
}
