'use client';

import { useState, useEffect } from 'react';
import { Sidebar } from '@/components/organisms/Sidebar';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { DailyLogEntry, DailyLogContent, Project } from '@/lib/types';
import { Loader2, Plus, Download, RefreshCw, Trash2, Save, Calendar } from 'lucide-react';
import { cn, formatDate } from '@/lib/utils';

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
    const [newLog, setNewLog] = useState<DailyLogContent>({
        date: new Date().toISOString().split('T')[0],
        day: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
        operation_task: '',
        tools_used: '',
        lesson_learned: '',
    });

    // Date range for export
    const [exportFrom, setExportFrom] = useState('');
    const [exportTo, setExportTo] = useState('');

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

    const handleCreateLog = async () => {
        if (!newLog.date) return;

        setIsSaving(true);
        try {
            const res = await fetch('/api/logs', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newLog }),
            });

            if (!res.ok) throw new Error('Failed to create log');

            const data = await res.json();
            setLogs([data.data, ...logs]);
            setShowNewForm(false);
            setNewLog({
                date: new Date().toISOString().split('T')[0],
                day: new Date().toLocaleDateString('en-US', { weekday: 'long' }),
                operation_task: '',
                tools_used: '',
                lesson_learned: '',
            });
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

    const handleExport = async () => {
        if (!exportFrom || !exportTo) {
            setError('Please select both from and to dates');
            return;
        }

        setIsExporting(true);
        try {
            const res = await fetch('/api/export/weekly', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: exportFrom, to: exportTo }),
            });

            if (!res.ok) throw new Error('Failed to export');

            const data = await res.json();
            await navigator.clipboard.writeText(data.markdown);
            alert('Markdown copied to clipboard!');
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Export failed');
        } finally {
            setIsExporting(false);
        }
    };

    // Group logs by date
    const groupedLogs = logs.reduce((acc, log) => {
        const date = log.effective_date;
        if (!acc[date]) acc[date] = [];
        acc[date].push(log);
        return acc;
    }, {} as Record<string, DailyLogEntry[]>);

    const sortedDates = Object.keys(groupedLogs).sort((a, b) => b.localeCompare(a));

    if (isLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-bg-base">
                <Loader2 size={32} className="animate-spin text-accent-rose" />
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-bg-base font-body text-text-primary">
            <Sidebar projects={projects} />

            <main className="flex-1 ml-64 p-8">
                {/* Header */}
                <header className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-3xl font-heading font-medium mb-2">Weekly Productivity Log</h1>
                        <p className="text-text-secondary">Track your daily tasks, tools, and lessons learned</p>
                    </div>

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

                {/* Export Section */}
                <Card className="p-4 mb-6">
                    <div className="flex items-center gap-4">
                        <Calendar size={20} className="text-text-muted" />
                        <span className="text-sm font-medium">Export Range:</span>
                        <input
                            type="date"
                            value={exportFrom}
                            onChange={(e) => setExportFrom(e.target.value)}
                            className="input py-1 px-2 text-sm w-36"
                        />
                        <span className="text-text-muted">to</span>
                        <input
                            type="date"
                            value={exportTo}
                            onChange={(e) => setExportTo(e.target.value)}
                            className="input py-1 px-2 text-sm w-36"
                        />
                        <Button
                            variant="secondary"
                            onClick={handleExport}
                            isLoading={isExporting}
                            icon={<Download size={16} />}
                        >
                            Export Markdown
                        </Button>
                    </div>
                </Card>

                {/* New Log Form */}
                {showNewForm && (
                    <Card className="p-6 mb-6">
                        <h3 className="font-heading text-lg mb-4">New Log Entry</h3>
                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-sm text-text-secondary mb-1">Date</label>
                                <input
                                    type="date"
                                    value={newLog.date}
                                    onChange={(e) => setNewLog({ ...newLog, date: e.target.value })}
                                    className="input w-full"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-text-secondary mb-1">Day</label>
                                <input
                                    type="text"
                                    value={newLog.day || ''}
                                    onChange={(e) => setNewLog({ ...newLog, day: e.target.value })}
                                    className="input w-full"
                                    placeholder="e.g., Monday"
                                />
                            </div>
                        </div>
                        <div className="mb-4">
                            <label className="block text-sm text-text-secondary mb-1">Operation / Task</label>
                            <textarea
                                value={newLog.operation_task || ''}
                                onChange={(e) => setNewLog({ ...newLog, operation_task: e.target.value })}
                                className="input w-full min-h-[80px] resize-y"
                                placeholder="What did you work on?"
                            />
                        </div>
                        <div className="mb-4">
                            <label className="block text-sm text-text-secondary mb-1">Tools Used</label>
                            <input
                                type="text"
                                value={newLog.tools_used || ''}
                                onChange={(e) => setNewLog({ ...newLog, tools_used: e.target.value })}
                                className="input w-full"
                                placeholder="e.g., VSCode, Supabase, Postman"
                            />
                        </div>
                        <div className="mb-4">
                            <label className="block text-sm text-text-secondary mb-1">Lesson Learned</label>
                            <textarea
                                value={newLog.lesson_learned || ''}
                                onChange={(e) => setNewLog({ ...newLog, lesson_learned: e.target.value })}
                                className="input w-full min-h-[60px] resize-y"
                                placeholder="What did you learn today?"
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button variant="primary" onClick={handleCreateLog} isLoading={isSaving} icon={<Save size={16} />}>
                                Save Entry
                            </Button>
                            <Button variant="ghost" onClick={() => setShowNewForm(false)}>
                                Cancel
                            </Button>
                        </div>
                    </Card>
                )}

                {/* Logs Table */}
                {sortedDates.length === 0 ? (
                    <Card className="p-12 text-center">
                        <p className="text-text-muted mb-2">No log entries yet.</p>
                        <p className="text-text-muted">Click "New Entry" to add your first log.</p>
                    </Card>
                ) : (
                    <div className="space-y-6">
                        {sortedDates.map(date => (
                            <div key={date}>
                                <h3 className="font-heading text-lg mb-3 text-text-secondary">
                                    {formatDate(date)}
                                </h3>
                                <div className="space-y-3">
                                    {groupedLogs[date].map(log => (
                                        <Card key={log.id} className="p-4">
                                            {editingId === log.id && editContent ? (
                                                // Edit mode
                                                <div className="space-y-3">
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block text-xs text-text-muted mb-1">Date</label>
                                                            <input
                                                                type="date"
                                                                value={editContent.date}
                                                                onChange={(e) => setEditContent({ ...editContent, date: e.target.value })}
                                                                className="input w-full text-sm py-1"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs text-text-muted mb-1">Day</label>
                                                            <input
                                                                type="text"
                                                                value={editContent.day || ''}
                                                                onChange={(e) => setEditContent({ ...editContent, day: e.target.value })}
                                                                className="input w-full text-sm py-1"
                                                            />
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-text-muted mb-1">Task</label>
                                                        <textarea
                                                            value={editContent.operation_task || ''}
                                                            onChange={(e) => setEditContent({ ...editContent, operation_task: e.target.value })}
                                                            className="input w-full text-sm py-1 min-h-[60px]"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-text-muted mb-1">Tools</label>
                                                        <input
                                                            type="text"
                                                            value={editContent.tools_used || ''}
                                                            onChange={(e) => setEditContent({ ...editContent, tools_used: e.target.value })}
                                                            className="input w-full text-sm py-1"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs text-text-muted mb-1">Lesson</label>
                                                        <textarea
                                                            value={editContent.lesson_learned || ''}
                                                            onChange={(e) => setEditContent({ ...editContent, lesson_learned: e.target.value })}
                                                            className="input w-full text-sm py-1 min-h-[40px]"
                                                        />
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Button variant="primary" onClick={handleSaveEdit} isLoading={isSaving} className="text-sm py-1">
                                                            Save
                                                        </Button>
                                                        <Button variant="ghost" onClick={() => { setEditingId(null); setEditContent(null); }} className="text-sm py-1">
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                // View mode
                                                <div className="flex items-start justify-between">
                                                    <div className="flex-1">
                                                        <div className="flex items-center gap-2 mb-2">
                                                            <span className={cn(
                                                                "text-xs px-2 py-0.5 rounded-full",
                                                                log.source === 'agent' ? "bg-accent-blue/20 text-accent-blue" : "bg-accent-sage/20 text-text-secondary"
                                                            )}>
                                                                {log.source}
                                                            </span>
                                                            {log.content.day && (
                                                                <span className="text-sm text-text-muted">{log.content.day}</span>
                                                            )}
                                                        </div>
                                                        {log.content.operation_task && (
                                                            <p className="text-text-primary mb-2">{log.content.operation_task}</p>
                                                        )}
                                                        {log.content.tools_used && (
                                                            <p className="text-sm text-text-secondary mb-1">
                                                                <span className="text-text-muted">Tools:</span> {log.content.tools_used}
                                                            </p>
                                                        )}
                                                        {log.content.lesson_learned && (
                                                            <p className="text-sm text-text-secondary italic">
                                                                <span className="text-text-muted">Learned:</span> {log.content.lesson_learned}
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="flex gap-1">
                                                        <Button variant="ghost" onClick={() => handleStartEdit(log)} className="text-xs p-2">
                                                            Edit
                                                        </Button>
                                                        <Button variant="ghost" onClick={() => handleDelete(log.id)} className="text-xs p-2 text-error hover:text-error">
                                                            <Trash2 size={14} />
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </Card>
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
