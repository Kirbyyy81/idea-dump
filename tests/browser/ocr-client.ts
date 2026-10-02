import type { FinanceOcrSuccess, UploadFinanceScreenshotOptions } from '../../lib/finance/ocr/client';
export { FinanceOcrClientError } from '../../lib/finance/ocr/client';

// The UI fixture never sends screenshots to the real OCR service.
export async function warmFinanceOcr() {}
export async function uploadFinanceScreenshot(_file: File, options: UploadFinanceScreenshotOptions = {}): Promise<FinanceOcrSuccess> {
    options.onUploadProgress?.(100);
    options.onUploadComplete?.();
    const response = await fetch('/test-ocr', { method: 'POST', signal: options.signal });
    if (!response.ok) throw new Error('Connection interrupted. Try again.');
    return response.json();
}
