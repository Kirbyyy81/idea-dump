import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ recognize: vi.fn(), terminate: vi.fn(), createWorker: vi.fn() }));
vi.mock('tesseract.js', () => ({
    OEM: { LSTM_ONLY: 1 }, PSM: { SINGLE_BLOCK: '6' },
    createWorker: mocks.createWorker.mockImplementation(async () => ({ recognize: mocks.recognize, terminate: mocks.terminate })),
}));
import { ensureWorkerReady, recognizeScreenshot, terminateWorker } from '../src/worker.js';

afterEach(async () => { await terminateWorker(); vi.useRealTimers(); vi.clearAllMocks(); });
describe('regional recognition worker settings', () => {
    it('uses temporary block parameters and leaves the next screenshot on original defaults', async () => {
        mocks.recognize.mockResolvedValue({ data: { text: 'Synthetic text', confidence: 90 } });
        const image = Buffer.from('synthetic');
        await recognizeScreenshot(image);
        await recognizeScreenshot(image, 'block');
        await recognizeScreenshot(image);
        expect(mocks.recognize.mock.calls).toEqual([[image], [image, { tessedit_pageseg_mode: '6' }], [image]]);
        expect(mocks.createWorker).toHaveBeenCalledTimes(1);
    });
    it('replaces a failed worker before the next screenshot', async () => {
        await ensureWorkerReady();
        mocks.recognize.mockRejectedValueOnce(new Error('Synthetic failure')).mockResolvedValue({ data: { text: 'Recovered', confidence: 80 } });
        await expect(recognizeScreenshot(Buffer.from('region'), 'block')).rejects.toThrow('Synthetic failure');
        expect(mocks.terminate).toHaveBeenCalledTimes(1);
        await expect(recognizeScreenshot(Buffer.from('screenshot'))).resolves.toMatchObject({ rawText: 'Recovered' });
        expect(mocks.createWorker).toHaveBeenCalledTimes(2);
    });
    it('terminates timed-out recognition instead of holding the lease indefinitely', async () => {
        await ensureWorkerReady();
        vi.useFakeTimers();
        mocks.recognize.mockImplementationOnce(() => new Promise(() => {}));
        const result = expect(recognizeScreenshot(Buffer.from('region'), 'block')).rejects.toThrow('timed out');
        await vi.advanceTimersByTimeAsync(15_000);
        await result;
        expect(mocks.terminate).toHaveBeenCalledTimes(1);
    });
});
