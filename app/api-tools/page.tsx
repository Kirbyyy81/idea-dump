'use client';

import { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    BookOpen,
    Copy,
    Download,
    Key,
    Plus,
    Trash2,
    Workflow,
} from 'lucide-react';
import { Sidebar } from '@/components/organisms/Sidebar';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { Project } from '@/lib/types';
import { formatDate } from '@/lib/utils';

declare global {
    interface Window {
        SwaggerUIBundle?: any;
        SwaggerUIStandalonePreset?: any;
    }
}

interface ApiKeyDisplay {
    id: string;
    name: string;
    created_at: string;
    last_used_at: string | null;
}

const weeklyLogSkillMarkdown = `---
name: weekly-log
description: Create, list, and update Weekly Productivity Log entries through the Weekly Productivity Log API using the local helper script. Use when Codex needs to record daily work logs, review a date range of entries, or revise an existing productivity entry while preserving project-prefix and writing-style rules.
---

# Weekly Log

Use the bundled PowerShell script for normal operations. Prefer the script over handwritten HTTP requests so authentication, JSON encoding, and project-prefix handling stay consistent.

## Workflow

1. Read the API key from \`WPL_API_KEY\` or \`scripts/.wpl_api_key\`.
2. Run \`scripts/weekly-log.ps1 create\`, \`list\`, or \`update\`.
3. Keep \`operation_task\` prefixed with a project label. If none is provided, rely on \`WPL_PROJECT_PREFIX\` or the script default.
4. Write one task per entry and keep each entry tied to a single workday.

## Setup

Create \`scripts/.wpl_api_key\` with the API key, or export \`WPL_API_KEY\` in the shell before using the script.

Example:

\`\`\`powershell
$env:WPL_API_KEY = "YOUR_AGENT_API_KEY"
$env:WPL_PROJECT_PREFIX = "Product Led Flow"
\`\`\`

## Script Usage

\`\`\`powershell
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\\.codex\\skills\\weekly-log\\scripts\\weekly-log.ps1" create 2026-02-04 Tuesday "Implemented API endpoint" "VSCode, Next.js" "Hybrid auth simplifies multi-client access patterns"
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\\.codex\\skills\\weekly-log\\scripts\\weekly-log.ps1" list 2026-02-01 2026-02-07 50
powershell -ExecutionPolicy Bypass -File "$env:USERPROFILE\\.codex\\skills\\weekly-log\\scripts\\weekly-log.ps1" update <id> 2026-02-04 Tuesday "Refined dashboard filters" "VSCode, Supabase" "Small query constraints improve UI responsiveness"
\`\`\`

## API Operations

### Create

Send \`POST /api/logs\` with:

\`\`\`json
{
  "content": {
    "date": "2026-02-04",
    "day": "Tuesday",
    "operation_task": "Product Led Flow: Implemented API endpoint",
    "tools_used": "VSCode, Next.js, Supabase, TypeScript",
    "lesson_learned": "Hybrid auth simplifies multi-client access patterns"
  }
}
\`\`\`

Required field:
- \`content.date\`

Optional fields:
- \`content.day\`
- \`content.operation_task\`
- \`content.tools_used\`
- \`content.lesson_learned\`

### List

Send \`GET /api/logs\` with optional query params:
- \`from\`
- \`to\`
- \`limit\`
- \`sort\`

### Update

Send \`PATCH /api/logs/{id}\` with a full replacement \`content\` object and \`allow_human_overwrite\` when needed.

## Writing Rules

- Start \`operation_task\` with a concrete technical verb.
- Keep the project prefix in \`operation_task\`.
- List only tools directly used for that task.
- Make \`lesson_learned\` explain the technical, architectural, or business takeaway.
- Confirm day boundaries before merging work from separate dates.
`;

const weeklyLogSkillPreview = `---
name: weekly-log
description: Create, list, and update Weekly Productivity Log entries through the Weekly Productivity Log API using the local helper script.
---

# Weekly Log

Use the bundled PowerShell script for normal operations.

## Workflow

1. Read the API key from \`WPL_API_KEY\` or \`scripts/.wpl_api_key\`.
2. Run \`scripts/weekly-log.ps1 create\`, \`list\`, or \`update\`.
3. Keep \`operation_task\` prefixed with a project label.`;

function downloadTextFile(filename: string, content: string) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

function loadStyle(href: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`link[href="${href}"]`);
        if (existing) return resolve();

        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        link.onload = () => resolve();
        link.onerror = () => reject(new Error(`Failed to load ${href}`));
        document.head.appendChild(link);
    });
}

function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) return resolve();

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.body.appendChild(script);
    });
}

