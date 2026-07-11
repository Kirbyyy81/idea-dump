import engData from '@tesseract.js-data/eng';

export async function recognizeFinanceScreenshot(image: Buffer) {
    const { createWorker, OEM } = await import('tesseract.js');
    const worker = await createWorker(engData.code, OEM.LSTM_ONLY, {
        cacheMethod: 'none',
        gzip: engData.gzip,
        langPath: engData.langPath,
    });

    try {
        const result = await worker.recognize(image);
        return result.data.text.trim();
    } finally {
        await worker.terminate();
    }
}
