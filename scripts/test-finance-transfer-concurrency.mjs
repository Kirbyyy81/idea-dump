import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';

const raw = process.env.COMPANION_TEST_DATABASE_URL;
if (process.env.COMPANION_ALLOW_LOCAL_DB_TESTS !== '1' || !raw) throw new Error('Isolated database opt-in required');
const url = new URL(raw);
if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('Only loopback PostgreSQL is allowed');
const env = { ...process.env, PGHOST: url.hostname.replace(/^\[|\]$/g, ''), PGPORT: url.port || '5432',
    PGUSER: decodeURIComponent(url.username), PGPASSWORD: decodeURIComponent(url.password), PGDATABASE: decodeURIComponent(url.pathname.slice(1)) };
const literal = value => "'" + String(value).replaceAll("'", "''") + "'";
function run(sql, onReady) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.env.PSQL_PATH || 'psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'], { env });
        let output = '', error = '', ready = false;
        child.stdout.on('data', chunk => { output += chunk; if (!ready && output.includes('TRANSFER_LOCK_READY')) { ready = true; onReady?.(); } });
        child.stderr.on('data', chunk => { error += chunk; });
        child.on('error', reject); child.on('close', code => resolve({ code, output, error })); child.stdin.end(sql);
    });
}
async function checked(sql) {
    const result = await run(sql);
    if (result.code !== 0) throw new Error(result.error);
    return result.output.trim();
}
const check = (ok, message) => { if (!ok) throw new Error(message); };
const owner = randomUUID(), ryt = randomUUID(), tng = randomUUID(), device = randomUUID();
let created = false;
try {
    await checked(`insert into auth.users(id) values(${literal(owner)});`); created = true;
    await checked(`insert into public.bridge_user_module_overrides(user_id,module_id,effect) select ${literal(owner)},id,'allow' from public.dim_modules where modules='finance';
        insert into public.dim_finance_sources(id,user_id,name) values(${literal(ryt)},${literal(owner)},'Synthetic Ryt'),(${literal(tng)},${literal(owner)},'Synthetic TNG');
        insert into public.companion_devices(id,user_id,token_hash,label) values(${literal(device)},${literal(owner)},${literal(randomUUID().replaceAll('-', '').repeat(2))},'Transfer test phone');`);
    const day = await checked("select (now() at time zone 'Asia/Kuala_Lumpur')::date;");
    const create = (source, direction, party) => `set role service_role; select to_jsonb(t) from public.finance_create_manual_transaction_v2(${literal(owner)},${literal(source)},null,${literal(direction)},1,null,${literal(party)},${literal(day)},null,'MYR',null,${literal(randomUUID())}) t;`;
    const outgoing = JSON.parse(await checked(create(ryt, 'expense', 'My TNG')));
    const incoming = JSON.parse(await checked(create(tng, 'income', 'My Ryt')));
    const first = JSON.parse(await checked(`select finance_private.transfer_entry(${literal(owner)},'transaction',${literal(outgoing.id)});`));
    const second = JSON.parse(await checked(`select finance_private.transfer_entry(${literal(owner)},'transaction',${literal(incoming.id)});`));
    const link = `set role service_role; select public.finance_link_internal_transfer(${literal(owner)},${literal(JSON.stringify(first))},${literal(JSON.stringify(second))},true);`;
    let signal;
    const ready = new Promise(resolve => { signal = resolve; });
    const holding = run(`begin; select id from public.finance_transactions where id=${literal(outgoing.id)} for update; select 'TRANSFER_LOCK_READY'; select pg_sleep(0.7); rollback;`, signal);
    const held = await Promise.race([ready.then(() => true), holding.then(() => false)]);
    check(held, 'Could not hold the transfer row lock');
    const conflict = await run(link);
    check(conflict.code !== 0 && conflict.error.includes('55P03'), 'A held transfer row must fail safely instead of using a stale preview');
    await holding;
    const repeated = await Promise.all([checked(link), checked(link)]);
    check(JSON.parse(repeated[0]).id === JSON.parse(repeated[1]).id, 'Concurrent linking created different pair identities');
    check(await checked(`select count(*) from public.finance_internal_transfers where user_id=${literal(owner)};`) === '1', 'Expected a single linked pair');

    const posted = new Date().toISOString();
    const accept = (direction, source, sourcePackage, party, patternId) => {
        const event = { client_event_id: randomUUID(), source_id: source, source_package: sourcePackage,
            notification_key_hash: randomUUID().replaceAll('-', '').repeat(2), captured_at: posted,
            notification: { title: 'Synthetic transfer', text: direction === 'expense' ? `You've sent RM 200.00 to ${party} on ${day}, 12:00pm (GMT+8) using your main account` : `${party} has transferred RM 200.00 to you.`, posted_at: posted } };
        const trace = { pattern_id: patternId, revision: 1, learned: false };
        const parsed = { status: 'review', date_provenance: 'posted_at', duplicate_outcome: 'none', payload: {
            source_id: source, category_id: null, direction, amount: 200, currency: 'MYR', merchant: null, payee_name: party,
            reference_number: null, notes: null, transaction_date: day,
            notification_extraction: { version: 1, conflicts: [], date_provenance: 'posted_at', fields: { amount: trace, direction: trace, payee_name: trace } },
        } };
        return `set role service_role; select public.finance_accept_notification_v2(${[owner, device, JSON.stringify(event), 'a'.repeat(64), JSON.stringify(parsed)].map(literal).join(',')});`;
    };
    const uploadOutgoing = accept('expense', ryt, 'my.rytbank.app', 'My TNG', '52000000-0000-4000-8000-000000000004');
    const uploadIncoming = accept('income', tng, 'my.com.tngdigital.ewallet', 'My Ryt', '52000000-0000-4000-8000-000000000001');
    const simultaneous = await Promise.all([checked(uploadOutgoing), checked(uploadIncoming)]);
    check(simultaneous.every(value => JSON.parse(value).status === 'completed'), 'Both concurrent transfer notifications should complete');
    check(await checked(`select count(*) from public.finance_internal_transfers where user_id=${literal(owner)} and automatic;`) === '1', 'Concurrent uploads must produce one automatic pair');
    check(await checked(`select count(*) from public.finance_transactions where user_id=${literal(owner)} and amount=200 and transfer_id is not null;`) === '2', 'The automatic pair must have exactly two ledger rows');
    check(JSON.parse(await checked(uploadOutgoing)).replayed === true, 'Completed upload replay must preserve the existing result');
    const duplicate = JSON.parse(await checked(accept('expense', ryt, 'my.rytbank.app', 'My TNG', '52000000-0000-4000-8000-000000000004')));
    check(duplicate.status === 'review', 'Reimporting a transfer leg must still require duplicate review');
    check(await checked(`select count(*) from public.finance_notification_events where user_id=${literal(owner)} and status='completed' and body is not null;`) === '0', 'Automatic linking must remove notification text');
    console.log('Independent-session transfer locks, concurrent linking/uploads, replay and duplicate protection passed');
} finally {
    if (created) await checked(`delete from auth.users where id=${literal(owner)};`);
}
