'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/atoms/Button';
import {
    CheckDoodleIcon,
    DeleteDoodleIcon,
    OcrDoodleIcon,
    ScanDoodleIcon,
    WarningDoodleIcon,
} from '@/components/atoms/DoodleIcons';
import { FinanceApiError } from '@/lib/finance/clientApi';
import {
    commitFinanceShareBatch,
    getActiveFinanceShareBatch,
    prepareFinanceShareBatch,
    uploadPreparedFinanceShareFiles,
} from '@/lib/finance/shareBatchClient';
import {
    FinanceSharedFileValidation,
    formatFinanceShareFileSize,
    MAX_FINANCE_SHARE_FILES,
    validateFinanceSharedFile,
} from '@/lib/finance/shareFiles';
import { FinanceShareBatch } from '@/lib/types';
import {
    IncomingFinanceShareFile,
    useFinanceShareTarget,
} from '@/app/finance/_components/FinanceShareTargetProvider';
import { useAlert } from '@/lib/contexts/AlertContext';

type HandoffPhase = 'idle' | 'preparing' | 'uploading' | 'committing' | 'ready';

interface ValidatedIncomingFile extends IncomingFinanceShareFile {
    validation: FinanceSharedFileValidation | null;
}

const statusLabels: Record<string, string> = {
    QUEUED: 'Queued',
    PROCESSING: 'Processing',
    AUTO_CONFIRMED: 'Added automatically',
    REVIEW_REQUIRED: 'Review needed',
    DUPLICATE: 'Duplicate',
    FAILED: 'Failed',
};

