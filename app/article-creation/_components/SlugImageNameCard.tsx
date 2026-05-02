'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/atoms/Card';
import { Button } from '@/components/atoms/Button';
import { Input } from '@/components/atoms/Input';
import { Copy, Eraser } from 'lucide-react';
import {
    DEFAULT_IMAGE_SUFFIX,
    IMAGE_NAME_PREFIX,
    IMAGE_SUFFIX_OPTIONS,
} from '@/lib/articleCreation/constants';
import { buildImageName, toSlug } from '@/lib/articleCreation/textTransform';

export function SlugImageNameCard() {
    const [title, setTitle] = useState('');
    const [suffix, setSuffix] = useState<string>(DEFAULT_IMAGE_SUFFIX);
    const [copiedTarget, setCopiedTarget] = useState<'slug' | 'image' | null>(null);

    const slug = toSlug(title);
    const imageName = buildImageName(title, suffix);

    useEffect(() => {
        if (!copiedTarget) return;

        const timeoutId = window.setTimeout(() => setCopiedTarget(null), 1800);
        return () => window.clearTimeout(timeoutId);
    }, [copiedTarget]);

    const handleCopy = async (value: string, target: 'slug' | 'image') => {
        if (!value) return;
        await navigator.clipboard.writeText(value);
        setCopiedTarget(target);
    };

    const handleClear = () => {
        setTitle('');
        setSuffix(DEFAULT_IMAGE_SUFFIX);
        setCopiedTarget(null);
    };

    return (
        <Card className="p-6 space-y-4">
            <div className="space-y-1">
                <h2 className="text-xl font-semibold font-body text-text-primary">
                    Slug and Meta Image Name Generator
                </h2>
                <p className="text-sm text-text-muted">
                    Convert article titles into a reusable slug and full AEM-ready image filename.
                </p>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.6fr,1fr]">
                <div className="space-y-2">
                    <label className="text-sm font-medium text-text-secondary">
                        Main title
                    </label>
                    <Input
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Why Just Cook at Home Isn't Enough for Malaysia's Health"
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-medium text-text-secondary">
                        Suffix
                    </label>
                    <select
                        value={suffix}
                        onChange={(e) => setSuffix(e.target.value)}
                        className="input w-full"
                    >
                        {IMAGE_SUFFIX_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="rounded-lg border border-border-subtle bg-bg-base p-4">
                <p className="text-xs uppercase tracking-wide text-text-muted">Fixed prefix</p>
                <p className="mt-2 font-mono text-sm text-text-primary">{IMAGE_NAME_PREFIX}</p>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-border-subtle bg-bg-base p-4 space-y-3">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-text-muted">Slug</p>
                        <p className="mt-2 break-words font-mono text-sm text-text-primary">
                            {slug || '—'}
                        </p>
                    </div>
                    <Button
                        variant={copiedTarget === 'slug' ? 'secondary' : 'primary'}
                        onClick={() => handleCopy(slug, 'slug')}
                        disabled={!slug}
                        icon={<Copy size={16} />}
                    >
                        {copiedTarget === 'slug' ? 'Copied' : 'Copy slug'}
                    </Button>
                </div>

                <div className="rounded-lg border border-border-subtle bg-bg-base p-4 space-y-3">
                    <div>
                        <p className="text-xs uppercase tracking-wide text-text-muted">
                            Full image name
                        </p>
                        <p className="mt-2 break-words font-mono text-sm text-text-primary">
                            {imageName || '—'}
                        </p>
                    </div>
                    <Button
                        variant={copiedTarget === 'image' ? 'secondary' : 'primary'}
                        onClick={() => handleCopy(imageName, 'image')}
                        disabled={!imageName}
                        icon={<Copy size={16} />}
                    >
                        {copiedTarget === 'image' ? 'Copied' : 'Copy image name'}
                    </Button>
                </div>
            </div>

            <div className="flex flex-wrap gap-2">
                <Button
                    variant="ghost"
                    onClick={handleClear}
                    disabled={!title && suffix === DEFAULT_IMAGE_SUFFIX}
                    icon={<Eraser size={16} />}
                >
                    Clear
                </Button>
            </div>
        </Card>
    );
}
