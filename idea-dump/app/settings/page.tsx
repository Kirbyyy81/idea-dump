'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Key, Copy, Plus, Trash2, Moon, Sun } from 'lucide-react';
import { generateApiKeyPreview } from '@/lib/utils';

interface ApiKeyDisplay {
    id: string;
    name: string;
    preview: string;
    created_at: string;
}

export default function SettingsPage() {
    const [theme, setTheme] = useState<'dark' | 'light'>('dark');
    const [apiKeys, setApiKeys] = useState<ApiKeyDisplay[]>([
        {
            id: '1',
            name: 'Antigravity Integration',
            preview: 'id_abc...xyz',
            created_at: new Date().toISOString(),
        },
    ]);
    const [newKeyName, setNewKeyName] = useState('');
    const [newKey, setNewKey] = useState<string | null>(null);

    const toggleTheme = () => {
        const newTheme = theme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
    };

    const handleCreateKey = () => {
        if (!newKeyName.trim()) return;

        const key = generateApiKeyPreview();
        setNewKey(key);

        setApiKeys((prev) => [
            ...prev,
            {
                id: Date.now().toString(),
                name: newKeyName,
                preview: `${key.slice(0, 6)}...${key.slice(-4)}`,
                created_at: new Date().toISOString(),
            },
        ]);
        setNewKeyName('');
    };

    const handleDeleteKey = (id: string) => {
        setApiKeys((prev) => prev.filter((k) => k.id !== id));
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    return (
        <div className="min-h-screen p-8 max-w-3xl mx-auto">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <Link
                    href="/dashboard"
                    className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
                >
                    <ArrowLeft size={20} />
                </Link>
                <h1 className="text-3xl font-bold text-text-primary">Settings</h1>
            </div>

            {/* Theme Section */}
            <section className="mb-8 p-6 rounded-lg bg-bg-elevated border border-border-subtle">
                <h2 className="text-xl font-semibold text-text-primary mb-4">Appearance</h2>
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium text-text-primary">Theme</p>
                        <p className="text-sm text-text-secondary">Choose light or dark mode</p>
                    </div>
                    <button
                        onClick={toggleTheme}
                        className="btn-secondary flex items-center gap-2"
                    >
                        {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                        {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                    </button>
                </div>
            </section>

            {/* API Keys Section */}
            <section className="p-6 rounded-lg bg-bg-elevated border border-border-subtle">
                <div className="flex items-center gap-2 mb-4">
                    <Key size={20} className="text-accent-rose" />
                    <h2 className="text-xl font-semibold text-text-primary">API Keys</h2>
                </div>
                <p className="text-sm text-text-secondary mb-6">
                    Generate API keys to send PRDs from external tools like Antigravity.
                </p>

                {/* New Key Display */}
                {newKey && (
                    <div className="mb-6 p-4 rounded-lg bg-accent-sage/20 border border-accent-sage">
                        <p className="text-sm font-medium text-accent-sage mb-2">
                            ⚠️ Copy this key now. You won&apos;t be able to see it again!
                        </p>
                        <div className="flex items-center gap-2">
                            <code className="flex-1 p-2 rounded bg-bg-base text-sm font-mono">
                                {newKey}
                            </code>
                            <button
                                onClick={() => copyToClipboard(newKey)}
                                className="btn-secondary p-2"
                            >
                                <Copy size={16} />
                            </button>
                        </div>
                        <button
                            onClick={() => setNewKey(null)}
                            className="text-sm text-text-muted hover:text-text-secondary mt-2"
                        >
                            Dismiss
                        </button>
                    </div>
                )}

                {/* Create New Key */}
                <div className="flex gap-2 mb-6">
                    <input
                        type="text"
                        value={newKeyName}
                        onChange={(e) => setNewKeyName(e.target.value)}
                        placeholder="Key name (e.g., Antigravity)"
                        className="input flex-1"
                    />
                    <button
                        onClick={handleCreateKey}
                        disabled={!newKeyName.trim()}
                        className="btn-primary flex items-center gap-2"
                    >
                        <Plus size={16} />
                        Generate Key
                    </button>
                </div>

                {/* Existing Keys */}
                <div className="space-y-3">
                    {apiKeys.map((key) => (
                        <div
                            key={key.id}
                            className="flex items-center justify-between p-4 rounded-lg bg-bg-hover"
                        >
                            <div>
                                <p className="font-medium text-text-primary">{key.name}</p>
                                <p className="text-sm text-text-muted font-mono">{key.preview}</p>
                            </div>
                            <button
                                onClick={() => handleDeleteKey(key.id)}
                                className="text-text-muted hover:text-accent-rose transition-colors"
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                </div>
            </section>

            {/* Usage Instructions */}
            <section className="mt-8 p-6 rounded-lg bg-bg-elevated border border-border-subtle">
                <h2 className="text-xl font-semibold text-text-primary mb-4">API Usage</h2>
                <pre className="p-4 rounded-lg bg-bg-base text-sm overflow-x-auto">
                    <code className="text-text-secondary">{`curl -X POST https://your-app.vercel.app/api/ingest \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "title": "My New PRD",
    "prd_content": "# PRD Content...",
    "tags": ["ai", "web"]
  }'`}</code>
                </pre>
            </section>
        </div>
    );
}
