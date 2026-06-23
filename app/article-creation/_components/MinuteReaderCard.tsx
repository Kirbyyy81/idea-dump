'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/atoms/Card';
import { Button } from '@/components/atoms/Button';
import { Textarea } from '@/components/atoms/Textarea';
import { Copy, Eraser } from 'lucide-react';
import { getReadingTime } from '@/lib/articleCreation/textTransform';

export function MinuteReaderCard() {
    const [text, setText] = useState('');
    const [copied, setCopied] = useState(false);

    const readingTime = getReadingTime(text);

    useEffect(() => {
        if (!copied) return;

        const timeoutId = window.setTimeout(() => setCopied(false), 1800);
        return () => window.clearTimeout(timeoutId);
    }, [copied]);

    const handleCopy = async () => {
        if (!readingTime.label) return;
        await navigator.clipboard.writeText(readingTime.label);
        setCopied(true);
    };

    const handleClear = () => {
        setText('');
        setCopied(false);
    };

    return (
        <Card className="p-6 space-y-4">
            <div className="space-y-1">
                <h2 className="text-xl font-semibold font-body text-text-primary">
                    Minute Reader
                </h2>
                <p className="text-sm text-text-muted">
                    Paste article body text to calculate word count and reading time instantly.
                </p>
            </div>

            <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste article body content here..."
                className="min-h-[180px]"
            />

            <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-border-subtle bg-bg-base p-4">
                    <p className="text-xs uppercase tracking-wide text-text-muted">Word count</p>
                    <p className="mt-2 text-2xl font-heading text-text-primary">
                        {readingTime.wordCount}
                    </p>
                </div>
                <div className="rounded-lg border border-border-subtle bg-bg-base p-4">
                    <p className="text-xs uppercase tracking-wide text-text-muted">
                        Reading time
                    </p>
                    <p className="mt-2 text-2xl font-heading text-text-primary">
                        {readingTime.label || '—'}
                    </p>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <Button
                    variant={copied ? 'secondary' : 'primary'}
                    onClick={handleCopy}
                    disabled={!readingTime.label}
                    icon={<Copy size={16} />}
                >
                    {copied ? 'Copied' : 'Copy reading time'}
                </Button>
                <Button
                    variant="ghost"
                    onClick={handleClear}
                    disabled={!text}
                    icon={<Eraser size={16} />}
                >
                    Clear
                </Button>
            </div>
        </Card>
    );
}
