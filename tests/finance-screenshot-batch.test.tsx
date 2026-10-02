import { File as NodeFile } from 'node:buffer';
import type { ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FinanceTransactionEntry } from '@/app/finance/add/_components/FinanceTransactionEntry';

const state = vi.hoisted(() => ({
    sharedFiles: [] as Array<{ id: string; file: File }>,
    directUpload: vi.fn(),
    prepare: vi.fn(),
    upload: vi.fn(),
    commit: vi.fn(),
    active: vi.fn(),
    clearShared: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/components/organisms/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/app/finance/_components/FinanceShareTargetProvider', () => ({
    useFinanceShareTarget: () => ({ files: state.sharedFiles, clearFiles: state.clearShared, removeFile: vi.fn() }),
}));
vi.mock('@/app/finance/_components/FinanceReferenceData', () => ({
    useFinanceReferenceData: () => ({ sources: [], categories: [], status: 'ready' }),
}));
vi.mock('@/lib/contexts/AlertContext', () => ({ useAlert: () => ({ showError: vi.fn(), showSuccess: vi.fn() }) }));
vi.mock('@/lib/finance/ocr/client', async (importOriginal) => ({
    ...await importOriginal<object>(), uploadFinanceScreenshot: state.directUpload, warmFinanceOcr: async () => {},
}));
vi.mock('@/lib/finance/share/client', () => ({
    getActiveFinanceShareBatch: state.active,
    prepareFinanceShareBatch: state.prepare,
    uploadPreparedFinanceShareFiles: state.upload,
    commitFinanceShareBatch: state.commit,
}));

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

function screenshot(name: string, bytes: Uint8Array = png) {
    return new File([new Uint8Array(Array.from(bytes))], name, { type: 'image/png' });
}

function select(...files: File[]) {
    fireEvent.change(document.querySelector('input[type=file]')!, { target: { files } });
}

beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('File', NodeFile);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 100, height: 200, close() {} })));
    URL.createObjectURL = vi.fn(() => 'blob:screenshot');
    URL.revokeObjectURL = vi.fn();
    state.sharedFiles = [];
    state.active.mockResolvedValue({ data: null });
    state.prepare.mockResolvedValue({ data: { batch_id: 'batch', reservation_id: 'reservation', uploads: [] } });
    state.upload.mockResolvedValue(undefined);
    state.commit.mockResolvedValue({ data: { batch_id: 'batch', safe_to_close: true } });
});

afterEach(() => vi.unstubAllGlobals());

it('keeps one selected screenshot in the immediate upload flow', async () => {
    render(<FinanceTransactionEntry initialMode="screenshot" />);
    await screen.findByRole('button', { name: 'Process screenshot' });
    select(screenshot('one.png'));
    expect(screen.queryByRole('heading', { name: 'Review selected images' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Process screenshot' }).hasAttribute('disabled')).toBe(false);
    expect(state.prepare).not.toHaveBeenCalled();
});

it('reviews multiple screenshots and keeps the batch flow after removing one', async () => {
    render(<FinanceTransactionEntry initialMode="screenshot" />);
    await screen.findByRole('button', { name: 'Process screenshot' });
    select(screenshot('one.png'), screenshot('two.png'));
    expect(screen.queryByRole('button', { name: 'Process screenshot' })).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Review selected images' })).toBeTruthy();
    const process = await screen.findByRole('button', { name: 'Process 2 images' });
    await waitFor(() => expect(process.hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Remove two.png' }));
    expect(screen.getByRole('heading', { name: 'Review selected images' })).toBeTruthy();
    const remaining = await screen.findByRole('button', { name: 'Process 1 image' });
    await waitFor(() => expect(remaining.hasAttribute('disabled')).toBe(false));
    fireEvent.click(remaining);
    await waitFor(() => expect(state.commit).toHaveBeenCalledOnce());
    expect(state.prepare.mock.calls[0][0]).toHaveLength(1);
    expect(state.upload.mock.calls[0][0][0].file.name).toBe('one.png');
    expect(state.directUpload).not.toHaveBeenCalled();
    expect(await screen.findByRole('button', { name: 'Process screenshot' })).toBeTruthy();
});

it('returns to the picker when every selected image is removed', async () => {
    render(<FinanceTransactionEntry initialMode="screenshot" />);
    await screen.findByRole('button', { name: 'Process screenshot' });
    select(screenshot('one.png'), screenshot('two.png'));
    await screen.findByRole('heading', { name: 'Review selected images' });
    fireEvent.click(screen.getByRole('button', { name: 'Remove one.png' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove two.png' }));
    expect(await screen.findByRole('button', { name: 'Process screenshot' })).toBeTruthy();
    expect(state.prepare).not.toHaveBeenCalled();
});

it('blocks selections over ten images until the extra image is removed', async () => {
    render(<FinanceTransactionEntry initialMode="screenshot" />);
    await screen.findByRole('button', { name: 'Process screenshot' });
    select(...Array.from({ length: 11 }, (_, index) => screenshot(`${index}.png`)));
    expect(await screen.findByText('Remove files until no more than 10 images remain.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Process 10 images' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Remove 10.png' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Process 10 images' }).hasAttribute('disabled')).toBe(false));
    expect(state.prepare).not.toHaveBeenCalled();
});

it('shows invalid image content in review and blocks submission', async () => {
    render(<FinanceTransactionEntry initialMode="screenshot" />);
    await screen.findByRole('button', { name: 'Process screenshot' });
    select(screenshot('valid.png'), screenshot('invalid.png', new Uint8Array([1, 2, 3])));
    expect(await screen.findByText('The image content does not match its declared file type.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Process 1 image' }).hasAttribute('disabled')).toBe(true);
    expect(state.prepare).not.toHaveBeenCalled();
});

it('retains the selected files and request id for a failed handoff retry', async () => {
    state.prepare.mockRejectedValueOnce(new Error('Connection interrupted'));
    render(<FinanceTransactionEntry initialMode="screenshot" />);
    await screen.findByRole('button', { name: 'Process screenshot' });
    select(screenshot('one.png'), screenshot('two.png'));
    const button = await screen.findByRole('button', { name: 'Process 2 images' });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Connection interrupted');
    fireEvent.click(button);
    await waitFor(() => expect(state.commit).toHaveBeenCalledOnce());
    expect(state.prepare.mock.calls[0][1]).toBe(state.prepare.mock.calls[1][1]);
});

it('shows an incoming Android share and discards a pending picker selection', async () => {
    const view = render(<FinanceTransactionEntry initialMode="screenshot" />);
    await screen.findByRole('button', { name: 'Process screenshot' });
    select(screenshot('local-one.png'), screenshot('local-two.png'));
    await screen.findByRole('heading', { name: 'Review selected images' });
    state.sharedFiles = [{ id: 'shared', file: screenshot('gallery.png') }];
    view.rerender(<FinanceTransactionEntry initialMode="screenshot" />);
    expect(await screen.findByRole('heading', { name: 'Review shared images' })).toBeTruthy();
    expect(screen.queryByText('local-one.png')).toBeNull();
    state.sharedFiles = [];
    view.rerender(<FinanceTransactionEntry initialMode="screenshot" />);
    expect(await screen.findByRole('button', { name: 'Process screenshot' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Review selected images' })).toBeNull();
});
