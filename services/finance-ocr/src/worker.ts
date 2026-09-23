import engData from '@tesseract.js-data/eng';
import { createWorker, OEM, PSM, type Worker, type RecognizeOptions, type WorkerParams } from 'tesseract.js';

export interface OcrResult {
    rawText: string;
    confidence: number | null;
}

let workerPromise: Promise<Worker> | null = null;

async function initializeWorker() {
    return createWorker(engData.code, OEM.LSTM_ONLY, {
        cacheMethod: 'none',
        gzip: engData.gzip,
        langPath: engData.langPath,
    });
}

export function ensureWorkerReady() {
    if (!workerPromise) {
        let ready: Promise<Worker>;
        ready = initializeWorker().catch((error) => {
            if (workerPromise === ready) workerPromise = null;
            throw error;
        });
        workerPromise = ready;
    }
    return workerPromise;
}

export async function resetWorker() {
    const current = workerPromise;
    workerPromise = null;
    if (!current) return;
    try {
        const worker = await current;
        await worker.terminate();
    } catch {
        // Initialization failures have no live worker to terminate.
    }
}

export async function recognizeScreenshot(image: Buffer, mode?: 'block'): Promise<OcrResult> {
    const blockOptions: Partial<RecognizeOptions> & Pick<WorkerParams, 'tessedit_pageseg_mode'> = { tessedit_pageseg_mode: PSM.SINGLE_BLOCK };
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        // Regional passes reuse the worker established by full-image OCR.
        // After a failure, leave reinitialisation to the next normal request.
        const ready = mode === 'block' ? workerPromise : ensureWorkerReady();
        if (!ready) throw new Error('Receipt region worker is unavailable');
        const recognition = ready.then((worker) => mode === 'block'
            // Per-recognition parameters are saved and restored by Tesseract.
            // Leave the existing full-image defaults untouched.
            ? worker.recognize(image, blockOptions)
            : worker.recognize(image));
        const result = mode === 'block' ? await Promise.race([
            recognition,
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Receipt region OCR timed out')), 15_000); }),
        ]) : await recognition;
        return {
            rawText: result.data.text,
            confidence: Number.isFinite(result.data.confidence) ? result.data.confidence : null,
        };
    } catch (error) {
        await resetWorker();
        throw error;
    } finally {
        clearTimeout(timer);
    }
}

export async function terminateWorker() {
    await resetWorker();
}
