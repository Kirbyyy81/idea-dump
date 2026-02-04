'use client';

import { useState } from 'react';
import { Note } from '@/lib/types';
import { formatRelativeTime, cn } from '@/lib/utils';
import { Plus, Send, StickyNote } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { Textarea } from '@/components/atoms/Textarea';
import { Card } from '@/components/atoms/Card';

interface NotesPanelProps {
    notes: Note[];
    onAddNote: (content: string) => Promise<void>;
}

export function NotesPanel({ notes, onAddNote }: NotesPanelProps) {
    const [newNote, setNewNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newNote.trim()) return;

        setIsSubmitting(true);
        try {
            await onAddNote(newNote);
            setNewNote('');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-heading font-semibold flex items-center gap-2 text-text-primary">
                    <StickyNote className="text-accent-blue" />
                    Project Notes
                </h3>
                <span className="text-sm text-text-muted">
                    {notes.length} note{notes.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Add Note Form */}
            <Card className="p-4 bg-bg-base border-dashed">
                <form onSubmit={handleSubmit} className="space-y-3">
                    <Textarea
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Add a quick note..."
                        className="min-h-[80px] text-sm bg-white"
                        error={false} // No validation state needed for simple note
                        disabled={isSubmitting}
                    />
                    <div className="flex justify-end">
                        <Button
                            type="submit"
                            variant="secondary"
                            disabled={!newNote.trim()}
                            isLoading={isSubmitting}
                            icon={<Send size={14} />}
                            className="text-xs py-1.5 h-8"
                        >
                            Add Note
                        </Button>
                    </div>
                </form>
            </Card>

            {/* Notes List */}
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                {notes.length === 0 ? (
                    <div className="text-center py-8 text-text-muted text-sm">
                        No notes yet. Start capturing your ideas!
                    </div>
                ) : (
                    notes.map((note) => (
                        <Card key={note.id} className="p-4 bg-white/50 hover:bg-white text-sm">
                            <p className="whitespace-pre-wrap text-text-secondary mb-2">
                                {note.content}
                            </p>
                            <p className="text-xs text-text-muted">
                                {formatRelativeTime(note.created_at)}
                            </p>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
}
