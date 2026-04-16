'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/organisms/Sidebar';
import { LogForm } from '@/components/organisms/LogForm';
import { LogEntryCard } from '@/components/organisms/LogEntryCard';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { DailyLogEntry, DailyLogContent, Project } from '@/lib/types';
import { Plus, Download, RefreshCw, Calendar } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useAlert } from '@/lib/contexts/AlertContext';
import { PageLoader } from '@/components/atoms/Loader';
import { Input } from '@/components/atoms/Input';

export default function LogsPage() {
    const [logs, setLogs] = useState<DailyLogEntry[]>([]);
    const [projects, setProjects] = useState<Project[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editContent, setEditContent] = useState<DailyLogContent | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // New log form
    const [showNewForm, setShowNewForm] = useState(false);

    // Filters + export date range (YYYY-MM-DD)
    const [exportFrom, setExportFrom] = useState('');
    const [exportTo, setExportTo] = useState('');
    const [sourceFilter, setSourceFilter] = useState<'all' | 'agent' | 'human'>('all');
    const [query, setQuery] = useState('');

    const [exportMarkdown, setExportMarkdown] = useState<string>('');

    // Fetch logs and projects
    useEffect(() => {
        async function fetchData() {
            try {
                setIsLoading(true);

                const [logsRes, projectsRes] = await Promise.all([
                    fetch('/api/logs'),
                    fetch('/api/projects'),
                ]);

                if (!logsRes.ok) throw new Error('Failed to fetch logs');
                if (!projectsRes.ok) throw new Error('Failed to fetch projects');

                const logsData = await logsRes.json();
                const projectsData = await projectsRes.json();

                setLogs(logsData.data || []);
                setProjects(projectsData.data || []);
            } catch (err) {
                setError(err instanceof Error ? err.message : 'An error occurred');
            } finally {
                setIsLoading(false);
            }
        }
        fetchData();
    }, []);

    const handleRefresh = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/logs');
            if (!res.ok) throw new Error('Failed to fetch logs');
            const data = await res.json();
            setLogs(data.data || []);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Refresh failed');
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreateLog = async (content: DailyLogContent) => {
        setIsSaving(true);
        try {
            const res = await fetch('/api/logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content }),
            });

            if (!res.ok) throw new Error('Failed to create log');

            const data = await res.json();
            setLogs([data.data, ...logs]);
            setShowNewForm(false);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Create failed');
        } finally {
            setIsSaving(false);
        }
    };

    const handleStartEdit = (log: DailyLogEntry) => {
        setEditingId(log.id);
        setEditContent({ ...log.content });
    };

    const handleSaveEdit = async () => {
        if (!editingId || !editContent) return;

        setIsSaving(true);
        try {
            const res = await fetch(`/api/logs/${editingId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: editContent }),
            });

            if (!res.ok) throw new Error('Failed to update log');

            const data = await res.json();
            setLogs(logs.map(l => l.id === editingId ? data.data : l));
            setEditingId(null);
            setEditContent(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Update failed');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancelEdit = () => {
        setEditingId(null);
        setEditContent(null);
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Are you sure you want to delete this log entry?')) return;

        try {
            const res = await fetch(`/api/logs/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete log');
            setLogs(logs.filter(l => l.id !== id));
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Delete failed');
        }
    };

    const { showError, showSuccess } = useAlert();

    const copyToClipboard = async (text: string): Promise<boolean> => {
        try {
            await navigator.clipboard.writeText(text);
            return true;
        } catch {
            // fall through
        }

        try {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.setAttribute('readonly', 'true');
            textarea.style.position = 'fixed';
            textarea.style.top = '0';
            textarea.style.left = '0';
            textarea.style.opacity = '0';
            document.body.appendChild(textarea);
            textarea.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(textarea);
            return ok;
        } catch {
            return false;
        }
    };

    const allEffectiveDates = logs
        .map(l => l.effective_date)
        .filter((d): d is string => Boolean(d))
        .sort((a, b) => a.localeCompare(b)); // YYYY-MM-DD lexical sort

    const filterFrom = exportFrom || allEffectiveDates[0] || '';
    const filterTo = exportTo || allEffectiveDates[allEffectiveDates.length - 1] || '';

    const filteredLogs = logs.filter((log) => {
        if (exportFrom && log.effective_date < exportFrom) return false;
        if (exportTo && log.effective_date > exportTo) return false;
        if (sourceFilter !== 'all' && log.source !== sourceFilter) return false;

        if (query.trim()) {
            const q = query.trim().toLowerCase();
            const content = log.content as unknown as Partial<DailyLogContent>;
            const haystack = [
                content.day,
                content.operation_task,
                content.tools_used,
                content.lesson_learned,
            ]
                .filter(Boolean)
                .join(' ')
                .toLowerCase();

            if (!haystack.includes(q)) return false;
        }

        return true;
    });

    const handleExport = async () => {
        const from = exportFrom || filterFrom;
        const to = exportTo || filterTo;

        if (!from || !to) {
            showError('No logs available to export yet.', 'Export Error');
            return;
        }

        setIsExporting(true);
        try {
            const res = await fetch('/api/export/weekly', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ from, to }),
            });

            if (!res.ok) throw new Error('Failed to export');

            const data = await res.json();
            const markdown = String(data.markdown || '');
            setExportMarkdown(markdown);

            const copied = await copyToClipboard(markdown);
            if (copied) {
                showSuccess('Markdown copied to clipboard!', 'Export Complete');
            } else {
                showSuccess('Markdown generated below (copy manually if needed).', 'Export Complete');
            }
        } catch (err) {
            showError(err instanceof Error ? err.message : 'Export failed', 'Export Error');
        } finally {
            setIsExporting(false);
        }
    };

    // Group logs by date
    const groupedLogs = filteredLogs.reduce((acc, log) => {
        const date = log.effective_date;
        if (!acc[date]) acc[date] = [];
        acc[date].push(log);
        return acc;
    }, {} as Record<string, DailyLogEntry[]>);

    const sortedDates = Object.keys(groupedLogs).sort((a, b) => b.localeCompare(a));

    if (isLoading) {
        return <PageLoader />;
    }

    return (
        <div className="flex min-h-screen bg-bg-base font-body text-text-primary">
            <Sidebar projects={projects} />

            <main className="flex-1 ml-64 p-8">
                {/* Header */}
                <header className="flex items-center justify-between mb-8">
                    <h1 className="text-3xl font-heading font-medium">Weekly Productivity Log</h1>

                    <div className="flex items-center gap-3">
                        <Button variant="ghost" onClick={handleRefresh} icon={<RefreshCw size={18} />}>
                            Refresh
                        </Button>
                        <Button variant="primary" onClick={() => setShowNewForm(true)} icon={<Plus size={18} />}>
                            New Entry
                        </Button>
                    </div>
                </header>

                {error && (
                    <div className="mb-6 p-4 bg-error-bg border border-error rounded-lg text-error">
                        {error}
                        <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
                    </div>
                )}

                {/* New Log Form */}
                {showNewForm && (
                    <LogForm
                        onSave={handleCreateLog}
                        onCancel={() => setShowNewForm(false)}
                        isLoading={isSaving}
                    />
                )}

                <Card className="p-4 mb-6">
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-end gap-3">
                            <div className="flex items-center gap-2">
                                <Calendar size={16} className="text-text-muted" />
                                <input
                                    type="date"
                                    value={exportFrom}
                                    onChange={(e) => setExportFrom(e.target.value)}
                                    className="bg-transparent text-sm text-text-primary border border-border-subtle rounded-md px-2 py-1"
                                    title="From date"
                                />
                                <span className="text-text-muted text-sm">→</span>
                                <input
                                    type="date"
                                    value={exportTo}
                                    onChange={(e) => setExportTo(e.target.value)}
                                    className="bg-transparent text-sm text-text-primary border border-border-subtle rounded-md px-2 py-1"
                                    title="To date"
                                />
                            </div>

                            <div className="min-w-[160px]">
                                <label className="block text-xs text-text-muted mb-1">Source</label>
                                <select
                                    value={sourceFilter}
                                    onChange={(e) => setSourceFilter(e.target.value as 'all' | 'agent' | 'human')}
                                    className="input py-2 text-sm"
                                >
                                    <option value="all">All</option>
                                    <option value="human">Human</option>
                                    <option value="agent">Agent</option>
                                </select>
                            </div>

                            <div className="flex-1 min-w-[220px]">
                                <label className="block text-xs text-text-muted mb-1">Search</label>
                                <Input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search task/tools/lesson…"
                                    className="text-sm"
                                />
                            </div>

                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    onClick={() => {
                                        setExportFrom('');
                                        setExportTo('');
                                        setSourceFilter('all');
                                        setQuery('');
                                    }}
                                >
                                    Clear
                                </Button>

                                <Button
                                    variant="ghost"
                                    onClick={handleExport}
                                    isLoading={isExporting}
                                    icon={<Download size={16} />}
                                    title="Export to Markdown (auto-copies)"
                                >
                                    Export
                                </Button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between text-sm text-text-muted">
                            <span>
                                Showing {filteredLogs.length} of {logs.length} entries
                                {(exportFrom || exportTo) && filterFrom && filterTo ? ` (${filterFrom} → ${filterTo})` : ''}
                            </span>
                            {exportMarkdown && (
                                <Button
                                    variant="ghost"
                                    onClick={async () => {
                                        const copied = await copyToClipboard(exportMarkdown);
                                        if (copied) showSuccess('Copied to clipboard!', 'Copied');
                                        else showError('Copy failed. Please select and copy manually.', 'Copy Error');
                                    }}
                                    title="Copy last export again"
                                >
                                    Copy last export
                                </Button>
                            )}
                        </div>
                    </div>
                </Card>

                {exportMarkdown && (
                    <Card className="p-4 mb-6">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-heading text-sm text-text-secondary">Export (Markdown)</h3>
                            <Button
                                variant="ghost"
                                onClick={() => setExportMarkdown('')}
                                title="Dismiss export preview"
                            >
                                Dismiss
                            </Button>
                        </div>
                        <textarea
                            className="input w-full text-sm min-h-[160px] font-mono"
                            value={exportMarkdown}
                            readOnly
                        />
                    </Card>
                )}

                {/* Logs List */}
                {sortedDates.length === 0 ? (
                    <Card className="p-12 text-center">
                        <p className="text-text-muted mb-2">No log entries yet.</p>
                        <p className="text-text-muted">Click &quot;New Entry&quot; to add your first log.</p>
                    </Card>
                ) : (
                    <div className="space-y-6">
                        {sortedDates.map(date => (
                            <div key={date}>
                                <h3 className="font-heading text-lg mb-3 text-text-secondary">
                                    {formatDate(date)}
                                </h3>
                                <div className="space-y-3">
                                    {groupedLogs[date]
                                        .slice()
                                        .sort((a, b) => b.created_at.localeCompare(a.created_at))
                                        .map(log => (
                                        <LogEntryCard
                                            key={log.id}
                                            log={log}
                                            isEditing={editingId === log.id}
                                            editContent={editingId === log.id ? editContent : null}
                                            isSaving={isSaving}
                                            onStartEdit={handleStartEdit}
                                            onSaveEdit={handleSaveEdit}
                                            onCancelEdit={handleCancelEdit}
                                            onDelete={handleDelete}
                                            onEditContentChange={setEditContent}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
        </div>
    );
}
