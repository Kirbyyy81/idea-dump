import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const database = process.env.FINANCE_BUDGET_TEST_DATABASE_URL;
const psql = process.env.FINANCE_BUDGET_TEST_PSQL || 'psql';
if (!database || !['127.0.0.1', 'localhost', '[::1]'].includes(new URL(database).hostname)) {
    throw new Error('FINANCE_BUDGET_TEST_DATABASE_URL must name an isolated loopback PostgreSQL database');
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = new URL(database);
const env = { ...process.env, PGHOST: url.hostname, PGPORT: url.port || '5432', PGDATABASE: url.pathname.slice(1),
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password) };
function run(sql, extra = [], onReady) {
    return new Promise((resolve, reject) => {
        const child = spawn(psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-At', ...extra], { env, windowsHide: true });
        let output = ''; let error = ''; let ready = false;
        child.stdout.on('data', (chunk) => { output += chunk; if (!ready && output.includes('BUDGET_READY')) { ready = true; onReady?.(); } });
        child.stderr.on('data', (chunk) => { error += chunk; });
        child.on('error', reject);
        child.on('close', (code) => resolve({ code, output, error }));
        child.stdin.end(sql);
    });
}
function check(ok, label) { if (!ok) throw new Error(`Budget database check failed: ${label}`); }
const suite = await run('', ['-f', path.join(root, 'supabase/tests/finance_budgets.test.sql')]);
check(suite.code === 0, suite.error || 'SQL lifecycle suite');
const owner = randomUUID(); const source = randomUUID(); const requestId = randomUUID();
const config = JSON.stringify({ name: 'Concurrent fixture', amount: '100.00', cycle_type: 'custom', start_date: '2026-09-14', custom_days: 1,
    anchor_day: null, time_zone: 'Asia/Kuala_Lumpur', filter_logic: 'and', source_ids: [source], category_ids: [], include_uncategorised: false });
const create = `select public.finance_budget_mutate('${owner}','create',null,null,'${requestId}','${config}','2026-09-14T00:00Z');`;
try {
    check((await run(`insert into auth.users(id) values('${owner}'); insert into public.dim_finance_sources(id,user_id,name) values('${source}','${owner}','Concurrency source');`)).code === 0, 'fixture setup');
    const creations = await Promise.all([run(create), run(create)]);
    check(creations.every((result) => result.code === 0), 'concurrent creation accepted');
    const id = creations[0].output.trim();
    check(id === creations[1].output.trim(), 'one identity for concurrent retries');
    const update = `select public.finance_budget_mutate('${owner}','update','${id}',1,null,'${config}','2026-09-14T01:00Z');`;
    const updates = await Promise.all([run(update), run(update)]);
    check(updates.filter((result) => result.code === 0).length === 1 && updates.some((result) => result.error.includes('40001')), 'one stale concurrent edit rejected');
    const closures = await Promise.all([run(`select public.finance_budget_reconcile('${owner}','${id}','2026-09-16T01:00Z');`), run(`select public.finance_budget_close_due('2026-09-16T01:00Z');`)]);
    check(closures.every((result) => result.code === 0), 'concurrent cron and reconciliation');
    const count = await run(`select count(*)||':'||count(*) filter(where frozen_at is null) from public.finance_budget_cycles where budget_id='${id}';`);
    check(count.output.trim() === '3:1', 'two frozen cycles and a single successor');
    let signalReady;
    const ready = new Promise((resolve) => { signalReady = resolve; });
    const holding = run(`begin; select public.finance_budget_mutate('${owner}','update','${id}',2,null,'${config}','2026-09-16T01:00Z');
select 'BUDGET_READY'; select pg_sleep(0.4); commit;`, [], signalReady);
    await Promise.race([ready, holding.then((result) => { if (result.code !== 0) throw new Error(result.error); })]);
    const deleting = run(`select public.finance_delete_source('${owner}','${source}');`);
    const [held, deleted] = await Promise.all([holding, deleting]);
    check(held.code === 0 && deleted.error.includes('23503'), 'concurrent source deletion cannot invalidate a live budget');
    process.stdout.write('Budget SQL lifecycle, security, idempotency, concurrency and closure checks passed.\n');
} finally {
    const cleanup = await run(`delete from auth.users where id='${owner}';`);
    check(cleanup.code === 0, `synthetic user retention cascade: ${cleanup.error}`);
}