export default function ApiToolsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
    const [apiKeys, setApiKeys] = useState<ApiKeyDisplay[]>([]);
    const [keysLoading, setKeysLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [newKey, setNewKey] = useState<string | null>(null);
    const [keyError, setKeyError] = useState<string | null>(null);
    const [docsError, setDocsError] = useState<string | null>(null);
    const [copiedSkill, setCopiedSkill] = useState(false);

    const cdn = useMemo(() => {
        const base = 'https://unpkg.com/swagger-ui-dist@5.18.2';
        return {
            css: `${base}/swagger-ui.css`,
            bundle: `${base}/swagger-ui-bundle.js`,
            preset: `${base}/swagger-ui-standalone-preset.js`,
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function fetchProjects() {
            try {
                const res = await fetch('/api/projects');
                if (!res.ok || cancelled) return;
                const data = await res.json();
                setProjects(data.data || []);
            } catch {
                // Sidebar project list is best-effort only.
            }
        }

        async function fetchKeys() {
            try {
                const res = await fetch('/api/keys');
                if (!res.ok) throw new Error('Failed to fetch keys');
                const { data } = await res.json();
                if (!cancelled) {
                    setApiKeys(data || []);
                }
            } catch (err) {
                if (!cancelled) {
                    setKeyError(err instanceof Error ? err.message : 'Failed to fetch API keys');
                }
            } finally {
                if (!cancelled) {
                    setKeysLoading(false);
                }
            }
        }

        async function initDocs() {
            try {
                await loadStyle(cdn.css);
                await loadScript(cdn.bundle);
                await loadScript(cdn.preset);

                if (cancelled) return;
                if (!window.SwaggerUIBundle) throw new Error('Swagger UI failed to load');

                const SwaggerUIBundle = window.SwaggerUIBundle as any;
                const SwaggerUIStandalonePreset = window.SwaggerUIStandalonePreset as any;

                SwaggerUIBundle({
                    url: '/api/openapi',
                    dom_id: '#swagger-ui',
                    presets: [
                        SwaggerUIBundle.presets.apis,
                        SwaggerUIStandalonePreset,
                    ],
                    layout: 'BaseLayout',
                });
            } catch (err) {
                if (!cancelled) {
                    setDocsError(err instanceof Error ? err.message : 'Failed to load docs');
                }
            }
        }

        fetchProjects();
        fetchKeys();
        initDocs();

        return () => {
            cancelled = true;
        };
    }, [cdn]);

    const handleCreateKey = async () => {
        if (!newKeyName.trim()) return;

        setIsCreating(true);
        setKeyError(null);

        try {
            const res = await fetch('/api/keys', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newKeyName.trim() }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to create key');
            }

            const { data } = await res.json();
            setNewKey(data.key);
            setApiKeys((prev) => [
                { id: data.id, name: data.name, created_at: data.created_at, last_used_at: null },
                ...prev,
            ]);
            setNewKeyName('');
        } catch (err) {
            setKeyError(err instanceof Error ? err.message : 'An unexpected error occurred');
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteKey = async (id: string) => {
        if (!confirm('Are you sure you want to delete this API key?')) return;

        try {
            const res = await fetch(`/api/keys?id=${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete key');
            setApiKeys((prev) => prev.filter((key) => key.id !== id));
        } catch (err) {
            setKeyError(err instanceof Error ? err.message : 'Failed to delete API key');
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const copySkillMarkdown = async () => {
        await navigator.clipboard.writeText(weeklyLogSkillMarkdown);
        setCopiedSkill(true);
        window.setTimeout(() => setCopiedSkill(false), 2000);
    };

    return (
        <div className="flex min-h-screen bg-bg-base font-body text-text-primary">
            <Sidebar projects={projects} />
            <main className="flex-1 ml-64 p-8">
                <div className="max-w-5xl space-y-8">
                    <header>
                        <h1 className="text-3xl font-heading font-medium">API</h1>
                    </header>

                    <Card className="p-6">
                        <div className="flex items-center gap-2 mb-3">
                            <Workflow size={20} className="text-accent-rose" />
                            <h2 className="text-xl font-semibold font-body text-text-primary">
                                How to Use It
                            </h2>
                        </div>
                        <div className="space-y-4 text-sm text-text-secondary">
                            <p>
                                This API is built for the same workflow Codex uses internally:
                                generate a key, send a weekly log, and confirm the entry landed in
                                your account.
                            </p>

                            <ol className="relative space-y-4 border-l border-border pl-6">
                                <li className="relative">
                                    <span className="absolute -left-[1.625rem] top-0 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-bg-base text-sm font-semibold text-text-primary">
                                        1
                                    </span>
                                    <div className="rounded-lg border border-border bg-bg-base p-4">
                                        <p className="mb-2 font-medium text-text-primary">
                                            Create a key
                                        </p>
                                        <p>
                                            Use the API Keys card below. The value is only shown
                                            once, so copy it immediately.
                                        </p>
                                    </div>
                                </li>
                                <li className="relative">
                                    <span className="absolute -left-[1.625rem] top-0 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-bg-base text-sm font-semibold text-text-primary">
                                        2
                                    </span>
                                    <div className="rounded-lg border border-border bg-bg-base p-4">
                                        <p className="mb-2 font-medium text-text-primary">
                                            Send a weekly log
                                        </p>
                                        <p>
                                            Call <code className="text-text-primary">POST /api/logs</code>
                                            with the <code className="text-text-primary">x-api-key</code>
                                            header and a <code className="text-text-primary">content</code>
                                            object.
                                        </p>
                                    </div>
                                </li>
                                <li className="relative">
                                    <span className="absolute -left-[1.625rem] top-0 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-bg-base text-sm font-semibold text-text-primary">
                                        3
                                    </span>
                                    <div className="rounded-lg border border-border bg-bg-base p-4">
                                        <p className="mb-2 font-medium text-text-primary">
                                            Verify the result
                                        </p>
                                        <p>
                                            Check the Logs page or request
                                            <code className="mx-1 text-text-primary">GET /api/logs</code>
                                            with a date range to confirm the record is there.
                                        </p>
                                    </div>
                                </li>
                                <li className="relative">
                                    <span className="absolute -left-[1.625rem] top-0 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-bg-base text-sm font-semibold text-text-primary">
                                        4
                                    </span>
                                    <div className="rounded-lg border border-border bg-bg-base p-4">
                                        <p className="mb-2 font-medium text-text-primary">
                                            Export when needed
                                        </p>
                                        <p>
                                            Admin users can turn a date range into markdown with
                                            <code className="mx-1 text-text-primary">
                                                POST /api/export/weekly
                                            </code>
                                            .
                                        </p>
                                    </div>
                                </li>
                            </ol>

                        </div>
                    </Card>

                    <Card className="p-6">
                        <div className="flex items-center gap-2 mb-3">
                            <BookOpen size={20} className="text-accent-rose" />
                            <h2 className="text-xl font-semibold font-body text-text-primary">
                                Weekly Log Skill
                            </h2>
                        </div>
                        <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                            <div className="space-y-4">
                                <div className="rounded-lg border border-border bg-bg-base p-4">
                                    <div className="mb-3 flex items-center gap-2">
                                        <span className="rounded-full bg-accent-rose/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-accent-rose">
                                            Skill card
                                        </span>
                                        <span className="text-xs text-text-muted">
                                            Codex-style skill summary
                                        </span>
                                    </div>
                                    <dl className="grid gap-3 text-sm">
                                        <div>
                                            <dt className="text-text-muted">Name</dt>
                                            <dd className="font-medium text-text-primary">
                                                weekly-log
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-text-muted">Description</dt>
                                            <dd className="text-text-secondary">
                                                Create, list, and update Weekly Productivity Log
                                                entries through the Weekly Productivity Log API
                                                using the local helper script.
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-text-muted">Best for</dt>
                                            <dd className="text-text-secondary">
                                                Writing daily work logs, reviewing entries, and
                                                keeping weekly reporting aligned with the API.
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-text-muted">Bundled resources</dt>
                                            <dd className="text-text-secondary">
                                                `scripts/weekly-log.ps1`, `/api/logs`, and
                                                `/api/export/weekly`
                                            </dd>
                                        </div>
                                    </dl>
                                </div>

                                <div className="space-y-2 text-sm text-text-secondary">
                                    <p>
                                        This keeps the page short and shows the same metadata-first
                                        shape people use for skills: a clear name, a direct
                                        description, and the workflow it enables.
                                    </p>
                                    <p>
                                        Use the buttons to copy the full skill markdown or download
                                        it as a <code className="mx-1 text-text-primary">.md</code>
                                        file.
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        variant="secondary"
                                        onClick={copySkillMarkdown}
                                        icon={<Copy size={16} />}
                                    >
                                        {copiedSkill ? 'Copied' : 'Copy markdown'}
                                    </Button>
                                    <Button
                                        variant="secondary"
                                        onClick={() =>
                                            downloadTextFile(
                                                'weekly-log.skill.md',
                                                weeklyLogSkillMarkdown
                                            )
                                        }
                                        icon={<Download size={16} />}
                                    >
                                        Download .md
                                    </Button>
                                </div>
                                <div className="rounded-lg border border-border bg-bg-base p-4">
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                                        Preview
                                    </p>
                                    <pre className="overflow-x-auto text-xs md:text-sm">
                                        <code className="whitespace-pre-wrap text-text-secondary">
                                            {weeklyLogSkillPreview}
                                        </code>
                                    </pre>
                                </div>
                            </div>
                        </div>
                    </Card>

                    <Card className="p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <Key size={20} className="text-accent-rose" />
                            <h2 className="text-xl font-semibold font-body text-text-primary">
                                API Keys
                            </h2>
                        </div>
                        {newKey && (
                            <div className="mb-6 p-4 rounded-lg bg-success-bg border border-accent-sage">
                                <p className="text-sm font-medium mb-2 flex items-center gap-2 text-accent-sage">
                                    <AlertTriangle size={16} />
                                    Copy this key now. You will not be able to see it again.
                                </p>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 p-2 rounded text-sm font-mono bg-bg-base text-text-primary overflow-x-auto">
                                        {newKey}
                                    </code>
                                    <Button
                                        variant="secondary"
                                        onClick={() => copyToClipboard(newKey)}
                                        icon={<Copy size={16} />}
                                    >
                                        Copy
                                    </Button>
                                </div>
                                <Button
                                    variant="ghost"
                                    onClick={() => setNewKey(null)}
                                    className="mt-2 text-text-muted hover:text-text-secondary h-auto p-0 hover:bg-transparent"
                                >
                                    Dismiss
                                </Button>
                            </div>
                        )}

                        {keyError && (
                            <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                                <p className="text-sm text-red-400">{keyError}</p>
                            </div>
                        )}

                        <div className="flex gap-2 mb-6">
                            <Input
                                value={newKeyName}
                                onChange={(e) => setNewKeyName(e.target.value)}
                                placeholder="Key name (e.g., Antigravity)"
                                className="flex-1"
                                onKeyDown={(e) => e.key === 'Enter' && handleCreateKey()}
                            />
                            <Button
                                onClick={handleCreateKey}
                                disabled={!newKeyName.trim() || isCreating}
                                isLoading={isCreating}
                                icon={<Plus size={16} />}
                            >
                                Generate Key
                            </Button>
                        </div>

                        {keysLoading ? (
                            <div className="flex justify-center py-8">
                                <Button variant="ghost" isLoading disabled>
                                    Loading keys...
                                </Button>
                            </div>
                        ) : apiKeys.length === 0 ? (
                            <p className="text-center py-8 text-text-muted">
                                No API keys yet. Create one to get started.
                            </p>
                        ) : (
                            <div className="space-y-3">
                                {apiKeys.map((key) => (
                                    <div
                                        key={key.id}
                                        className="flex items-center justify-between p-4 rounded-lg bg-bg-hover"
                                    >
                                        <div>
                                            <p className="font-medium text-text-primary">
                                                {key.name}
                                            </p>
                                            <p className="text-sm text-text-muted">
                                                Created {formatDate(key.created_at)}
                                                {key.last_used_at
                                                    ? ` | Last used ${formatDate(key.last_used_at)}`
                                                    : ''}
                                            </p>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            onClick={() => handleDeleteKey(key.id)}
                                            className="text-text-muted hover:text-red-400 hover:bg-red-50"
                                            icon={<Trash2 size={18} />}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>

                    <Card className="p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <BookOpen size={20} className="text-accent-rose" />
                            <h2 className="text-xl font-semibold font-body text-text-primary">
                                API Example
                            </h2>
                        </div>
                        <div className="mb-4 space-y-2 text-sm text-text-secondary">
                            <p>
                                If you are sending a weekly log from another client, use the same
                                payload shape as the skill above. Ownership comes from the API key,
                                so you do not need to pass a user id.
                            </p>
                            <p>
                                For quick verification, request the same date range back with
                                <code className="mx-1 text-text-primary">GET /api/logs</code>
                                after posting.
                            </p>
                        </div>
                        <pre className="p-4 rounded-lg text-sm overflow-x-auto bg-bg-base border border-border">
                            <code className="text-text-secondary">{`curl -X POST https://idea-dump-alpha.vercel.app/api/logs \\
  -H "x-api-key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "content": {
      "date": "2026-02-04",
      "day": "Tuesday",
      "operation_task": "Product Led Flow: Implemented API endpoint",
      "tools_used": "VSCode, Next.js, Supabase, TypeScript",
      "lesson_learned": "Hybrid auth simplifies multi-client access patterns"
    }
  }'`}</code>
                        </pre>
                    </Card>

                    <Card className="p-0 overflow-hidden">
                        <div className="p-6 pb-0">
                            <h2 className="text-xl font-semibold font-body text-text-primary">
                                API Reference
                            </h2>
                        </div>
                        {docsError ? (
                            <div className="p-6">
                                <p className="text-error">{docsError}</p>
                                <p className="text-text-muted mt-2">
                                    If your network blocks CDNs, switch Swagger UI to a local
                                    dependency.
                                </p>
                            </div>
                        ) : (
                            <div id="swagger-ui" />
                        )}
                    </Card>
                </div>
            </main>
        </div>
    );
}
