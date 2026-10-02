import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FinanceTransactionEntry } from '@/app/finance/add/_components/FinanceTransactionEntry';
import type { FinanceOcrSuccess, UploadFinanceScreenshotOptions } from '@/lib/finance/ocr/client';

const mocks = vi.hoisted(() => ({ upload: vi.fn(), push: vi.fn(), alert: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('@/components/organisms/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/app/finance/add/_components/FinanceShareExperience', () => ({ FinanceShareExperience: ({ children }: { children: ReactNode }) => children }));
vi.mock('@/app/finance/_components/FinanceShareTargetProvider', () => ({ useFinanceShareTarget: () => ({ files: [] }) }));
vi.mock('@/app/finance/_components/FinanceReferenceData', () => ({ useFinanceReferenceData: () => ({ sources: [], categories: [], status: 'ready' }) }));
vi.mock('@/lib/contexts/AlertContext', () => ({ useAlert: () => ({ showError: mocks.alert, showSuccess: mocks.alert }) }));
vi.mock('@/lib/finance/ocr/client', async (importOriginal) => ({
    ...await importOriginal<object>(), uploadFinanceScreenshot: mocks.upload, warmFinanceOcr: async () => {},
}));

beforeEach(() => {
    vi.clearAllMocks();
    mocks.upload.mockReset();
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => setTimeout(() => callback(0), 0));
    vi.stubGlobal('cancelAnimationFrame', clearTimeout);
    URL.createObjectURL = vi.fn(() => 'blob:screenshot');
    URL.revokeObjectURL = vi.fn();
});

afterEach(() => vi.unstubAllGlobals());

function selectFile() {
    render(<FinanceTransactionEntry initialMode="screenshot" />);
    fireEvent.change(document.querySelector('input[type=file]')!, {
        target: { files: [new File(['image'], 'receipt.png', { type: 'image/png' })] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Process screenshot' }));
}

it.each([false, true])('keeps one dialog through processing and saved result (auto-confirmed: %s)', async (confirmed) => {
    let resolve!: (result: FinanceOcrSuccess) => void;
    mocks.upload.mockImplementation(() => new Promise<FinanceOcrSuccess>((done) => { resolve = done; }));
    selectFile();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Uploading screenshot')).toBeTruthy();
    expect(screen.queryByText('You may leave the app.')).toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBe(dialog);
    await waitFor(() => expect(document.activeElement).toBe(dialog));
    const callbacks = mocks.upload.mock.calls[0][1] as UploadFinanceScreenshotOptions;
    act(() => { callbacks.onUploadProgress?.(60); });
    expect(within(dialog).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('60');
    act(() => { callbacks.onUploadComplete?.(); });
    expect(within(dialog).getByText('Reading screenshot')).toBeTruthy();
    expect(screen.queryAllByLabelText('Screenshot processing progress')).toHaveLength(1);
    await act(async () => { resolve({ data: { candidate: { id: 'candidate-1' }, auto_confirmed: confirmed,
        transaction: confirmed ? { id: 'transaction-1' } : null }, warning: confirmed ? undefined : 'Check the amount.' }); });
    await screen.findByText('You may leave the app.');
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.alert).not.toHaveBeenCalled();
    if (!confirmed) expect(within(dialog).getByText('Check the amount.')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.push).toHaveBeenCalledWith(confirmed ? '/finance/transactions' : '/finance/review?candidate=candidate-1');
});

it('keeps errors and retry in the same dialog, retaining the selected screenshot', async () => {
    mocks.upload.mockRejectedValueOnce(new Error('Connection interrupted')).mockResolvedValueOnce({
        data: { candidate: { id: 'recovered-1' }, transaction: null, auto_confirmed: false, recovered: true },
    });
    selectFile();
    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByRole('alert')).toHaveProperty('textContent', 'Connection interrupted');
    expect(screen.queryByText('You may leave the app.')).toBeNull();
    expect(screen.getByText('receipt.png')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Retry' }));
    await screen.findByText('You may leave the app.');
    expect(screen.getByRole('dialog')).toBe(dialog);
    expect(mocks.upload.mock.calls[0][0]).toBe(mocks.upload.mock.calls[1][0]);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(mocks.push).not.toHaveBeenCalled();
});
