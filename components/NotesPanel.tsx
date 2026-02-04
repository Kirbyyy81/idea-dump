'use client';

import { useState } from 'react';
import { Note } from '@/lib/types';
import { formatRelativeTime } from '@/lib/utils';
import { Plus, Send, StickyNote } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NotesPanelProps {
    notes: Note[];
    onAddNote: (content: string) => Promise<void>;
}

export function NotesPanel({ notes, onAddNote }: NotesPanelProps) {
    const [isAdding, setIsAdding] = useState(false);
    const [newNote, setNewNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async () => {
        if (!newNote.trim()) return;

        setIsSubmitting(true);
        try {
            await onAddNote(newNote);
            setNewNote('');
            setIsAdding(false);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2 font-body text-text-primary">
                    <StickyNote size={18} className="text-accent-apricot" />
                    Notes
                </h3>
                {!isAdding && (
                    <button
                        onClick={() => setIsAdding(true)}
                        className="btn-secondary text-sm flex items-center gap-1.5"
                    >
                        <Plus size={14} />
                        Add Note
                    </button>
                )}
            </div>

            {/* Add Note Form */}
            {isAdding && (
                <div className="p-4 rounded-lg bg-bg-hover border border-border-subtle">
                    <textarea
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Write a note..."
                        className="input min-h-[100px] resize-none mb-3"
                        autoFocus
                    />
                    <div className="flex gap-2 justify-end">
                        <button
                            onClick={() => setIsAdding(false)}
                            className="btn-secondary text-sm"
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSubmit}
                            className="btn-primary text-sm flex items-center gap-1.5"
                            disabled={isSubmitting || !newNote.trim()}
                        >
                            <Send size={14} />
                            {isSubmitting ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </div>
            )}

            {/* Notes List */}
            <div className="space-y-3">
                {notes.length === 0 && !isAdding && (
                    <p className="text-sm text-center py-8 text-text-muted">
                        No notes yet. Add one to track your progress!
                    </p>
                )}
                {notes.map((note) => (
                    <div
                        key={note.id}
                        className="p-4 rounded-lg bg-bg-elevated border border-border-subtle"
                    >
                        <p className="text-sm whitespace-pre-wrap text-text-secondary">
                            {note.content}
                        </p>
                        <p className="text-xs mt-2 text-text-muted">
                            {formatRelativeTime(note.created_at)}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
}
