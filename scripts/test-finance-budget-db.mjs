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
const dashboard = await run('', ['-f', path.join(root, 'supabase/tests/finance_budget_dashboard.test.sql')]);
check(dashboard.code === 0, dashboard.error || 'SQL dashboard month suite');
const tags = await run('', ['-f', path.join(root, 'supabase/tests/finance_budget_tags_one_time.test.sql')]);
check(tags.code === 0, tags.error || 'SQL tag and one-time suite');
const groups = await run('', ['-f', path.join(root, 'supabase/tests/finance_budget_filter_groups.test.sql')]);
check(groups.code === 0, groups.error || 'SQL grouped filter suite');
const exclusions = await run('', ['-f', path.join(root, 'supabase/tests/finance_budget_tag_exclusions.test.sql')]);
check(exclusions.code === 0, exclusions.error || 'SQL tag exclusions suite');
const owner = randomUUID(); const source = randomUUID(); const tag = randomUUID(); const transaction = randomUUID(); const requestId = randomUUID();
const config = JSON.stringify({ name: 'Concurrent fixture', amount: '100.00', cycle_type: 'custom', start_date: '2026-09-14', custom_days: 1,
    anchor_day: null, time_zone: 'Asia/Kuala_Lumpur', filter_logic: 'and', source_ids: [source], category_ids: [], include_uncategorised: false, excluded_tag_ids: [tag] });
const create = `select public.finance_budget_mutate('${owner}','create',null,null,'${requestId}','${config}','2026-09-14T00:00Z');`;
try {
    check((await run(`insert into auth.users(id) values('${owner}'); insert into public.dim_finance_sources(id,user_id,name) values('${source}','${owner}','Concurrency source'); insert into public.dim_finance_tags(id,user_id,name) values('${tag}','${owner}','Concurrency exclusion');`)).code === 0, 'fixture setup');
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
    let tagSignal;
    const tagReady = new Promise(resolve => { tagSignal = resolve; });
    const lockingTag = run(`begin; select public.finance_budget_mutate('${owner}','update','${id}',3,null,'${config}','2026-09-16T01:00Z');
select 'BUDGET_READY'; select pg_sleep(0.4); commit;`, [], tagSignal);
    await Promise.race([tagReady, lockingTag.then(result => { if (result.code !== 0) throw new Error(result.error); })]);
    const [tagHeld, tagDeleted] = await Promise.all([lockingTag, run(`delete from public.dim_finance_tags where id='${tag}';`)]);
    check(tagHeld.code === 0 && tagDeleted.error.includes('23503'), 'concurrent excluded-tag deletion cannot invalidate a live budget');
    const cumulativeConfig = JSON.stringify({ ...JSON.parse(config), name: 'Concurrent exclusion ledger', cycle_type: 'one_time', start_date: null, custom_days: null });
    const cumulative = await run(`select public.finance_budget_mutate('${owner}','create',null,null,gen_random_uuid(),'${cumulativeConfig}');`);
    check(cumulative.code === 0, 'exclusion-only ledger fixture');
    const cumulativeId = cumulative.output.trim();
    check((await run(`insert into public.finance_transactions(id,user_id,source_id,direction,amount,transaction_date,status)
values('${transaction}','${owner}','${source}','expense',25,current_date,'confirmed');`)).code === 0, 'ledger fixture');
    let ledgerSignal;
    const ledgerReady = new Promise(resolve => { ledgerSignal = resolve; });
    const assigning = run(`begin; insert into public.finance_transaction_tags(transaction_id,user_id,tag_id) values('${transaction}','${owner}','${tag}');
select 'BUDGET_READY'; select pg_sleep(0.4); commit;`, [], ledgerSignal);
    await Promise.race([ledgerReady, assigning.then(result => { if (result.code !== 0) throw new Error(result.error); })]);
    const omittedConfig = JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(cumulativeConfig)).filter(([key]) => key !== 'excluded_tag_ids')));
    const [assigned, edited] = await Promise.all([assigning, run(`select public.finance_budget_mutate('${owner}','update','${cumulativeId}',1,null,'${omittedConfig}');`)]);
    check(assigned.code === 0 && edited.code === 0, 'tag membership and configuration writes serialize');
    const matched = await run(`select count(*) from public.finance_budget_matching('${owner}','${cumulativeId}',null,null);`);
    check(matched.output.trim() === '0', 'omitted exclusion preserved across concurrent tag assignment');
    const parts = JSON.stringify([{ amount: '10', category_id: null, notes: null, tag_ids: [] }, { amount: '15', category_id: null, notes: null, tag_ids: [] }]);
    const initialSnapshot = await run(`select public.finance_get_transaction_split('${owner}','${transaction}');`);
    check(initialSnapshot.code === 0, 'split edit snapshot');
    const initialVersion = JSON.parse(initialSnapshot.output.trim()).version;
    check((await run(`select public.finance_save_transaction_split('${owner}','${transaction}','${initialVersion}','${parts}');`)).code === 0, 'split edit fixture');
    const editSnapshot = await run(`select public.finance_get_split_transaction_edit('${owner}','${transaction}');`);
    check(editSnapshot.code === 0, 'original and allocations load together');
    const editVersion = JSON.parse(editSnapshot.output.trim()).split.version;
    const paymentInput = JSON.stringify({ p_source_id: source, p_category_id: null, p_direction: 'expense', p_amount: 30, p_currency: 'MYR',
        p_merchant: 'Concurrent edited payment', p_payee_name: null, p_transaction_date: new Date().toISOString().slice(0, 10), p_notes: 'Original edit', p_reference_number: 'EDIT-30', p_tag_ids: [] });
    const changedParts = JSON.stringify([{ amount: '12', category_id: null, notes: 'Part edit', tag_ids: [] }, { amount: '18', category_id: null, notes: null, tag_ids: [] }]);
    const editSql = `select public.finance_update_split_transaction('${owner}','${transaction}','${editVersion}','${paymentInput}','${changedParts}');`;
    const splitEdits = await Promise.all([run(editSql), run(editSql)]);
    check(splitEdits.filter(result => result.code === 0).length === 1 && splitEdits.some(result => result.error.includes('40001')), 'one concurrent original-and-split edit wins');
    const balanced = await run(`select t.is_split and t.amount=30 and count(e.id)=2 and sum(e.amount)=30
from public.finance_transactions t join public.finance_ledger_entries e on e.user_id=t.user_id and e.split_payment_id=t.id
where t.user_id='${owner}' and t.id='${transaction}' group by t.id;`);
    check(balanced.output.trim() === 't', 'concurrent original and parts stay balanced without duplicate ledger entries');
    process.stdout.write('Budget SQL lifecycle, security, idempotency, concurrency and closure checks passed.\n');
} finally {
    const cleanup = await run(`delete from auth.users where id='${owner}';`);
    check(cleanup.code === 0, `synthetic user retention cascade: ${cleanup.error}`);
}
