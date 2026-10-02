'use client';

import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import { Barcode, Check } from 'lucide-react';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { barcodeInputError } from '@/lib/log-viewer/barcode/history';
import { cn } from '@/lib/utils';
import { useBarcodeSession } from './BarcodeSessionProvider';

export function BarcodeGenerator() {
    const session = useBarcodeSession();
    if (!session?.userId) return null;
    return <BarcodeWorkspace key={session.userId} />;
}

function BarcodeWorkspace() {
    const session = useBarcodeSession()!;
    const [input, setInput] = useState('');
    const [generated, setGenerated] = useState('');
    const [error, setError] = useState<string>();
    const [overflowing, setOverflowing] = useState(false);
    const svgRef = useRef<SVGSVGElement>(null);
    const previewRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const cancelPending = () => {
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        timerRef.current = null;
    };

    useEffect(() => () => {
        if (timerRef.current !== null) clearTimeout(timerRef.current);
    }, []);

    useEffect(() => {
        const container = previewRef.current;
        if (!container || !generated) {
            setOverflowing(false);
            return;
        }
        const measure = () => setOverflowing(container.scrollWidth > container.clientWidth + 1);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(container);
        return () => observer.disconnect();
    }, [generated]);

    function generate(value: string) {
        const validation = barcodeInputError(value);
        if (!value || validation || !svgRef.current) {
            setError(validation);
            return;
        }
        try {
            JsBarcode(svgRef.current, value, {
                format: 'CODE128',
                width: 2,
                height: 120,
                margin: 24,
                background: '#ffffff',
                lineColor: '#000000',
                font: 'monospace',
                fontSize: 20,
                textMargin: 12,
                displayValue: true,
            });
            setGenerated(value);
            setError(undefined);
            session.remember(value);
        } catch {
            svgRef.current.replaceChildren();
            setGenerated('');
            setError('Unable to generate this barcode. Edit the number to try again.');
        }
    }

    function updateInput(value: string, immediate = false) {
        cancelPending();
        // Clear the actual SVG as well as its visible state before any new work.
        svgRef.current?.replaceChildren();
        setGenerated('');
        setOverflowing(false);
        setInput(value);
        const canonical = value.trim();
        const validation = barcodeInputError(canonical);
        setError(validation);
        if (!canonical || validation) return;
        if (immediate) generate(canonical);
        else timerRef.current = setTimeout(() => {
            timerRef.current = null;
            generate(canonical);
        }, 400);
    }

    return (
        <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
            <Card className="min-w-0 space-y-6 p-5 md:p-6">
                <Input
                    label="Number"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    spellCheck={false}
                    value={input}
                    onValueChange={updateInput}
                    onPaste={(event) => {
                        // Read the original paste so a multiline value is not silently joined by the browser.
                        event.preventDefault();
                        const target = event.currentTarget;
                        const start = target.selectionStart ?? input.length;
                        const end = target.selectionEnd ?? start;
                        updateInput(input.slice(0, start) + event.clipboardData.getData('text') + input.slice(end));
                    }}
                    errorMessage={error}
                    className="font-mono text-base"
                />
                <section aria-label="Barcode preview" className="min-w-0 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-sm font-semibold">Barcode</h2>
                        <span className="text-xs text-text-muted">Code 128</span>
                    </div>
                    <div ref={previewRef} tabIndex={generated ? 0 : undefined} aria-label="Barcode image area"
                        className="min-w-0 overflow-x-auto rounded-md border border-border-default bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-strong">
                        <div className="flex min-h-[244px] min-w-full w-max items-center justify-center">
                            <svg ref={svgRef} role="img" aria-hidden={!generated} aria-label={generated ? `Barcode for ${generated}` : undefined}
                                className={cn('max-w-none shrink-0', !generated && 'hidden')} />
                            {!generated && <div className="flex flex-col items-center gap-3 px-4 py-8 text-center text-sm text-text-secondary">
                                <Barcode size={32} aria-hidden="true" />
                                <p role="status">{error ? 'Check the number above.' : input.trim() ? 'Generating barcode...' : 'Enter a number to generate its barcode.'}</p>
                            </div>}
                        </div>
                    </div>
                    {overflowing && <p role="status" className="text-sm text-text-secondary">Use a wider screen to show the full barcode before scanning. Scroll to inspect it.</p>}
                </section>
            </Card>
            <Card className="min-w-0 self-start p-5">
                <aside aria-label="Recent numbers" className="space-y-4">
                    <div className="flex items-center justify-between gap-2">
                        <h2 className="text-sm font-semibold">Recent numbers</h2>
                        <span className="text-xs text-text-muted">{session.values.length}/7</span>
                    </div>
                    {session.values.length ? <ol className="space-y-2">
                        {session.values.map((value) => <li key={value}>
                            <button type="button" onClick={() => updateInput(value, true)} aria-pressed={generated === value}
                                className={cn('flex min-h-11 w-full items-start gap-2 rounded-sm border px-3 py-2 text-left text-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-strong',
                                    generated === value ? 'border-border-strong bg-bg-selected' : 'border-border-default hover:bg-bg-hover')}>
                                <span className="min-w-0 flex-1 break-all font-mono">{value}</span>
                                {generated === value && <Check size={16} className="mt-0.5 shrink-0" aria-hidden="true" />}
                            </button>
                        </li>)}
                    </ol> : <p className="text-sm text-text-muted">No recent numbers.</p>}
                    {!session.storageAvailable && <p role="status" className="text-xs text-text-secondary">Temporary storage is unavailable. History will be lost when this page reloads.</p>}
                </aside>
            </Card>
        </div>
    );
}
