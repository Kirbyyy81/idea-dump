import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { SupabaseFinanceRepository } from './repository.js';
import {
    ensureWorkerReady,
    recognizeScreenshot,
    terminateWorker,
} from './worker.js';

const config = loadConfig();
const repository = new SupabaseFinanceRepository(config);
const app = await buildApp(config, {
    repository,
    queueRepository: repository,
    ensureWorkerReady,
    recognize: recognizeScreenshot,
    terminateWorker,
}, { startQueueConsumer: true });

let closing = false;
async function shutdown(signal: string) {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'Stopping Finance OCR service');
    await app.close();
}

process.once('SIGTERM', () => void shutdown('SIGTERM'));
process.once('SIGINT', () => void shutdown('SIGINT'));

try {
    await app.listen({ host: config.host, port: config.port });
} catch (error) {
    app.log.error(error, 'Finance OCR service failed to start');
    process.exitCode = 1;
    await app.close();
}
