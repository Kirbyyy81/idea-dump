'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/atoms/Card';
import { Button } from '@/components/atoms/Button';
import { Textarea } from '@/components/atoms/Textarea';
import { Copy, Eraser } from 'lucide-react';
import { buildTocAnchors } from '@/lib/articleCreation/textTransform';

export function TocAnchorGeneratorCard() {
    const [input, setInput] = useState('');
    const [copied, setCopied] = useState(false);

    const anchors = buildTocAnchors(input);
    const output = anchors.join('\n');

    useEffect(() => {
        if (!copied) return;

        const timeoutId = window.setTimeout(() => setCopied(false), 1800);
        return () => window.clearTimeout(timeoutId);
    }, [copied]);

    const handleCopy = async () => {
        if (!output) return;
        await navigator.clipboard.writeText(output);
        setCopied(true);
    };

    const handleClear = () => {
        setInput('');
        setCopied(false);
    };

    return (
        <Card className="p-6 space-y-4">
            <div className="space-y-1">
                <h2 className="text-xl font-semibold font-body text-text-primary">
                    Table of Contents Anchor Generator
                </h2>
                <p className="text-sm text-text-muted">
                    Paste headings line by line to generate sequential numbered anchor IDs.
                </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-text-secondary">
                        Headings input
                    </label>
                    <Textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={'Introduction to Nutrition\nWhy Students Skip Breakfast\nHealthy Eating Tips'}
                        className="min-h-[220px]"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-text-secondary">
                        Generated anchors
                    </label>
                    <Textarea
                        value={output}
                        readOnly
                        placeholder="Generated anchors will appear here..."
                        className="min-h-[220px] font-mono text-sm"
                    />
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <Button
                    variant={copied ? 'secondary' : 'primary'}
                    onClick={handleCopy}
                    disabled={!output}
                    icon={<Copy size={16} />}
                >
                    {copied ? 'Copied' : 'Copy anchors'}
                </Button>
                <Button
                    variant="ghost"
                    onClick={handleClear}
                    disabled={!input}
                    icon={<Eraser size={16} />}
                >
                    Clear
                </Button>
            </div>
        </Card>
    );
}
