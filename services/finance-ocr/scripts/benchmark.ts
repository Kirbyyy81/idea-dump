import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { detectImageType, validateImage } from '../src/image.js';
import { ensureWorkerReady, recognizeScreenshot, terminateWorker } from '../src/worker.js';

const files = process.argv.slice(2);
if (!files.length) {
    console.error('Usage: npm run benchmark -- <screenshot> [screenshot ...]');
    process.exitCode = 1;
} else {
    const limits = {
        maxImageBytes: Number(process.env.MAX_IMAGE_BYTES || 4 * 1024 * 1024),
        maxImageDimension: Number(process.env.MAX_IMAGE_DIMENSION || 12_000),
        maxImagePixels: Number(process.env.MAX_IMAGE_PIXELS || 25_000_000),
    };
    const iterations = Math.max(1, Number(process.env.BENCHMARK_ITERATIONS || 1));
    const workerStartedAt = performance.now();
    await ensureWorkerReady();
    const workerReadyMs = Math.round(performance.now() - workerStartedAt);
    const samples: Array<Record<string, number | string>> = [];

    try {
        for (let iteration = 1; iteration <= iterations; iteration += 1) {
            for (const [index, file] of files.entries()) {
                const buffer = await readFile(file);
                const mimeType = detectImageType(buffer);
                if (!mimeType) throw new Error(`Fixture ${index + 1} is not PNG, JPEG, or WebP`);
                const validated = await validateImage(buffer, mimeType, path.basename(file), limits);
                const startedAt = performance.now();
                const result = await recognizeScreenshot(validated.buffer);
                samples.push({
                    fixture: index + 1,
                    iteration,
                    duration_ms: Math.round(performance.now() - startedAt),
                    width: validated.width,
                    height: validated.height,
                    input_bytes: buffer.length,
                    output_characters: result.rawText.length,
                    rss_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
                });
            }
        }
        console.log(JSON.stringify({ worker_ready_ms: workerReadyMs, samples }, null, 2));
    } finally {
        await terminateWorker();
    }
}
