import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { SupabaseFinanceRepository } from './repository.js';
import {
    ensureWorkerReady,
    recognizeScreenshot,
    terminateWorker,
} from './worker.js';

const config = loadConfig();
const app = await buildApp(config, {
    repository: new SupabaseFinanceRepository(config),
    ensureWorkerReady,
    recognize: recognizeScreenshot,
    terminateWorker,
});

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
