'use client';

import { useEffect, useMemo, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { Sidebar } from '@/components/organisms/Sidebar';
import { Card } from '@/components/atoms/Card';
import { Project } from '@/lib/types';

interface SwaggerBundle {
    (options: {
        dom_id: string;
        layout: string;
        presets: unknown[];
        url: string;
    }): void;
    presets: {
        apis: unknown;
    };
}

declare global {
    interface Window {
        SwaggerUIBundle?: SwaggerBundle;
        SwaggerUIStandalonePreset?: unknown;
    }
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

export default function ApiDocsPage() {
    const [projects, setProjects] = useState<Project[]>([]);
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

        async function initDocs() {
            try {
                await loadStyle(cdn.css);
                await loadScript(cdn.bundle);
                await loadScript(cdn.preset);

                if (cancelled) return;
                if (!window.SwaggerUIBundle) throw new Error('Swagger UI failed to load');

                window.SwaggerUIBundle({
                    url: '/api/openapi',
                    dom_id: '#swagger-ui',
                    presets: [
                        window.SwaggerUIBundle.presets.apis,
                        window.SwaggerUIStandalonePreset,
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
        initDocs();

        return () => {
            cancelled = true;
        };
    }, [cdn]);

    return (
        <div className="flex min-h-screen bg-bg-base font-body text-text-primary">
            <Sidebar projects={projects} />
            <main className="flex-1 ml-64 p-8">
                <div className="max-w-6xl space-y-8">
                    <header>
                        <h1 className="text-3xl font-heading font-medium">API Docs</h1>
                    </header>

                    <Card className="p-0 overflow-hidden">
                        <div className="p-6 pb-0">
                            <div className="flex items-center gap-2">
                                <BookOpen size={20} className="text-accent-rose" />
                                <h2 className="text-xl font-semibold font-body text-text-primary">
                                    API Reference
                                </h2>
                            </div>
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
