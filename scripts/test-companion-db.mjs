import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const raw = process.env.COMPANION_TEST_DATABASE_URL;
if (process.env.COMPANION_ALLOW_LOCAL_DB_TESTS !== '1' || !raw) {
    throw new Error('Set COMPANION_ALLOW_LOCAL_DB_TESTS=1 and COMPANION_TEST_DATABASE_URL for an isolated migrated loopback database.');
}
const url = new URL(raw);
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('Companion database tests only allow loopback PostgreSQL.');
}
const env = { ...process.env, PGHOST: url.hostname.replace(/^\[|\]$/g, ''), PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)) };
for (const file of ['companion_pairing.test.sql', 'finance_notifications.test.sql']) {
    const result = spawnSync(process.env.PSQL_PATH || 'psql', ['-v', 'ON_ERROR_STOP=1', '-f', path.resolve('supabase/tests', file)],
        { env, stdio: 'inherit', windowsHide: true });
    if (result.error || result.status !== 0) throw new Error('Companion database test failed: ' + file);
}
