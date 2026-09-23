import { File as NodeFile } from 'node:buffer';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FinanceShareExperience } from '@/app/finance/add/_components/FinanceShareExperience';
import type { FinanceShareBatch } from '@/lib/types';

const state = vi.hoisted(() => ({
    files: [] as Array<{ id: string; file: File }>,
    clearFiles: vi.fn(),
    prepare: vi.fn<(files: Array<{ clientId: string; file: File }>, requestId: string) => Promise<unknown>>(),
    upload: vi.fn(),
    active: vi.fn(),
}));
vi.mock('@/app/finance/_components/FinanceShareTargetProvider', () => ({
    useFinanceShareTarget: () => ({ files: state.files, clearFiles: state.clearFiles, removeFile: vi.fn() }),
}));
vi.mock('@/lib/contexts/AlertContext', () => ({ useAlert: () => ({ showSuccess: vi.fn() }) }));
vi.mock('@/lib/finance/share/client', () => ({
    getActiveFinanceShareBatch: state.active,
    prepareFinanceShareBatch: state.prepare,
    uploadPreparedFinanceShareFiles: state.upload,
    commitFinanceShareBatch: async () => ({ data: { batch_id: 'batch', safe_to_close: true } }),
}));
beforeEach(() => {
    vi.clearAllMocks();
    state.files = [];
    state.active.mockReset().mockResolvedValue({ data: null });
    state.clearFiles.mockImplementation(() => { state.files = []; });
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

const batch: FinanceShareBatch = {
    id: 'batch', status: 'PROCESSING', total_files: 4, queued_files: 3, processing_files: 1,
    completed_files: 0, review_files: 0, duplicate_files: 0, failed_files: 0,
    items: [{ id: 'image-1', original_filename: 'receipt.png', status: 'PROCESSING' }],
};

it.each(['QUEUED', 'PROCESSING', 'CLEANING_UP'] as const)('hides ordinary entry during %s and replaces count boxes with progress', async (status) => {
    state.active.mockResolvedValue({ data: { ...batch, status } });
    render(<FinanceShareExperience><button>Normal entry form</button></FinanceShareExperience>);
    expect(screen.queryByText('Normal entry form')).toBeNull();
    await screen.findByRole('heading', { name: status === 'CLEANING_UP' ? 'Finishing up' : 'Processing images' });
    expect(screen.queryByText('Normal entry form')).toBeNull();
    expect(screen.queryByText('Ready - you may close the app')).toBeNull();
    expect(screen.queryByText('Added', { exact: true })).toBeNull();
    expect(screen.queryByText('Failed', { exact: true })).toBeNull();
    expect(screen.getByText('1 processing · 3 queued')).toBeTruthy();
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('0');
});

it('counts every final outcome as finished without claiming all images were added', async () => {
    state.active.mockResolvedValue({ data: { ...batch, total_files: 6, queued_files: 1,
        completed_files: 1, review_files: 1, duplicate_files: 1, failed_files: 1 } });
    render(<FinanceShareExperience />);
    await screen.findByText('4 of 6 finished');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('4');
    for (const label of ['Added', 'Review', 'Duplicates', 'Failed']) expect(screen.getByText(label)).toBeTruthy();
});

it('keeps a known batch and hides entry on polling failure, then recovers without a false completion message', async () => {
    vi.useFakeTimers();
    state.active.mockResolvedValueOnce({ data: batch }).mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ data: null });
    render(<FinanceShareExperience><button>Normal entry form</button></FinanceShareExperience>);
    await act(async () => {});
    await act(async () => { await vi.advanceTimersByTimeAsync(3_000); });
    expect(screen.getByRole('alert').textContent).toContain('Unable to refresh');
    expect(screen.getByRole('heading', { name: 'Processing images' })).toBeTruthy();
    expect(screen.queryByText('Normal entry form')).toBeNull();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
    expect(screen.getByText('Normal entry form')).toBeTruthy();
    expect(screen.queryByText('Batch complete')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
});

it('shows ordinary entry once the initial status lookup confirms no active batch', async () => {
    render(<FinanceShareExperience><button>Normal entry form</button></FinanceShareExperience>);
    expect(screen.queryByText('Normal entry form')).toBeNull();
    expect(await screen.findByText('Normal entry form')).toBeTruthy();
});

it('uses the validated MIME type for reservation metadata and the same file for storage upload', async () => {
    vi.stubGlobal('File', NodeFile);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 100, height: 200, close() {} })));
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
    const original = new File([bytes], 'screenshot.png', { type: 'image/*', lastModified: 1234 });
    state.files = [{ id: 'image', file: original }];
    state.prepare.mockResolvedValue({ data: { batch_id: 'batch', reservation_id: 'reservation', uploads: [] } });
    state.upload.mockResolvedValue(undefined);
    state.active.mockResolvedValueOnce({ data: null }).mockRejectedValue(new Error('offline'));
    render(<FinanceShareExperience><button>Normal entry form</button></FinanceShareExperience>);

    const button = await screen.findByRole('button', { name: 'Process 1 image' });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(state.clearFiles).toHaveBeenCalledOnce());

    const uploaded = state.prepare.mock.calls[0][0];
    expect(uploaded[0].file).toMatchObject({ type: 'image/png', name: original.name, size: original.size, lastModified: 1234 });
    expect(new Uint8Array(await uploaded[0].file.arrayBuffer())).toEqual(bytes);
    expect(state.upload.mock.calls[0][0]).toBe(uploaded);
    expect(original.type).toBe('image/*');
    await screen.findByText('Unable to refresh processing status.');
    expect(screen.getByRole('heading', { name: 'Processing images' })).toBeTruthy();
    expect(screen.getByText('0 of 1 finished')).toBeTruthy();
    expect(screen.queryByText('Normal entry form')).toBeNull();
    expect(screen.queryByText('Ready - you may close the app')).toBeNull();
});
