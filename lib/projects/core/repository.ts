import { createAdminClient } from '@/lib/supabase/admin';
import type { Project } from '@/lib/types';
import type {
    ProjectCreateCommand,
    ProjectIngestCommand,
    ProjectUpdateCommand,
} from './schemas';

export const PROJECT_COLUMNS = [
    'id',
    'user_id',
    'title',
    'description',
    'prd_content',
    'github_url',
    'deploy_url',
    'priority',
    'completed',
    'archived',
    'created_at',
    'updated_at',
].join(', ');

export async function listOwnedProjects(userId: string): Promise<Project[]> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('projects')
        .select(PROJECT_COLUMNS)
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as unknown as Project[];
}

export async function getOwnedProject(userId: string, projectId: string): Promise<Project | null> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('projects')
        .select(PROJECT_COLUMNS)
        .eq('id', projectId)
        .eq('user_id', userId)
        .maybeSingle();

    if (error) throw error;
    return data as unknown as Project | null;
}

export async function createOwnedProject(userId: string, input: ProjectCreateCommand): Promise<Project> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('projects')
        .insert({
            user_id: userId,
            title: input.title,
            description: input.description ?? null,
            prd_content: input.prd_content ?? null,
            github_url: input.github_url ?? null,
            deploy_url: input.deploy_url ?? null,
            priority: input.priority ?? 'medium',
        })
        .select(PROJECT_COLUMNS)
        .single();

    if (error) throw error;
    return data as unknown as Project;
}

export async function createIngestedProject(
    userId: string,
    input: ProjectIngestCommand
): Promise<{ id: string; title: string }> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('projects')
        .insert({
            user_id: userId,
            title: input.title,
            description: input.description,
            prd_content: input.prd_content,
            priority: 'medium',
            tags: input.tags,
        })
        .select('id, title')
        .single();

    if (error) throw error;
    return data;
}

export async function updateOwnedProject(
    userId: string,
    projectId: string,
    input: ProjectUpdateCommand
): Promise<Project | null> {
    const updates = {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.prd_content !== undefined ? { prd_content: input.prd_content } : {}),
        ...(input.github_url !== undefined ? { github_url: input.github_url } : {}),
        ...(input.deploy_url !== undefined ? { deploy_url: input.deploy_url } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
        ...(input.completed !== undefined ? { completed: input.completed } : {}),
        ...(input.archived !== undefined ? { archived: input.archived } : {}),
        updated_at: new Date().toISOString(),
    };
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('projects')
        .update(updates)
        .eq('id', projectId)
        .eq('user_id', userId)
        .select(PROJECT_COLUMNS)
        .maybeSingle();

    if (error) throw error;
    return data as unknown as Project | null;
}

export async function deleteOwnedProject(userId: string, projectId: string) {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from('projects')
        .delete()
        .eq('id', projectId)
        .eq('user_id', userId)
        .select('id')
        .maybeSingle();

    if (error) throw error;
    return Boolean(data);
}
