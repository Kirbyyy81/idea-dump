'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Key, Copy, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { generateApiKeyPreview } from '@/lib/utils';

interface ApiKeyDisplay {
    id: string;
    name: string;
    preview: string;
    created_at: string;
}

export default function SettingsPage() {
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
                    className="flex items-center gap-2 transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    <ArrowLeft size={20} />
                </Link>
                <h1 style={{ color: 'var(--text-primary)' }}>Settings</h1>
            </div>

            {/* API Keys Section */}
            <section
                className="p-6 rounded-lg"
                style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)'
                }}
            >
                <div className="flex items-center gap-2 mb-4">
                    <Key size={20} style={{ color: 'var(--accent-rose)' }} />
                    <h2
                        className="text-xl font-semibold"
                        style={{
                            fontFamily: 'var(--font-body)',
                            color: 'var(--text-primary)'
                        }}
                    >
                        API Keys
                    </h2>
                </div>
                <p
                    className="text-sm mb-6"
                    style={{ color: 'var(--text-secondary)' }}
                >
                    Generate API keys to send PRDs from external tools like Antigravity.
                </p>

                {/* New Key Display */}
                {newKey && (
                    <div
                        className="mb-6 p-4 rounded-lg"
                        style={{
                            background: 'var(--success-bg)',
                            border: '1px solid var(--accent-sage)'
                        }}
                    >
                        <p
                            className="text-sm font-medium mb-2 flex items-center gap-2"
                            style={{ color: 'var(--accent-sage)' }}
                        >
                            <AlertTriangle size={16} />
                            Copy this key now. You won&apos;t be able to see it again!
                        </p>
                        <div className="flex items-center gap-2">
                            <code
                                className="flex-1 p-2 rounded text-sm font-mono"
                                style={{ background: 'var(--bg-base)' }}
                            >
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
                            className="text-sm mt-2"
                            style={{ color: 'var(--text-muted)' }}
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
                            className="flex items-center justify-between p-4 rounded-lg"
                            style={{ background: 'var(--bg-hover)' }}
                        >
                            <div>
                                <p
                                    className="font-medium"
                                    style={{ color: 'var(--text-primary)' }}
                                >
                                    {key.name}
                                </p>
                                <p
                                    className="text-sm font-mono"
                                    style={{ color: 'var(--text-muted)' }}
                                >
                                    {key.preview}
                                </p>
                            </div>
                            <button
                                onClick={() => handleDeleteKey(key.id)}
                                className="transition-colors"
                                style={{ color: 'var(--text-muted)' }}
                            >
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                </div>
            </section>

            {/* Usage Instructions */}
            <section
                className="mt-8 p-6 rounded-lg"
                style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)'
                }}
            >
                <h2
                    className="text-xl font-semibold mb-4"
                    style={{
                        fontFamily: 'var(--font-body)',
                        color: 'var(--text-primary)'
                    }}
                >
                    API Usage
                </h2>
                <pre
                    className="p-4 rounded-lg text-sm overflow-x-auto"
                    style={{ background: 'var(--bg-base)' }}
                >
                    <code style={{ color: 'var(--text-secondary)' }}>{`curl -X POST https://your-app.vercel.app/api/ingest \\
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
