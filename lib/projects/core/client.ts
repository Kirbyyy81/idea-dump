'use client';

import { ApiClientError, requestApi } from '@/lib/api/client';
import type { CreateProjectInput, Project, UpdateProjectInput } from '@/lib/types';

export class ProjectClientError extends ApiClientError {
    constructor(error: ApiClientError) {
        super(error.message, error.code, error.status, error.fieldErrors);
        this.name = 'ProjectClientError';
    }
}

async function requestProject<T>(url: string, init?: RequestInit): Promise<T> {
    try {
        return await requestApi<T>(url, init);
    } catch (error) {
        if (error instanceof ApiClientError) {
            throw new ProjectClientError(error);
        }
        throw error;
    }
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
