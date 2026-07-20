import engData from '@tesseract.js-data/eng';
import { createWorker, OEM, type Worker } from 'tesseract.js';

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

export async function recognizeScreenshot(image: Buffer): Promise<OcrResult> {
    const worker = await ensureWorkerReady();
    try {
        const result = await worker.recognize(image);
        return {
            rawText: result.data.text,
            confidence: Number.isFinite(result.data.confidence) ? result.data.confidence : null,
        };
    } catch (error) {
        await resetWorker();
        throw error;
    }
}

export async function terminateWorker() {
    await resetWorker();
}
