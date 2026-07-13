import engData from '@tesseract.js-data/eng';

export interface FinanceOcrResult {
    rawText: string;
    confidence: number | null;
}

export async function recognizeFinanceScreenshot(image: Buffer): Promise<FinanceOcrResult> {
    const { createWorker, OEM } = await import('tesseract.js');
    const worker = await createWorker(engData.code, OEM.LSTM_ONLY, {
        cacheMethod: 'none',
        gzip: engData.gzip,
        langPath: engData.langPath,
    });

    try {
        const result = await worker.recognize(image);
        return {
            rawText: result.data.text,
            confidence: Number.isFinite(result.data.confidence) ? result.data.confidence : null,
        };
    } finally {
        await worker.terminate();
    }
}
