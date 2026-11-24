import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFinanceTestDatabase, financeSqlFile } from './lib/finance-test-database.mjs';

const db = await createFinanceTestDatabase();
const [owner, other, bank, wallet, food, shopping, trip, gifts, alienTag, expense, income, device] =
    Array.from({ length: 12 }, randomUUID);
const sql = async (query, args = []) => (await db.query(query, args)).rows;
const value = async (query, args = []) => (await sql(query, args))[0]?.value;
const snapshot = (id = expense, user = owner) => value('select public.finance_get_transaction_split($1,$2) value', [user, id]);
const write = (version, parts, id = expense, user = owner) => sql(
    'select public.finance_save_transaction_split($1,$2,$3,$4)', [user, id, version, parts && JSON.stringify(parts)],
);
const part = (amount, category_id = null, tag_ids = [], notes = null) => ({ amount, category_id, tag_ids, notes });
const setupBudget = async (config, asOf) => {
    const result = await value('select public.finance_budget_mutate($1,\'create\',null,null,gen_random_uuid(),$2,$3) value',
        [owner, JSON.stringify({
            name: 'Synthetic split budget', amount: '500.00', cycle_type: 'one_time', start_date: null, time_zone: 'Asia/Kuala_Lumpur',
            filter_logic: 'and', include_uncategorised: false, source_ids: [], category_ids: [], tag_ids: [], ...config,
        }), asOf]);
    return result;
};