function countValue(batch: FinanceShareBatch, key: keyof FinanceShareBatch) {
    const value = batch[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function ActiveBatchPanel({ batch }: { batch: FinanceShareBatch }) {
    const items = Array.isArray(batch.items) ? batch.items : [];
    const stats = [
        ['Queued', countValue(batch, 'queued_files')],
        ['Processing', countValue(batch, 'processing_files')],
        ['Added', countValue(batch, 'completed_files')],
        ['Review', countValue(batch, 'review_files')],
        ['Duplicates', countValue(batch, 'duplicate_files')],
        ['Failed', countValue(batch, 'failed_files')],
    ];

    return (
        <section className="mt-6 rounded-card border border-border-default bg-bg-elevated p-5" aria-labelledby="active-share-batch-title">
            <div className="flex items-start gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-bg-hover text-text-secondary">
                    <OcrDoodleIcon size={19} />
                </span>
                <div className="min-w-0">
                    <h2 id="active-share-batch-title" className="text-lg font-bold">Shared images in progress</h2>
                </div>
            </div>

            <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {stats.map(([label, value]) => (
                    <div key={label} className="border border-border-default bg-bg-subtle px-3 py-2">
                        <dt className="text-xs text-text-muted">{label}</dt>
                        <dd className="mt-1 text-sm font-bold">{value}</dd>
                    </div>
                ))}
            </dl>

            {batch.status === 'CLEANING_UP' && (
                <p className="mt-4 text-sm font-semibold text-text-secondary">Removing temporary images…</p>
            )}

            {items.length > 0 && (
                <ul className="mt-4 divide-y divide-border-default border border-border-default">
                    {items.map((item, index) => (
                        <li key={item.id} className="flex items-center justify-between gap-4 px-3 py-3 text-sm">
                            <span className="min-w-0 truncate">
                                {item.original_filename || `Image ${index + 1}`}
                            </span>
                            <span className="shrink-0 font-semibold text-text-secondary">
                                {statusLabels[item.status] || item.status}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

export function FinanceShareExperience() {
    const { files, clearFiles, removeFile } = useFinanceShareTarget();
    const { showSuccess } = useAlert();
    const [validations, setValidations] = useState<Record<string, FinanceSharedFileValidation>>({});
    const [phase, setPhase] = useState<HandoffPhase>('idle');
    const [uploadedCount, setUploadedCount] = useState(0);
    const [submissionError, setSubmissionError] = useState<string | null>(null);
    const [readyBatchId, setReadyBatchId] = useState<string | null>(null);
    const [activeBatch, setActiveBatch] = useState<FinanceShareBatch | null>(null);
    const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const prepareAttemptRef = useRef<{ fingerprint: string; requestId: string } | null>(null);

    const loadActiveBatch = useCallback(async (signal?: AbortSignal) => {
        const payload = await getActiveFinanceShareBatch(signal);
        setActiveBatch(payload.data);
        return payload.data;
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        void loadActiveBatch(controller.signal).catch((error) => {
            if (error instanceof DOMException && error.name === 'AbortError') return;
            // Status is supplemental and must not block the ordinary add form.
        });
        return () => controller.abort();
    }, [loadActiveBatch]);

    useEffect(() => {
        if (!activeBatch) return;
        let cancelled = false;
        const poll = async () => {
            try {
                await loadActiveBatch();
            } finally {
                if (!cancelled) pollingRef.current = setTimeout(poll, 3_000);
            }
        };
        pollingRef.current = setTimeout(poll, 3_000);
        return () => {
            cancelled = true;
            if (pollingRef.current) clearTimeout(pollingRef.current);
        };
    }, [activeBatch, loadActiveBatch]);

    useEffect(() => {
        let cancelled = false;
        setValidations({});
        void Promise.all(files.map(async ({ id, file }) => ({
            id,
            validation: await validateFinanceSharedFile(file),
        }))).then((results) => {
            if (!cancelled) {
                setValidations(Object.fromEntries(
                    results.map(({ id, validation }) => [id, validation])
                ));
            }
        });
        return () => {
            cancelled = true;
        };
    }, [files]);

    const validatedFiles = useMemo<ValidatedIncomingFile[]>(
        () => files.map((entry, index) => {
            const validation = validations[entry.id] ?? null;
            if (validation?.isValid && index >= MAX_FINANCE_SHARE_FILES) {
                return {
                    ...entry,
                    validation: {
                        ...validation,
                        isValid: false,
                        message: 'Remove files until no more than 10 images remain.',
                    },
                };
            }
            return { ...entry, validation };
        }),
        [files, validations]
    );
    const isValidationPending = validatedFiles.some((entry) => !entry.validation);
    const invalidCount = validatedFiles.filter((entry) => entry.validation && !entry.validation.isValid).length;
    const validFiles = validatedFiles.filter((entry) => entry.validation?.isValid);
    const isSubmitting = phase === 'preparing' || phase === 'uploading' || phase === 'committing';
    const fileFingerprint = useMemo(
        () => JSON.stringify(files.map(({ id, file }) => ({
            id,
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: file.lastModified,
        }))),
        [files]
    );

    useEffect(() => {
        if (prepareAttemptRef.current?.fingerprint !== fileFingerprint) {
            prepareAttemptRef.current = null;
        }
        if (files.length) setReadyBatchId(null);
    }, [fileFingerprint, files.length]);

    const confirmShare = async () => {
        if (!validFiles.length || invalidCount || isValidationPending) return;
        setSubmissionError(null);
        setReadyBatchId(null);
        setUploadedCount(0);
        setPhase('preparing');

        try {
            const uploadFiles = validFiles.map(({ id, file }) => ({ clientId: id, file }));
            const prepareAttempt = prepareAttemptRef.current?.fingerprint === fileFingerprint
                ? prepareAttemptRef.current
                : {
                    fingerprint: fileFingerprint,
                    requestId: window.crypto.randomUUID(),
                };
            prepareAttemptRef.current = prepareAttempt;
            const prepared = await prepareFinanceShareBatch(
                uploadFiles,
                prepareAttempt.requestId
            );
            setPhase('uploading');
            await uploadPreparedFinanceShareFiles(
                uploadFiles,
                prepared.data.uploads,
                (completed) => setUploadedCount(completed)
            );
            setPhase('committing');
            const committed = await commitFinanceShareBatch(
                prepared.data.batch_id,
                prepared.data.reservation_id
            );
            if (!committed.data.safe_to_close) {
                throw new Error('Finance did not confirm durable background handoff. Keep this page open and try again.');
            }
            setReadyBatchId(committed.data.batch_id);
            setPhase('ready');
            prepareAttemptRef.current = null;
            clearFiles();
            showSuccess('You may leave the app.', 'Images queued');
            await loadActiveBatch().catch(() => null);
        } catch (error) {
            setPhase('idle');
            setSubmissionError(error instanceof Error
                ? error.message
                : 'The shared images could not be handed off. Nothing was confirmed as queued.');
            if (error instanceof FinanceApiError && error.status === 409) {
                setSubmissionError(error.message);
            }
        }
    };

    return (
        <>
            {activeBatch && <ActiveBatchPanel batch={activeBatch} />}

            {readyBatchId && (
                <section className="mt-6 rounded-card border border-success bg-bg-elevated p-5" role="status">
                    <div className="flex items-start gap-3">
                        <CheckDoodleIcon className="mt-0.5 shrink-0 text-success" size={21} />
                        <h2 className="text-lg font-bold">Ready — you may close the app</h2>
                    </div>
                </section>
            )}

            {files.length > 0 && (
                <section className="mt-6 rounded-card border border-border-strong bg-bg-elevated p-5" aria-labelledby="shared-images-title">
                    <div className="flex items-start gap-3">
                        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-bg-hover text-text-secondary">
                            <ScanDoodleIcon size={19} />
                        </span>
                        <div>
                            <h2 id="shared-images-title" className="text-lg font-bold">Review shared images</h2>
                        </div>
                    </div>

                    <p className="mt-4 text-sm font-semibold">
                        {validFiles.length} valid image{validFiles.length === 1 ? '' : 's'} remaining
                    </p>

                    <ul className="mt-3 space-y-2">
                        {validatedFiles.map(({ id, file, validation }, index) => (
                            <li key={id} className="border border-border-default bg-bg-subtle p-3">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate text-sm font-semibold">{file.name || `Image ${index + 1}`}</p>
                                        <p className="mt-1 text-xs text-text-muted">
                                            {formatFinanceShareFileSize(file.size)}
                                            {validation?.width && validation.height
                                                ? ` · ${validation.width} × ${validation.height}`
                                                : ''}
                                        </p>
                                        {!validation && <p className="mt-2 text-xs text-text-muted">Checking image…</p>}
                                        {validation && !validation.isValid && (
                                            <p className="mt-2 flex items-start gap-1.5 text-xs font-semibold text-error" role="alert">
                                                <WarningDoodleIcon className="mt-0.5 shrink-0" size={13} />
                                                {validation.message}
                                            </p>
                                        )}
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        className="shrink-0"
                                        icon={<DeleteDoodleIcon size={15} />}
                                        onClick={() => removeFile(id)}
                                        disabled={isSubmitting}
                                        aria-label={`Remove ${file.name || `image ${index + 1}`}`}
                                    >
                                        Remove
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>

                    {submissionError && (
                        <p className="mt-4 border border-error bg-bg-subtle p-3 text-sm font-semibold text-error" role="alert">
                            {submissionError}
                        </p>
                    )}
                    {phase === 'preparing' && <p className="mt-4 text-sm text-text-secondary">Preparing upload…</p>}
                    {phase === 'uploading' && (
                        <p className="mt-4 text-sm text-text-secondary">
                            Uploading images… {uploadedCount} of {validFiles.length}
                        </p>
                    )}
                    {phase === 'committing' && <p className="mt-4 text-sm text-text-secondary">Creating background batch…</p>}

                    <Button
                        type="button"
                        className="mt-5 w-full"
                        isLoading={isSubmitting}
                        disabled={isValidationPending || invalidCount > 0 || validFiles.length === 0}
                        onClick={confirmShare}
                    >
                        Process {validFiles.length || ''} image{validFiles.length === 1 ? '' : 's'}
                    </Button>
                </section>
            )}
        </>
    );
}
