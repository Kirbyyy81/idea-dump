import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFinanceTestDatabase, financeSqlFile } from './lib/finance-test-database.mjs';

const db = await createFinanceTestDatabase();
const owner = randomUUID(), other = randomUUID(), ryt = randomUUID(), tng = randomUUID(), otherSource = randomUUID();
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => (await q(sql, args))[0]?.data;
const day = '2026-11-19';
let amount = 100;
const payload = (direction = 'expense', source = ryt, changes = {}) => ({ source_id: source, category_id: null, direction, amount, currency: 'MYR',
    merchant: null, payee_name: direction === 'expense' ? 'My TNG' : 'My Ryt', transaction_date: day, reference_number: null, notes: null, ...changes });
const entries = () => q('select * from finance_private.transfer_entries($1)', [owner]);
async function candidate(p, notification = false, posted = '2026-11-19T08:00:00Z') {
    const intake = (await q("insert into public.finance_intake_items(user_id,source,status,created_at) values($1,$2,'review',clock_timestamp()) returning id", [owner, notification ? 'notification' : 'screenshot']))[0].id;
    if (notification) {
        const pattern = p.source_id === ryt ? '52000000-0000-4000-8000-000000000004' : '52000000-0000-4000-8000-000000000001';
        p = { ...p, notification_extraction: { version: 1, conflicts: [], date_provenance: 'posted_at', fields: {
            amount: { pattern_id: pattern, revision: 1 }, direction: { pattern_id: pattern, revision: 1 }, payee_name: { pattern_id: pattern, revision: 1 },
        } } };
        await q(`insert into public.finance_notification_events(user_id,device_id,client_event_id,source_id,source_package,payload_digest,notification_key_hash,captured_at,posted_at,title,body,date_provenance,status,intake_item_id)
            values($1,$2,$3,$4,$5,repeat('a',64),repeat('b',64),clock_timestamp(),$6,'Synthetic transfer','Synthetic transfer body','posted_at','review',$7)`,
        [owner, device, randomUUID(), p.source_id, p.source_id === ryt ? 'my.rytbank.app' : 'my.com.tngdigital.ewallet', posted, intake]);
    }
    const c = (await q("insert into public.finance_candidate_transactions(user_id,intake_item_id,payload,confidence,duplicate_outcome,created_at) values($1,$2,$3,0.5,'none',clock_timestamp()) returning *", [owner, intake, JSON.stringify(p)]))[0];
    return (await entries()).find(e => e.kind === 'candidate' && e.id === c.id);
}
async function manual(p, user = owner) {
    return (await q('select * from public.finance_create_manual_transaction_v2($1,$2,null,$3,$4,$5,$6,$7,$8,\'MYR\',null,$9)',
        [user, p.source_id, p.direction, p.amount, p.merchant, p.payee_name, p.transaction_date, p.notes, randomUUID()]))[0];
}
async function lookup(kind, id) { return scalar('select finance_private.transfer_entry($1,$2,$3) as data', [owner, kind, id]); }
async function link(a, b, save = false, user = owner) {
    return scalar('select public.finance_link_internal_transfer($1,$2,$3,$4) as data', [user, JSON.stringify(a), JSON.stringify(b), save]);
}
const auto = id => scalar('select finance_private.auto_confirm_notification($1,$2) as data', [owner, id]);
const device = randomUUID();
try {
    await db.exec("insert into public.dim_modules(modules,name,path,enabled) values('finance','Finance','/finance',true),('companion','Companion','/companion',true) on conflict do nothing;");
    await q('insert into auth.users(id) values($1),($2)', [owner, other]);
    await q("insert into public.bridge_user_module_overrides(user_id,module_id,effect) select u.id,m.id,'allow' from auth.users u cross join public.dim_modules m where m.modules='finance'");
    await q("insert into public.dim_finance_sources(id,user_id,name) values($1,$2,'Ryt'),($3,$2,'TNG'),($4,$5,'Other')", [ryt, owner, tng, otherSource, other]);
    await q("insert into public.companion_devices(id,user_id,token_hash,label) values($1,$2,repeat('c',64),'Synthetic phone')", [device, owner]);
    await db.exec('set role service_role');

    const a = await candidate(payload());
    const b = await candidate(payload('income', tng));
    const first = await lookup('candidate', a.id), second = await lookup('candidate', b.id);
    await assert.rejects(link({ ...first, version: '2000-01-01T00:00:00+00:00' }, second), /changed/);
    await assert.rejects(link(first, second, false, other), /Complete/);
    const pair = await link(first, second, true);
    assert.ok(pair.id); assert.ok(pair.rule_id);
    assert.equal((await entries()).filter(e => e.transfer_id === pair.id).length, 2);
    assert.equal((await link(first, second)).id, pair.id, 'link replay is idempotent');
    assert.equal((await q('select status,body from public.finance_notification_events where user_id=$1', [owner])).length, 0);
    await assert.rejects(q('select public.finance_delete_transaction($1,$2)', [owner, pair.outgoing_transaction_id]), /Unlink/);
    await assert.rejects(q('update public.finance_transactions set amount=99 where id=$1', [pair.outgoing_transaction_id]), /Unlink/);
    await q('update public.finance_transactions set notes=\'Kept\' where id=$1', [pair.outgoing_transaction_id]);
    assert.equal((await scalar('select public.finance_internal_transfer_rules($1) as data', [owner])).length, 1);

    // Budgets with every filter combination share the same transfer exclusion.
    const budget = (await q("insert into public.finance_budgets(user_id,name,amount,cycle_type,start_date,anchor_day,time_zone,create_request_id,filter_logic,create_fingerprint,include_uncategorised) values($1,'Transfer regression',1000,'monthly','2026-11-01',1,'Asia/Kuala_Lumpur',gen_random_uuid(),'and','synthetic-transfer-budget',false) returning id", [owner]))[0].id;
    assert.equal((await q('select * from public.finance_budget_matching($1,$2,null,null)', [owner, budget])).length, 0);
    await db.exec('begin');
    // A partial unlink cannot commit.
    await q('update public.finance_transactions set transfer_id=null where id=$1', [pair.outgoing_transaction_id]);
    await assert.rejects(db.exec('set constraints all immediate'), /Invalid internal transfer/);
    await db.exec('rollback');
    const stored = (await q('select * from public.finance_internal_transfers where id=$1', [pair.id]))[0];
    await q('select public.finance_unlink_internal_transfer($1,$2,$3)', [owner, pair.id, stored.created_at]);
    assert.equal((await q('select * from public.finance_budget_matching($1,$2,null,null)', [owner, budget])).length, 2);
    assert.equal((await q('select * from public.finance_internal_transfer_dismissals where user_id=$1', [owner])).length, 1);
    await q('select public.finance_delete_transaction($1,$2)', [owner, pair.outgoing_transaction_id]);
    assert.equal((await q('select id from public.finance_transactions where id=$1', [pair.outgoing_transaction_id])).length, 0, 'unlinked entries can be deleted');

    amount = 101;
    const saved = await manual(payload());
    const incoming = await candidate(payload('income', tng), true);
    const mixed = await link(await lookup('transaction', saved.id), await lookup('candidate', incoming.id));
    assert.ok(mixed.id);
    assert.equal((await q('select body from public.finance_notification_events where intake_item_id=$1', [incoming.intake_id]))[0].body, null, 'link confirmation deletes notification text');
    assert.equal((await q('select * from public.finance_category_evidence where transaction_id=$1', [mixed.incoming_transaction_id])).length, 0);

    amount = 102;
    const outgoing = await candidate(payload(), true);
    assert.equal((await auto(outgoing.id)).confirmed, true, 'unpaired outgoing follows normal confirmation');
    const arriving = await candidate(payload('income', tng), true, '2026-11-19T08:03:00Z');
    const automatic = await auto(arriving.id);
    assert.equal(automatic.confirmed, true);
    assert.ok(automatic.transfer_id, 'saved identities link automatically before duplicate checks');
    assert.equal((await q('select automatic from public.finance_internal_transfers where id=$1', [automatic.transfer_id]))[0].automatic, true);
    assert.equal((await q('select count(*)::int n from public.finance_notification_events where intake_item_id in ($1,$2) and body is not null', [outgoing.intake_id, arriving.intake_id]))[0].n, 0);

    amount = 103;
    const i1 = await candidate(payload('income', tng), true);
    const i2 = await candidate(payload('income', tng), true);
    const ambiguous = await candidate(payload(), true);
    assert.equal((await auto(ambiguous.id)).confirmed, false, 'ambiguous pairs stay in review');
    assert.equal((await q('select count(*)::int n from public.finance_internal_transfers where user_id=$1', [owner]))[0].n, 2);

    amount = 104;
    const lateOut = await candidate(payload(), true);
    const lateIn = await candidate(payload('income', tng), true, '2026-11-19T09:00:00Z');
    assert.equal(await scalar('select finance_private.auto_link_internal_transfer($1,$2) as data', [owner, lateIn.id]), null, 'outside the ten minute window is not automatic');
    amount = 105;
    const midnightOut = await candidate(payload('expense', ryt, { transaction_date: '2026-11-18' }), true, '2026-11-18T15:59:00Z');
    const midnightIn = await candidate(payload('income', tng), true, '2026-11-18T16:01:00Z');
    assert.ok((await auto(midnightIn.id)).transfer_id, 'cross-midnight pair can link');

    const rule = (await scalar('select public.finance_internal_transfer_rules($1) as data', [owner]))[0];
    await scalar('select public.finance_internal_transfer_rules($1,\'set\',$2,$3,false) as data', [owner, rule.id, rule.updated_at]);
    amount = 106;
    const disabledOut = await candidate(payload(), true), disabledIn = await candidate(payload('income', tng), true);
    assert.equal(await scalar('select finance_private.auto_link_internal_transfer($1,$2) as data', [owner, disabledIn.id]), null, 'disabled rules do not link');

    // Existing companion suites exercise intake/retry/replay and duplicate invariants.
    const regressions = await createFinanceTestDatabase();
    await regressions.exec("insert into public.dim_modules(modules,name,path,enabled) values('finance','Finance','/finance',true),('companion','Companion','/companion',true) on conflict do nothing;");
    try { for (const file of ['finance_internal_transfers.test.sql', 'finance_duplicate_link.test.sql', 'finance_notification_auto_confirmation.test.sql', 'finance_notifications.test.sql']) {
        await regressions.exec((await financeSqlFile('supabase/tests/' + file)).replace(/^\\.*$/gm, ''));
    } } finally { await regressions.close(); }
    await db.exec('reset role');
    await q('delete from auth.users where id=$1', [owner]);
    assert.equal((await q('select * from public.finance_internal_transfers where user_id=$1', [owner])).length, 0, 'owner retention cascades remove linked entries');
    console.log('Finance transfer linking, accounting, automatic matching and companion regressions passed');
} catch (error) { console.error({ message: error.message, where: error.where, detail: error.detail, actual: error.actual instanceof Error ? error.actual.message : error.actual, expected: error.expected, stack: error.stack?.split('\n').slice(0,3).join('\n') }); process.exitCode = 1; } finally { await db.close(); }
