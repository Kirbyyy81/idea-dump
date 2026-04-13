'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sidebar } from '@/components/organisms/Sidebar';
import { Card } from '@/components/atoms/Card';
import { Project } from '@/lib/types';

declare global {
    interface Window {
        SwaggerUIBundle?: any;
        SwaggerUIStandalonePreset?: any;
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
    const [error, setError] = useState<string | null>(null);

    const cdn = useMemo(() => {
        // Pros: no npm dependency, fast to add.
        // Cons: relies on external CDN availability.
        const base = 'https://unpkg.com/swagger-ui-dist@5.18.2';
        return {
            css: `${base}/swagger-ui.css`,
            bundle: `${base}/swagger-ui-bundle.js`,
            preset: `${base}/swagger-ui-standalone-preset.js`,
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function init() {
            try {
                // Sidebar expects projects; fetch best-effort.
                const res = await fetch('/api/projects');
                if (res.ok) {
                    const data = await res.json();
                    if (!cancelled) setProjects(data.data || []);
                }

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
            } catch (e) {
                if (cancelled) return;
                setError(e instanceof Error ? e.message : 'Failed to load docs');
            }
        }

        init();
        return () => {
            cancelled = true;
        };
    }, [cdn]);

    return (
        <div className="flex min-h-screen bg-bg-base font-body text-text-primary">
            <Sidebar projects={projects} />
            <main className="flex-1 ml-64 p-8">
                <header className="mb-6">
                    <h1 className="text-3xl font-heading font-medium">API Docs</h1>
                    <p className="text-text-muted mt-1">
                        Swagger UI powered by <code className="text-text-secondary">/api/openapi</code>.
                    </p>
                </header>

                {error ? (
                    <Card className="p-6">
                        <p className="text-error">{error}</p>
                        <p className="text-text-muted mt-2">
                            If your network blocks CDNs, we can switch to a local Swagger UI dependency.
                        </p>
                    </Card>
                ) : (
                    <Card className="p-0 overflow-hidden">
                        <div id="swagger-ui" />
                    </Card>
                )}
            </main>
        </div>
    );
}
