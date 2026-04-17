'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, Copy, Key, Plus, Trash2, Workflow } from 'lucide-react';
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
                                How It Works
                            </h2>
                        </div>
                        <div className="space-y-2 text-sm text-text-secondary">
                            <p>
                                Session-authenticated requests create human-owned records for the
                                signed-in user.
                            </p>
                            <p>
                                API-key-authenticated requests resolve ownership through
                                <code className="mx-1 text-text-primary">api_keys.user_id</code>,
                                so agent writes land directly under that user.
                            </p>
                            <p>
                                The logs API no longer accepts
                                <code className="mx-1 text-text-primary">owner_user_id</code>.
                                Ownership is derived from authentication.
                            </p>
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
                                Usage
                            </h2>
                        </div>
                        <pre className="p-4 rounded-lg text-sm overflow-x-auto bg-bg-base">
                            <code className="text-text-secondary">{`curl -X POST https://your-app.vercel.app/api/ingest \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "title": "My New PRD",
    "prd_content": "# PRD Content...",
    "tags": ["ai", "web"]
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
