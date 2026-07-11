'use client';

import Image from 'next/image';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock3, ScanLine, UploadCloud, XCircle } from 'lucide-react';
import { AppShell } from '@/components/organisms/AppShell';
import { Button } from '@/components/atoms/Button';
import { Card } from '@/components/atoms/Card';
import { Input } from '@/components/atoms/Input';
import { FinanceNav } from '@/components/finance/FinanceNav';
import { FinanceIntakeItem } from '@/lib/types';
import { useAlert } from '@/lib/contexts/AlertContext';

type IntakeHistory = Pick<FinanceIntakeItem, 'id' | 'source' | 'status' | 'received_at' | 'processed_at' | 'error_message'>;

export default function FinanceUploadPage() {
    const { showError } = useAlert();
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [history, setHistory] = useState<IntakeHistory[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [result, setResult] = useState<{ auto_confirmed: boolean; candidate_id: string } | null>(null);

    const loadHistory = useCallback(async () => {
        try {
            const response = await fetch('/api/finance/upload');
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Could not load capture history');
            setHistory(payload.data || []);
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not load capture history');
        }
    }, [showError]);

    useEffect(() => { void loadHistory(); }, [loadHistory]);
    useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

    const chooseFile = (nextFile: File | null) => {
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setFile(nextFile);
        setPreviewUrl(nextFile ? URL.createObjectURL(nextFile) : null);
        setResult(null);
    };

    const submitScreenshot = async (event: FormEvent) => {
        event.preventDefault();
        if (!file) return;
        setIsProcessing(true);
        setResult(null);
        try {
            const formData = new FormData();
            formData.set('screenshot', file);
            const response = await fetch('/api/finance/upload', { method: 'POST', body: formData });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error || 'Could not process screenshot');
            setResult({ auto_confirmed: payload.data.auto_confirmed, candidate_id: payload.data.candidate.id });
            await loadHistory();
        } catch (error) {
            showError(error instanceof Error ? error.message : 'Could not process screenshot');
        } finally {
            setIsProcessing(false);
        }
    };

    const statusIcon = (status: FinanceIntakeItem['status']) => {
        if (status === 'completed') return <CheckCircle2 size={16} className="text-success" />;
        if (status === 'failed' || status === 'rejected') return <XCircle size={16} className="text-error" />;
        return <Clock3 size={16} className="text-accent-apricot" />;
    };

    return (
        <AppShell contentClassName="p-5 md:p-8">
            <div className="mx-auto max-w-7xl">
                <header className="pb-5"><h1>Capture transaction</h1><p className="mt-1 text-sm text-text-muted">Upload a banking or payment screenshot for OCR processing.</p></header>
                <FinanceNav currentPath="/finance/upload" />

                <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                    <form onSubmit={submitScreenshot}>
                        <Card className="p-5">
                            <div className="flex items-center gap-2"><ScanLine size={18} className="text-accent-blue" /><h2 className="text-base font-bold">Screenshot</h2></div>
                            <label className="mt-5 block space-y-2">
                                <span className="text-sm text-text-secondary">PNG, JPEG, or WebP up to 10 MB</span>
                                <Input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => chooseFile(event.target.files?.[0] || null)} />
                            </label>

                            <div className="relative mt-5 aspect-[4/3] overflow-hidden border border-dashed border-border-strong bg-bg-subtle">
                                {previewUrl ? <Image src={previewUrl} alt="Selected transaction screenshot" fill unoptimized className="object-contain" /> : <div className="absolute inset-0 grid place-items-center text-center text-text-muted"><div><UploadCloud size={32} className="mx-auto mb-3" /><p className="text-sm">Choose a screenshot</p></div></div>}
                            </div>

                            <Button type="submit" className="mt-5 w-full" isLoading={isProcessing} disabled={!file}>Process screenshot</Button>

                            {result && (
                                <div className="mt-5 border border-success bg-success-bg px-4 py-3 text-sm text-success">
                                    {result.auto_confirmed ? 'Transaction confirmed automatically.' : 'OCR complete. The transaction needs review.'}
                                    {!result.auto_confirmed && <Link href="/finance/review" className="ml-2 font-bold underline">Open review queue</Link>}
                                </div>
                            )}
                        </Card>
                    </form>

                    <section className="border border-border-default bg-bg-surface">
                        <div className="border-b border-border-default px-5 py-4"><h2 className="text-base font-bold">Recent captures</h2></div>
                        <div className="divide-y divide-border-default">
                            {history.map((item) => <div key={item.id} className="flex items-start gap-3 px-5 py-4">{statusIcon(item.status)}<div className="min-w-0"><p className="font-semibold capitalize">{item.status.replace('_', ' ')}</p><p className="text-sm text-text-muted">{new Date(item.received_at).toLocaleString()}</p>{item.error_message && <p className="mt-1 text-sm text-error">{item.error_message}</p>}</div></div>)}
                            {!history.length && <p className="px-5 py-10 text-center text-sm text-text-muted">No screenshots processed yet.</p>}
                        </div>
                    </section>
                </div>
            </div>
        </AppShell>
    );
}
