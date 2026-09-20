import { File as NodeFile } from 'node:buffer';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { FinanceShareExperience } from '@/app/finance/add/_components/FinanceShareExperience';

const state = vi.hoisted(() => ({
    files: [] as Array<{ id: string; file: File }>,
    clearFiles: vi.fn(),
    prepare: vi.fn<(files: Array<{ clientId: string; file: File }>, requestId: string) => Promise<unknown>>(),
    upload: vi.fn(),
}));
vi.mock('@/app/finance/_components/FinanceShareTargetProvider', () => ({
    useFinanceShareTarget: () => ({ files: state.files, clearFiles: state.clearFiles, removeFile: vi.fn() }),
}));
vi.mock('@/lib/contexts/AlertContext', () => ({ useAlert: () => ({ showSuccess: vi.fn() }) }));
vi.mock('@/lib/finance/share/client', () => ({
    getActiveFinanceShareBatch: async () => ({ data: null }),
    prepareFinanceShareBatch: state.prepare,
    uploadPreparedFinanceShareFiles: state.upload,
    commitFinanceShareBatch: async () => ({ data: { batch_id: 'batch', safe_to_close: true } }),
}));
afterEach(() => vi.unstubAllGlobals());

it('uses the validated MIME type for reservation metadata and the same file for storage upload', async () => {
    vi.stubGlobal('File', NodeFile);
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 100, height: 200, close() {} })));
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
    const original = new File([bytes], 'screenshot.png', { type: 'image/*', lastModified: 1234 });
    state.files = [{ id: 'image', file: original }];
    state.prepare.mockResolvedValue({ data: { batch_id: 'batch', reservation_id: 'reservation', uploads: [] } });
    state.upload.mockResolvedValue(undefined);
    render(<FinanceShareExperience />);

    const button = await screen.findByRole('button', { name: 'Process 1 image' });
    await waitFor(() => expect(button.hasAttribute('disabled')).toBe(false));
    fireEvent.click(button);
    await waitFor(() => expect(state.clearFiles).toHaveBeenCalledOnce());

    const uploaded = state.prepare.mock.calls[0][0];
    expect(uploaded[0].file).toMatchObject({ type: 'image/png', name: original.name, size: original.size, lastModified: 1234 });
    expect(new Uint8Array(await uploaded[0].file.arrayBuffer())).toEqual(bytes);
    expect(state.upload.mock.calls[0][0]).toBe(uploaded);
    expect(original.type).toBe('image/*');
});