try {
    await db.exec(await financeSqlFile('supabase/tests/finance_split_transaction_edit.test.sql'));
    console.log('Original payment editing passed: atomic allocations, stale versions, ownership, rollback and frozen budgets.');
    const day = await value("select (now() at time zone 'Asia/Kuala_Lumpur')::date::text value");
    const asOf = new Date().toISOString();
    await sql("insert into public.dim_modules(modules,name,path,enabled) values('finance','Finance','/finance',true),('companion','Companion','/companion',true) on conflict do nothing");
    await sql('insert into auth.users(id) values($1),($2)', [owner, other]);
    await sql("insert into public.bridge_user_module_overrides(user_id,module_id,effect) select $1,id,'allow' from public.dim_modules where modules in ('finance','companion')", [owner]);
    await sql("insert into public.dim_finance_sources(id,user_id,name) values($1,$2,'Test Bank'),($3,$2,'Test Wallet')", [bank, owner, wallet]);
    await sql("insert into public.dim_finance_categories(id,user_id,name) values($1,$2,'Food'),($3,$2,'Shopping')", [food, owner, shopping]);
    await sql("insert into public.dim_finance_tags(id,user_id,name) values($1,$2,'Trip'),($3,$2,'Gift'),($4,$5,'Other owner')", [trip, owner, gifts, alienTag, other]);
    await sql(`insert into public.finance_transactions(id,user_id,source_id,category_id,direction,amount,merchant,transaction_date,reference_number,notes,foreign_currency,foreign_amount)
        values($1,$2,$3,$4,'expense',34.32,'Synthetic Cafe',$5,'BANK-3432','Original notes','TWD',250),
              ($6,$2,$7,null,'income',34.32,'Synthetic payer',$5,'BANK-IN',null,null,null)`, [expense, owner, bank, food, day, income, wallet]);
    await sql('insert into public.finance_transaction_tags(transaction_id,user_id,tag_id) values($1,$2,$3)', [expense, owner, trip]);
    await sql("insert into public.companion_devices(id,user_id,token_hash,label) values($1,$2,repeat('c',64),'Synthetic phone')", [device, owner]);

    await db.exec('set role authenticated');
    await assert.rejects(snapshot(), /permission denied/);
    await assert.rejects(sql('select * from public.finance_ledger_entries'), /permission denied/);
    await db.exec('reset role; set role service_role');
    const original = await snapshot();
    assert.equal(await snapshot(expense, other), null);
    await assert.rejects(write(original.version, [part('20.00'), part('14.32')], expense, other), /Payment not found/);
    await assert.rejects(write(original.version, [part('1'), part('2'), part('3'), part('28.32')]), /two or three/);
    await assert.rejects(write(original.version, [part('20.00'), part('14.31')]), /add up/);
    await assert.rejects(write(original.version, [part('20.00'), part('14.32', shopping, [alienTag])]), /valid tags/);
    assert.deepEqual(await snapshot(), original, 'invalid writes preserve the original and roll back all allocations');

    const matchingBudget = await setupBudget({
        source_ids: [bank], category_ids: [food], tag_ids: [gifts],
        filter_group: { dimensions: ['category', 'tag'], logic: 'or' },
    }, asOf);
    const frozenBudget = await setupBudget({ name: 'Synthetic frozen budget', category_ids: [food] }, asOf);
    await sql("select public.finance_budget_mutate($1,'archive',$2,revision,gen_random_uuid(),null,$3) from public.finance_budgets where id=$2", [owner, frozenBudget, asOf]);
    const frozen = () => value("select to_jsonb(c) value from public.finance_budget_cycles c where budget_id=$1 and frozen_at is not null", [frozenBudget]);
    const frozenBefore = await frozen();
    assert.ok(frozenBefore);

    await write(original.version, [part('20.00', food, [trip, gifts], 'Meal'), part('14.32', shopping, [], 'Souvenir')]);
    const split = await snapshot();
    assert.equal(split.parts.length, 2);
    assert.deepEqual(split.payment, original.payment);
    await assert.rejects(write(original.version, [part('20'), part('14.32')]), /Payment changed/);
    await assert.rejects(sql('update public.finance_transactions set amount=1 where id=$1', [expense]), /Remove the split/);
    await assert.rejects(sql('select public.finance_delete_transaction($1,$2)', [owner, expense]), /Remove the split/);
    await assert.rejects(sql("select public.finance_bulk_transaction_tags($1,array[$2]::uuid[],array[$3]::uuid[],'remove')", [owner, expense, trip]), /Edit the split/);
    await assert.rejects(sql('update finance_private.transaction_split_parts set amount=3 where id=$1', [split.parts[0].id]), /Invalid split allocation/);
    assert.equal((await sql('select * from finance_private.transfer_entries($1) where id=$2', [owner, expense])).length, 0);

    const ledger = await sql("select id,amount::text,category_id,direction,reference_number,source_id,split_payment_id,foreign_amount,tags from public.finance_ledger_entries where user_id=$1 order by amount", [owner]);
    assert.deepEqual(ledger.map(row => row.amount), ['14.32', '20.00', '34.32']);
    assert.equal(ledger[0].split_payment_id, expense);
    assert.equal(ledger[0].category_id, shopping);
    assert.equal(ledger[1].category_id, food);
    assert.equal(ledger[0].foreign_amount, null);
    assert.equal(ledger[0].reference_number, 'BANK-3432');
    assert.equal(ledger[1].source_id, bank);
    assert.equal(ledger[1].tags.length, 2);
    assert.equal(await value("select sum(amount)::text value from public.finance_ledger_entries where user_id=$1 and direction='expense'", [owner]), '34.32');
    assert.deepEqual((await sql("select id from public.finance_tagged_ledger_entries($1,array[$2,$3]::uuid[],'include')", [owner, trip, gifts])).map(row => row.id), [split.parts[0].id]);
    assert.deepEqual((await sql("select id from public.finance_tagged_ledger_entries($1,array[$2]::uuid[],'exclude') order by amount", [owner, trip])).map(row => row.id), [split.parts[1].id, income]);
    const matched = await sql('select id,amount::text from public.finance_budget_matching($1,$2,null,null)', [owner, matchingBudget]);
    assert.deepEqual(matched, [{ id: split.parts[0].id, amount: '20.00' }]);
    const detail = await value('select public.finance_budget_detail($1,$2) value', [owner, matchingBudget]);
    assert.equal(detail.transactions.data[0].split_payment_id, expense);
    assert.deepEqual(await frozen(), frozenBefore);
    assert.equal(await value('select count(*)::int value from public.finance_category_evidence where transaction_id=$1', [expense]), 0);

    const posted = new Date().toISOString();
    const event = { client_event_id: randomUUID(), source_id: bank, source_package: 'my.rytbank.app',
        notification_key_hash: '9'.repeat(64), captured_at: posted,
        notification: { title: 'Card payment completed', text: 'RM34.32 paid at Synthetic Cafe using your Main Account.', posted_at: posted } };
    const parsed = { status: 'review', date_provenance: 'posted_at', duplicate_outcome: 'none', duplicate_score: 0, duplicate_signals: [],
        payload: { source_id: bank, amount: 34.32, currency: 'MYR', direction: 'expense',
            merchant: 'Synthetic Cafe', transaction_date: day, reference_number: 'BANK-3432',
            notification_extraction: { version: 1, conflicts: [], date_provenance: 'posted_at',
                fields: { amount: { pattern_id: '52000000-0000-4000-8000-000000000008', revision: 1, learned: false } } } } };
    const reimport = await value('select public.finance_accept_notification_v2($1,$2,$3,$4,$5) value',
        [owner, device, JSON.stringify(event), 'c'.repeat(64), JSON.stringify(parsed)]);
    assert.equal(reimport.status, 'review');
    assert.equal(await value('select payload->>\'duplicate_transaction_id\' value from public.finance_candidate_transactions where id=$1', [reimport.candidate_id]), expense);

    await write(split.version, [part('10', food), part('14.32', shopping), part('10', food)]);
    const triple = await snapshot();
    assert.equal(triple.parts.length, 3);
    assert.equal(triple.parts[0].id, split.parts[0].id);
    await write(triple.version, [part('20', food), part('14.32', shopping)]);
    assert.equal((await snapshot()).parts.length, 2);
    await write((await snapshot()).version, null);
    const restored = await snapshot();
    assert.deepEqual(restored.payment, original.payment);
    assert.equal(restored.parts.length, 0);
    await assert.rejects(write(original.version, [part('20'), part('14.32')]), /Payment changed/);

    const originalIncome = await snapshot(income);
    await write(originalIncome.version, [part('15'), part('9.32'), part('10')], income);
    const incomeSplit = await snapshot(income);
    assert.equal(incomeSplit.parts.length, 3);
    assert.equal(await value("select sum(amount)::text value from public.finance_ledger_entries where user_id=$1 and direction='income'", [owner]), '34.32');
    await write(incomeSplit.version, [part('15'), part('19.32')], income);
    assert.equal((await snapshot(income)).parts.length, 2);
    await write((await snapshot(income)).version, null, income);

    const reference = async id => value("select finance_private.transfer_entry($1,'transaction',$2) value", [owner,id]);
    await sql('select public.finance_link_internal_transfer($1,$2,$3,$4)', [owner, JSON.stringify(await reference(expense)), JSON.stringify(await reference(income)), false]);
    await assert.rejects(write((await snapshot()).version, [part('20'), part('14.32')]), /Internal transfers cannot be split/);
    console.log('Finance splits passed: exact allocation, isolation, rollback, stale versions, filters, budgets, duplicate import and transfer guards.');
} finally {
    await db.close();
}
