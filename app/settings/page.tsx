'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Key, Copy, Plus, Trash2, AlertTriangle } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Card } from '@/components/atoms/Card';

interface ApiKeyDisplay {
    id: string;
    name: string;
    created_at: string;
    last_used_at: string | null;
}

export default function SettingsPage() {
    const [apiKeys, setApiKeys] = useState<ApiKeyDisplay[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isCreating, setIsCreating] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [newKey, setNewKey] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Fetch existing API keys
    useEffect(() => {
        async function fetchKeys() {
            try {
                const res = await fetch('/api/keys');
                if (!res.ok) throw new Error('Failed to fetch keys');
                const { data } = await res.json();
                setApiKeys(data || []);
            } catch (err) {
                console.error('Error fetching keys:', err);
            } finally {
                setIsLoading(false);
            }
        }
        fetchKeys();
    }, []);

    const handleCreateKey = async () => {
        if (!newKeyName.trim()) return;

        setIsCreating(true);
        setError(null);

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
            setApiKeys((prev) => [{ id: data.id, name: data.name, created_at: data.created_at, last_used_at: null }, ...prev]);
            setNewKeyName('');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An error occurred');
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteKey = async (id: string) => {
        if (!confirm('Are you sure you want to delete this API key?')) return;

        try {
            const res = await fetch(`/api/keys?id=${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete key');
            setApiKeys((prev) => prev.filter((k) => k.id !== id));
        } catch (err) {
            console.error('Failed to delete key:', err);
        }
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
                    className="flex items-center gap-2 transition-colors text-text-secondary hover:text-text-primary"
                >
                    <ArrowLeft size={20} />
                </Link>
                <h1 className="text-text-primary">Settings</h1>
            </div>

            {/* API Keys Section */}
            <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                    <Key size={20} className="text-accent-rose" />
                    <h2 className="text-xl font-semibold font-body text-text-primary">
                        API Keys
                    </h2>
                </div>
                <p className="text-sm mb-6 text-text-secondary">
                    Generate API keys to send PRDs from external tools like Antigravity.
                </p>

                {/* New Key Display */}
                {newKey && (
                    <div className="mb-6 p-4 rounded-lg bg-success-bg border border-accent-sage">
                        <p className="text-sm font-medium mb-2 flex items-center gap-2 text-accent-sage">
                            <AlertTriangle size={16} />
                            Copy this key now. You won&apos;t be able to see it again!
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

                {/* Error Display */}
                {error && (
                    <div className="mb-6 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                        <p className="text-sm text-red-400">{error}</p>
                    </div>
                )}

                {/* Create New Key */}
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

                {/* Existing Keys */}
                {isLoading ? (
                    <div className="flex justify-center py-8">
                        <Button variant="ghost" isLoading disabled>Loading keys...</Button>
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
                                        {key.last_used_at && ` · Last used ${formatDate(key.last_used_at)}`}
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

            {/* Usage Instructions */}
            <Card className="mt-8 p-6">
                <h2 className="text-xl font-semibold mb-4 font-body text-text-primary">
                    API Usage
                </h2>
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
        </div>
    );
}
