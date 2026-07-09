'use client';

import { ChangeEvent, InputHTMLAttributes, useEffect, useId, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/atoms/Button';
import { cn } from '@/lib/utils';

interface FileUploadProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'onChange'> {
    label: string;
    hint?: string;
    value: File | null;
    onChange: (file: File | null) => void;
    error?: boolean;
    previewUrl?: string | null;
}

export function FileUpload({
    label,
    hint,
    value,
    onChange,
    error,
    previewUrl,
    accept,
    disabled,
    className,
    id,
    ...props
}: FileUploadProps) {
    const generatedId = useId();
    const inputId = id ?? generatedId;
    const inputRef = useRef<HTMLInputElement>(null);
    const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!value || !value.type.startsWith('image/')) {
            setLocalPreviewUrl(null);
            return;
        }

        const nextPreviewUrl = URL.createObjectURL(value);
        setLocalPreviewUrl(nextPreviewUrl);
        return () => URL.revokeObjectURL(nextPreviewUrl);
    }, [value]);

    const displayPreviewUrl = localPreviewUrl || previewUrl;

    const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
        onChange(event.target.files?.[0] ?? null);
    };

    const clearFile = () => {
        onChange(null);
        if (inputRef.current) inputRef.current.value = '';
    };

    return (
        <div className={cn('space-y-2', className)}>
            <input
                ref={inputRef}
                id={inputId}
                type="file"
                accept={accept}
                disabled={disabled}
                onChange={handleChange}
                className="sr-only"
                {...props}
            />
            <div
                className={cn(
                    'rounded-xl border bg-bg-elevated p-3 transition-colors',
                    error ? 'border-error' : 'border-border-default hover:border-border-strong',
                    disabled && 'opacity-60'
                )}
            >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                    <label
                        htmlFor={inputId}
                        className={cn(
                            'group flex min-h-24 flex-1 cursor-pointer items-center gap-3 rounded-lg border border-dashed border-border-default bg-bg-hover/50 p-3 transition-colors hover:border-border-strong hover:bg-bg-hover',
                            disabled && 'pointer-events-none cursor-not-allowed'
                        )}
                    >
                        <span className="grid size-11 shrink-0 place-items-center rounded-full bg-bg-elevated text-text-secondary shadow-subtle">
                            <ImagePlus size={20} />
                        </span>
                        <span className="min-w-0">
                            <span className="block text-sm font-semibold text-text-primary">{label}</span>
                            <span className="mt-1 block truncate text-sm text-text-muted">
                                {value?.name || hint || 'Choose an image from your device'}
                            </span>
                        </span>
                    </label>

                    {displayPreviewUrl && (
                        <div className="h-24 w-full overflow-hidden rounded-lg border border-border-default bg-bg-hover sm:w-32">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={displayPreviewUrl} alt="" className="h-full w-full object-cover" />
                        </div>
                    )}
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-text-muted">{accept ? `Accepted: ${accept.replaceAll(',', ', ')}` : hint}</p>
                    <div className="flex gap-2">
                        <Button type="button" variant="ghost" onClick={() => inputRef.current?.click()} disabled={disabled}>
                            {value ? 'Change file' : 'Choose file'}
                        </Button>
                        {value && (
                            <Button type="button" variant="secondary" icon={<X size={14} />} onClick={clearFile} disabled={disabled}>
                                Clear
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
