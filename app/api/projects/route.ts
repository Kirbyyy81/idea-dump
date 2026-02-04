import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { Project } from '@/lib/types';

const demoProject: Project = {
    id: '1',
    user_id: 'demo',
    title: 'IdeaDump',
    description: 'A Notion-inspired, deployable web app to centralize, track, and manage all your PRDs and project ideas.',
    prd_content: `# IdeaDump - Personal PRD Management Hub

A Notion-inspired, deployable web app to centralize, track, and manage all your PRDs and project ideas.

## Overview

**Problem**: PRDs are scattered across different locations, making it hard to track progress and pick up where you left off.

**Solution**: IdeaDump - a clean, personal hub where you can:
- Import and store all PRDs (markdown format)
- Track project status through defined stages
- Add notes/journal entries per project
- Link to GitHub repos
- Access from any device

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 (App Router) + TypeScript |
| Styling | shadcn/ui + Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Magic Link |
| Hosting | Vercel |
`,
    github_url: 'https://github.com/user/ideadump',
    priority: 'high',
    tags: ['nextjs', 'supabase', 'productivity'],
    completed: false,
    archived: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
};

// GET /api/projects - List all projects or get single project by ID
export async function GET(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        // IF NO USER, RETURN MOCK DATA (For Main Branch Demo)
        if (!user) {
            if (id) {
                if (id === '1') return NextResponse.json({ data: demoProject });
                return NextResponse.json({ data: null });
            }
            return NextResponse.json({ data: [demoProject] });
        }

        // If ID is provided, fetch single project
        if (id) {
            const { data, error } = await supabase
                .from('projects')
                .select('*')
                .eq('id', id)
                .eq('user_id', user.id)
                .single();

            if (error) throw error;

            return NextResponse.json({ data });
        }

        // Otherwise, fetch all projects
        const { data, error } = await supabase
            .from('projects')
            .select('*')
            .eq('user_id', user.id)
            .order('updated_at', { ascending: false });

        if (error) throw error;

        return NextResponse.json({ data });
    } catch (error) {
        console.error('Error fetching projects:', error);
        // Fallback to demo data on error as well for main branch stability
        if (request.url.includes('id=1')) return NextResponse.json({ data: demoProject });
        return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
    }
}

// POST /api/projects - Create a new project
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            // Mock creation for demo
            return NextResponse.json({
                data: { ...demoProject, id: Date.now().toString(), title: "Demo Project" }
            }, { status: 201 });
        }

        const body = await request.json();
        const { title, description, prd_content, github_url, priority, tags } = body;

        if (!title) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('projects')
            .insert({
                user_id: user.id,
                title,
                description: description || null,
                prd_content: prd_content || null,
                github_url: github_url || null,
                priority: priority || 'medium',
                tags: tags || [],
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ data }, { status: 201 });
    } catch (error) {
        console.error('Error creating project:', error);
        return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
    }
}

// PUT /api/projects - Update a project
export async function PUT(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            // Mock update
            return NextResponse.json({ data: demoProject });
        }

        const body = await request.json();
        const { id, ...updates } = body;

        if (!id) {
            return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('projects')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .eq('user_id', user.id)
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ data });
    } catch (error) {
        console.error('Error updating project:', error);
        return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
    }
}

// DELETE /api/projects - Delete a project
export async function DELETE(request: NextRequest) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            return NextResponse.json({ success: true });
        }

        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');

        if (!id) {
            return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
        }

        const { error } = await supabase
            .from('projects')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id);

        if (error) throw error;

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting project:', error);
        return NextResponse.json({ error: 'Failed to delete project' }, { status: 500 });
    }
}
