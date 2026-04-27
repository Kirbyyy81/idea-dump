'use client';

import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react';
import Link from 'next/link';
import {
    Activity,
    AlertTriangle,
    BookOpen,
    ChevronDown,
    Copy,
    Download,
    KeyRound,
    Lightbulb,
    LayoutDashboard,
    ShieldCheck,
    TerminalSquare,
    Trash2,
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

const setupPrompt = `Use the IdeaDump implementation guide workflow.

1. Generate an API key in the API Key Section.
2. Download the Weekly Log Skill and add it to the agent environment.
3. Authorize the agent with the generated API key.
4. Send a test log and verify it appears on the dashboard.`;

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

function SectionTitle({
    icon: Icon,
    title,
    description,
}: {
    icon: ComponentType<{ className?: string; size?: number }>;
    title: string;
    description?: string;
}) {
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-border-default bg-bg-elevated text-accent-rose">
                    <Icon size={18} />
                </div>
                <div className="space-y-1">
                    <h2 className="text-xl font-heading font-medium text-text-primary">
                        {title}
                    </h2>
                    {description ? (
                        <p className="max-w-2xl text-sm leading-6 text-text-secondary">
                            {description}
                        </p>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function RailItem({
    icon: Icon,
    title,
    description,
    children,
    accent = 'text-text-primary',
}: {
    icon: ComponentType<{ className?: string; size?: number }>;
    title: string;
    description: ReactNode;
    children?: ReactNode;
    accent?: string;
}) {
    return (
        <li className="relative flex gap-6">
            <div className="absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-lg border-2 border-border-default bg-bg-elevated text-text-primary">
                <Icon size={18} className={accent} />
            </div>
            <div className="pt-1 pl-16">
                <h3 className="text-2xl font-heading font-medium text-text-primary">{title}</h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-text-secondary">{description}</p>
                {children ? <div className="mt-4">{children}</div> : null}
            </div>
        </li>
    );
}

function CollapsibleSection({
    icon: Icon,
    title,
    description,
    isOpen,
    onToggle,
    children,
    anchorId,
}: {
    icon: ComponentType<{ className?: string; size?: number }>;
    title: string;
    description: string;
    isOpen: boolean;
    onToggle: () => void;
    children: ReactNode;
    anchorId?: string;
}) {
    return (
        <Card id={anchorId} className="scroll-mt-24 p-0 overflow-hidden">
            <button
                type="button"
                onClick={onToggle}
                className="flex w-full items-center justify-between gap-4 p-6 text-left transition-colors hover:bg-bg-subtle md:p-8"
                aria-expanded={isOpen}
            >
                <SectionTitle icon={Icon} title={title} description={description} />
                <ChevronDown
                    size={18}
                    className={`shrink-0 text-text-muted transition-transform ${isOpen ? 'rotate-180' : ''}`}
                />
            </button>
            {isOpen ? <div className="border-t border-border-subtle px-6 pb-6 md:px-8 md:pb-8">{children}</div> : null}
        </Card>
    );
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
    const [copiedPrompt, setCopiedPrompt] = useState(false);
    const [copiedSkill, setCopiedSkill] = useState(false);
    const [isSkillOpen, setIsSkillOpen] = useState(true);
    const [isDocsOpen, setIsDocsOpen] = useState(true);

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
                    presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
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

    const copyToClipboard = async (text: string) => {
        await navigator.clipboard.writeText(text);
    };

    const copySetup = async () => {
        await copyToClipboard(setupPrompt);
        setCopiedPrompt(true);
        window.setTimeout(() => setCopiedPrompt(false), 2000);
    };

    const copySkillMarkdown = async () => {
        await copyToClipboard(weeklyLogSkillMarkdown);
        setCopiedSkill(true);
        window.setTimeout(() => setCopiedSkill(false), 2000);
    };

    return (
        <div className="flex min-h-screen bg-bg-base font-body text-text-primary">
            <Sidebar projects={projects} />

            <main className="flex-1 px-4 py-6 sm:px-6 lg:ml-64 lg:px-8 lg:py-8">
                <div className="mx-auto flex max-w-5xl flex-col gap-8">
                    <Card className="w-full overflow-hidden p-0">
                        <div className="p-8 md:p-12">
                            <div className="flex items-start gap-4">
                                <div className="mt-1 flex h-12 w-12 items-center justify-center rounded-full border border-accent-rose bg-bg-elevated text-accent-rose">
                                    <Lightbulb size={22} />
                                </div>
                                <div className="space-y-2">
                                    <h1 className="text-3xl font-heading font-medium md:text-[2.15rem]">
                                        Implementation Guide
                                    </h1>
                                    <p className="max-w-2xl text-sm leading-6 text-text-secondary md:text-base">
                                        Follow this workflow to integrate the Codex logging engine.
                                        Designed for the IdeaDump ecosystem.
                                    </p>
                                </div>
                            </div>

                            <div className="my-7 border-t border-dashed border-border-subtle" />

                            <div className="space-y-6">
                                <div className="rounded-xl border border-info bg-info-bg p-5 md:p-6">
                                    <div className="flex items-start gap-4">
                                        <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-info bg-bg-elevated text-info">
                                            <TerminalSquare size={20} />
                                        </div>
                                        <div className="flex-1 space-y-3">
                                            <div className="space-y-1">
                                                <h2 className="text-lg font-heading font-medium text-text-primary">
                                                    Instant Setup
                                                </h2>
                                                <p className="max-w-2xl text-sm leading-6 text-text-secondary">
                                                    Prefer a guided setup? Use our pre-configured
                                                    agent prompt to get running in seconds.
                                                </p>
                                            </div>
                                            <Button
                                                variant="secondary"
                                                onClick={copySetup}
                                                icon={<Copy size={16} />}
                                                className="h-10 border-border-default bg-bg-elevated px-4 text-sm hover:bg-bg-subtle"
                                            >
                                                {copiedPrompt ? 'Copied' : 'Copy Setup Prompt'}
                                            </Button>
                                        </div>
                                    </div>
                                </div>

                                <ol className="relative space-y-10 before:absolute before:left-[19px] before:top-2 before:h-[calc(100%-0.5rem)] before:w-px before:bg-border-default">
                                    <RailItem
                                        icon={KeyRound}
                                        title="Generate API Key"
                                        description={
                                            <>
                                                Start by minting a secure token in the{' '}
                                                <Link
                                                    href="#api-section"
                                                    className="font-medium text-accent-rose underline decoration-accent-rose/40 underline-offset-2"
                                                >
                                                    API Key Section
                                                </Link>
                                                .
                                            </>
                                        }
                                    >
                                        <div className="inline-flex items-center gap-2 rounded-full border border-warning bg-warning-bg px-3 py-1 text-xs text-text-primary">
                                            <AlertTriangle size={14} className="text-warning" />
                                            The key is only shown once. Copy it immediately.
                                        </div>
                                    </RailItem>

                                    <RailItem
                                        icon={Download}
                                        title="Download Weekly Log Skill"
                                        description="Import the core skill definition into your agent environment to enable logging capabilities."
                                    >
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                variant="secondary"
                                                onClick={copySkillMarkdown}
                                                icon={<Copy size={16} />}
                                                className="h-10 border-border-default bg-bg-elevated px-4 text-sm hover:bg-bg-subtle"
                                            >
                                                {copiedSkill ? 'Copied' : 'Copy Skill'}
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
                                                className="h-10 border-border-default bg-bg-elevated px-4 text-sm hover:bg-bg-subtle"
                                            >
                                                Download .md
                                            </Button>
                                        </div>
                                    </RailItem>

                                    <RailItem
                                        icon={ShieldCheck}
                                        title="Authorize Agent"
                                        description="Provide the generated API key to your agent configuration to establish a secure connection."
                                    />

                                    <RailItem
                                        icon={Activity}
                                        title="Test the System"
                                        description="Send a test log and verify its appearance on your IdeaDump Dashboard."
                                    >
                                        <div className="flex flex-wrap gap-2">
                                            <Button
                                                variant="ghost"
                                                className="h-8 rounded-md border border-accent-sage bg-success-bg px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-accent-sage hover:bg-success-bg hover:text-accent-sage"
                                            >
                                                POST /logs
                                            </Button>
                                            <Button
                                                variant="ghost"
                                                className="h-8 rounded-md border border-info bg-info-bg px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-info hover:bg-info-bg hover:text-info"
                                            >
                                                Verify Dashboard
                                            </Button>
                                        </div>
                                    </RailItem>
                                </ol>

                                <div className="flex flex-col gap-3 border-t border-border-subtle pt-6 sm:flex-row sm:items-center sm:justify-between">
                                    <Link
                                        href="#docs"
                                        className="text-sm text-text-secondary underline decoration-border-strong underline-offset-2 transition-colors hover:text-text-primary"
                                    >
                                        Need technical help? View Docs.
                                    </Link>

                                    <Link
                                        href="/dashboard"
                                        className="inline-flex items-center justify-center gap-2 rounded-md bg-accent-rose px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[#D45F73]"
                                    >
                                        Open Dashboard
                                        <LayoutDashboard size={16} />
                                    </Link>
                                </div>
                            </div>
                        </div>
                    </Card>

                    <div className="space-y-6">
                        <Card id="api-section" className="scroll-mt-24 p-6 md:p-8">
                            <SectionTitle
                                icon={KeyRound}
                                title="API Key Section"
                                description="Generate secure keys, copy the first reveal, and manage active tokens from this section."
                            />

                            {newKey && (
                                <div className="mt-6 rounded-2xl border border-accent-sage bg-success-bg p-4">
                                    <p className="mb-2 flex items-center gap-2 text-sm font-medium text-accent-sage">
                                        <AlertTriangle size={16} />
                                        Copy this key now. You will not be able to see it again.
                                    </p>
                                    <div className="flex items-center gap-2">
                                        <code className="flex-1 overflow-x-auto rounded-md border border-border-subtle bg-bg-elevated p-2 text-sm text-text-primary">
                                            {newKey}
                                        </code>
                                        <Button
                                            variant="secondary"
                                            onClick={() => copyToClipboard(newKey)}
                                            icon={<Copy size={16} />}
                                            className="h-10 border-border-default bg-bg-elevated px-4 text-sm hover:bg-bg-subtle"
                                        >
                                            Copy
                                        </Button>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        onClick={() => setNewKey(null)}
                                        className="mt-2 h-auto p-0 text-sm text-text-muted hover:bg-transparent hover:text-text-secondary"
                                    >
                                        Dismiss
                                    </Button>
                                </div>
                            )}

                            {keyError && (
                                <div className="mt-6 rounded-2xl border border-error bg-error-bg p-3">
                                    <p className="text-sm text-error">{keyError}</p>
                                </div>
                            )}

                            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
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
                                    icon={<KeyRound size={16} />}
                                    className="h-11"
                                >
                                    Generate Key
                                </Button>
                            </div>

                            <div className="mt-6 space-y-3">
                                {keysLoading ? (
                                    <div className="flex justify-center py-8">
                                        <Button variant="ghost" isLoading disabled>
                                            Loading keys...
                                        </Button>
                                    </div>
                                ) : apiKeys.length === 0 ? (
                                    <p className="py-6 text-center text-sm text-text-muted">
                                        No API keys yet. Create one to get started.
                                    </p>
                                ) : (
                                    apiKeys.map((key) => (
                                        <div
                                            key={key.id}
                                            className="flex items-center justify-between gap-4 rounded-2xl border border-border-default bg-bg-base px-4 py-4"
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
                                                className="h-9 rounded-md border border-border-default bg-bg-elevated px-3 text-sm text-text-muted hover:bg-error-bg hover:text-error"
                                                icon={<Trash2 size={16} />}
                                            >
                                                Delete
                                            </Button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </Card>

                        <CollapsibleSection
                            icon={BookOpen}
                            title="Weekly Log Skill"
                            description="Import the skill definition, copy the markdown, or download it for your agent workspace."
                            isOpen={isSkillOpen}
                            onToggle={() => setIsSkillOpen((current) => !current)}
                        >
                            <div className="mt-6 space-y-4">
                                <div className="flex flex-wrap gap-2">
                                    <Button
                                        variant="secondary"
                                        onClick={copySkillMarkdown}
                                        icon={<Copy size={16} />}
                                        className="h-10 border-border-default bg-bg-elevated px-4 text-sm hover:bg-bg-subtle"
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
                                        className="h-10 border-border-default bg-bg-elevated px-4 text-sm hover:bg-bg-subtle"
                                    >
                                        Download .md
                                    </Button>
                                </div>

                                <div className="rounded-2xl border border-border-default bg-bg-base p-4">
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-text-muted">
                                        Preview
                                    </p>
                                    <pre className="overflow-x-auto text-xs leading-6 md:text-sm">
                                        <code className="whitespace-pre-wrap text-text-secondary">
                                            {weeklyLogSkillPreview}
                                        </code>
                                    </pre>
                                </div>

                                <p className="text-sm leading-6 text-text-secondary">
                                    This keeps the skill metadata visible at a glance while still
                                    exposing the full markdown for copy or download.
                                </p>
                            </div>
                        </CollapsibleSection>
                    </div>

                    <CollapsibleSection
                        icon={BookOpen}
                        title="API Reference"
                        description="Swagger/OpenAPI docs for the logging endpoints, served inside the app."
                        isOpen={isDocsOpen}
                        onToggle={() => setIsDocsOpen((current) => !current)}
                        anchorId="docs"
                    >
                        <div className="mt-6">
                            {docsError ? (
                                <div>
                                    <div className="rounded-2xl border border-error bg-error-bg p-4">
                                        <p className="text-sm text-error">{docsError}</p>
                                    </div>
                                    <p className="mt-3 text-sm text-text-muted">
                                        If your network blocks CDNs, switch Swagger UI to a local
                                        dependency.
                                    </p>
                                </div>
                            ) : (
                                <div id="swagger-ui" className="min-h-[540px] bg-bg-elevated" />
                            )}
                        </div>
                    </CollapsibleSection>
                </div>
            </main>
        </div>
    );
}
