import { createFinanceTestDatabase, financeSqlFile } from './lib/finance-test-database.mjs';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';

const db = await createFinanceTestDatabase();
const owner = randomUUID(); const other = randomUUID(); const source = randomUUID(); const secondSource = randomUUID();
let sequence = 200;
const query = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => (await query(sql, args))[0]?.data;
const payload = (changes = {}) => ({ amount: ++sequence, currency: 'MYR', direction: 'expense', merchant: 'Synthetic Cafe',
    payee_id: null, payee_name: null, transaction_date: '2026-01-01', source_id: source,
    category_id: null, reference_number: null, notes: null, matched_rule_names: [], ...changes });
async function candidate(p, intakeSource = 'screenshot', user = owner) {
    const intake = (await query("insert into public.finance_intake_items(user_id,source,status) values($1,$2,'review') returning id", [user, intakeSource]))[0].id;
    return (await query('insert into public.finance_candidate_transactions(user_id,intake_item_id,payload,confidence,duplicate_outcome) values($1,$2,$3::jsonb,0.1,\'none\') returning *', [user, intake, JSON.stringify(p)]))[0];
}
async function confirm(c, category, changes = {}, mode = 'manual') {
    const p = { ...c.payload, category_id: category, ...changes };
    return scalar('select public.finance_confirm_candidate_v3($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,false,null,$13) as data',
        [owner, c.id, p.source_id, p.category_id, p.direction, p.amount, p.merchant, p.payee_name, p.transaction_date, p.notes, p.currency, p.reference_number, mode]);
}
const automatic = c => scalar('select public.finance_auto_confirm_screenshot($1,$2) as data', [owner, c.id]);
const memories = () => scalar('select public.finance_category_memory_settings($1) as data', [owner]);
const memoryAction = (memory, action, category = null, active = null, user = owner) => scalar('select public.finance_category_memory_settings($1,$2,$3,$4,$5) as data', [user, action, memory.id, category, active]);
const hash = value => createHash('sha256').update(value).digest('hex');
async function finalization(p, receipt = false) {
    const attempt = randomUUID(); const imageHash = hash(randomUUID());
    const began = await scalar('select public.finance_begin_screenshot_intake_v2($1,$2,$3,$4,180,1) as data', [owner, imageHash, 'screenshot.png', attempt]);
    const intake = began.intake.id;
    const args = [owner, intake, attempt, 'Synthetic OCR', 'Synthetic OCR', 90, imageHash, 1, p.source_id, '[]', JSON.stringify(p), 0.1, null, 'none', 0, '[]', 'None', null];
    if (receipt) args.push(JSON.stringify({ format: 'unknown', detector_version: 1, failed_regions: [], conflicts: [] }));
    const placeholders = args.map((_, i) => `$${i + 1}`).join(',');
    return scalar(`select public.finance_finalize_screenshot_intake_v${receipt ? 3 : 2}(${placeholders}) as data`, args);
}
try {
    await db.exec("insert into public.dim_modules(modules,name,path,enabled) values('finance','Finance','/finance',true),('companion','Companion','/companion',true) on conflict do nothing;");
    await db.exec('begin');
    await query('insert into auth.users(id) values($1),($2)', [owner, other]);
    await query("insert into public.bridge_user_module_overrides(user_id,module_id,effect) select u.id,m.id,'allow' from auth.users u cross join public.dim_modules m where m.modules='finance'", []);
    await query("insert into public.dim_finance_sources(id,user_id,name) values($1,$2,'Ryt'),($3,$2,'TNG')", [source, owner, secondSource]);
    const dining = (await query("insert into public.dim_finance_categories(user_id,name) values($1,'Dining') returning id", [owner]))[0].id;
    const gifts = (await query("insert into public.dim_finance_categories(user_id,name) values($1,'Gifts') returning id", [owner]))[0].id;
    await db.exec('set role service_role');

    const initial = await candidate(payload());
    assert.equal(initial.payload.category_id, null);
    const taught = await confirm(initial, dining);
    assert.equal(taught.confirmed, true);
    assert.equal((await memories())[0].evidence_count, 1);
    await confirm(initial, dining);
    assert.equal((await memories())[0].evidence_count, 1, 'replayed confirmation cannot add teaching evidence');
    const learned = await candidate(payload({ merchant: '  SYNTHETIC  CAFE ', source_id: secondSource }));
    assert.equal(learned.payload.category_id, dining, 'conservative exact normalization works across sources');
    assert.equal(learned.payload.category_assignment.origin, 'learned');
    const saved = await automatic(learned);
    assert.equal(saved.confirmed, true, 'category permits automatic confirmation at low parser confidence without a manual rule');
    assert.equal((await memories())[0].evidence_count, 1, 'automatic entries cannot reinforce category learning');
    const duplicate = await candidate({ ...learned.payload });
    assert.equal((await automatic(duplicate)).confirmed, false, 'locked database duplicate check rejects a duplicate');
    assert.equal((await candidate(payload({ merchant: 'SyntheticCafe' }))).payload.category_id, null, 'word boundaries are preserved');
    assert.equal((await candidate(payload({ merchant: 'Synthetic Cafe Extra' }))).payload.category_id, null, 'no substring match');
    assert.equal((await candidate(payload({ direction: 'income' }))).payload.category_id, null, 'income and expenses have separate memories');

    const notification = await candidate(payload(), 'notification');
    assert.equal(notification.payload.category_id, dining, 'screenshot correction categorizes notification');
    const conflict = await candidate(payload());
    await confirm(conflict, gifts);
    assert.equal((await candidate(payload())).payload.category_id, null, 'conflicting human choices suspend categorization');
    const conflictedMemory = (await memories())[0];
    assert.equal(conflictedMemory.has_conflict, true);
    await memoryAction(conflictedMemory, 'set', dining);
    assert.equal((await candidate(payload())).payload.category_id, dining, 'explicit always-use choice resolves conflict');
    await memoryAction(conflictedMemory, 'set', dining, false);
    const disabled = await candidate(payload());
    assert.equal(disabled.payload.category_id, null);
    await confirm(disabled, dining);
    assert.equal((await memories())[0].is_active, false, 'new teaching does not reactivate disabled memory');
    await memoryAction(conflictedMemory, 'set', dining, true);
    const stale = await candidate(payload());
    await memoryAction(conflictedMemory, 'set', gifts);
    assert.equal((await automatic(stale)).confirmed, false, 'stale learned assignment cannot auto-confirm');
    await db.exec('savepoint expected_error');
    await assert.rejects(() => memoryAction(conflictedMemory, 'forget', null, null, other), error => error.code === 'P0002');
    await db.exec('rollback to savepoint expected_error');
    await memoryAction(conflictedMemory, 'forget');
    assert.equal((await candidate(payload())).payload.category_id, null, 'forgetting removes the teaching evidence');

    const payee = await candidate(payload({ merchant: null, payee_name: 'Alex' }), 'notification');
    const food = payee.payload.category_id;
    assert.ok(food, 'expense payee notification creates/reuses Food');
    assert.equal(payee.payload.category_assignment.origin, 'payee_default');
    assert.equal((await candidate(payload({ merchant: null, payee_name: 'Alex', direction: 'income' }), 'notification')).payload.category_id, null);
    assert.equal((await candidate(payload({ merchant: null, payee_name: 'Alex' }))).payload.category_id, null, 'screenshot payees do not receive the notification fallback');
    assert.equal((await candidate(payload({ merchant: 'Alex', payee_name: null }), 'notification')).payload.category_id, null, 'merchant notifications do not receive the payee fallback');
    assert.equal((await candidate(payload({ category_id: gifts, payee_name: 'Alex' }), 'notification')).payload.category_id, gifts, 'manual category wins over Food');
    const corrected = await confirm(payee, gifts);
    assert.equal(corrected.confirmed, true);
    const payeeScreenshot = await candidate(payload({ merchant: null, payee_name: 'Alex' }));
    assert.equal(payeeScreenshot.payload.category_id, gifts, 'notification correction teaches screenshot payee identity');
    assert.equal((await automatic(payeeScreenshot)).confirmed, true, 'learned payee screenshot confirms automatically');
    const payeeMemory = (await memories()).find(m => m.party_kind === 'payee');
    await memoryAction(payeeMemory, 'set', null, false);
    assert.equal((await candidate(payload({ merchant: null, payee_name: 'Alex' }), 'notification')).payload.category_id, null, 'disabled payee memory is not hidden by Food');
    await memoryAction(payeeMemory, 'set', null, true);
    const payeeId = corrected.transaction.payee_id;
    await query("update public.dim_finance_payees set name='Alex Renamed',normalized_name=finance_private.finance_normalize_payee_key('Alex Renamed') where id=$1", [payeeId]);
    assert.equal((await candidate(payload({ merchant: null, payee_name: 'Alex Renamed' }))).payload.category_id, gifts, 'saved payee identity survives rename');
    assert.equal((await memories()).find(m => m.id === payeeMemory.id).party_name, 'Alex Renamed');

    // Ledger category edits teach the same shared mapping and replace one vote.
    const tx = corrected.transaction;
    await scalar('select to_jsonb(public.finance_update_transaction_v3($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)) as data',
        [owner, tx.id, tx.source_id, dining, tx.direction, tx.amount, tx.merchant, 'Alex Renamed', tx.transaction_date, tx.notes, tx.currency, tx.reference_number]);
    assert.equal((await candidate(payload({ merchant: null, payee_name: 'Alex Renamed' }), 'notification')).payload.category_id, dining);
    const memoryBefore = (await memories()).find(m => m.id === payeeMemory.id);
    assert.equal(memoryBefore.evidence_count, 1, 'editing the same transaction replaces its evidence');
    await scalar('select public.finance_delete_transaction($1,$2) as data', [owner, tx.id]);
    assert.equal((await candidate(payload({ merchant: null, payee_name: 'Alex Renamed' }))).payload.category_id, null, 'deleted transaction cannot support a learned category');

    const direct = await finalization(payload({ category_id: dining, merchant: 'Direct screenshot' }));
    assert.equal(direct.auto_confirmed, true, 'direct screenshot finalization skips Review with a category');
    assert.equal(direct.candidate.status, 'accepted');
    assert.equal(direct.intake.status, 'completed');
    const formatted = await finalization(payload({ category_id: dining, merchant: 'Format screenshot' }), true);
    assert.equal(formatted.auto_confirmed, true, 'format-aware screenshot finalization also skips Review');
    const incomplete = await finalization(payload({ category_id: dining, amount: null, merchant: 'Incomplete screenshot' }));
    assert.equal(incomplete.auto_confirmed, false, 'category cannot replace a missing amount');
    const uncategorized = await finalization(payload({ merchant: 'Unknown screenshot' }));
    assert.equal(uncategorized.auto_confirmed, false);
    const conflicts = await candidate(payload({ category_id: dining, receipt_processing: { format: 'unknown', conflicts: ['direction'], failed_regions: [], detector_version: 1 } }));
    assert.equal((await automatic(conflicts)).confirmed, false, 'receipt field conflicts still require review');
    const badDate = await candidate(payload({ category_id: dining, transaction_date: '2026-02-30' }));
    assert.equal((await automatic(badDate)).confirmed, false);
    const future = await candidate(payload({ category_id: dining, transaction_date: '9999-01-01' }));
    assert.equal((await automatic(future)).confirmed, false);
    const snapshot = await memories();
    assert.equal(snapshot.some(m => m.party_name === 'Direct screenshot'), false, 'automatic screenshot cannot teach categories');

    const rule = (await query("insert into public.finance_rules(user_id,name,match_type,pattern,category_id,source,priority,is_active) values($1,'Manual dining','keyword','cafe',$2,'manual',1,true) returning id", [owner, dining]))[0].id;
    const manual = await candidate(payload({ category_id: dining, category_assignment: { origin: 'manual', rule_id: rule } }));
    await query('update public.finance_rules set is_active=false where id=$1', [rule]);
    assert.equal((await automatic(manual)).confirmed, false, 'disabled manual rules cannot authorize stale screenshot categories');
    const archived = await candidate(payload({ category_id: dining }));
    await scalar('select public.finance_set_category_archived($1,$2,true) as data', [owner, dining]);
    assert.equal((await automatic(archived)).confirmed, false, 'archived categories cannot auto-confirm');
    await scalar('select public.finance_set_category_archived($1,$2,false) as data', [owner, dining]);
    const archivedFood = await candidate(payload({ merchant: null, payee_name: 'Different payee' }), 'notification');
    await scalar('select public.finance_set_category_archived($1,$2,true) as data', [owner, food]);
    assert.equal((await candidate(payload({ merchant: null, payee_name: 'Different payee' }), 'notification')).payload.category_id, null, 'archived Food is not silently restored');
    await scalar('select public.finance_set_category_archived($1,$2,false) as data', [owner, food]);
    assert.equal(archivedFood.payload.category_id, food, 'the same owned Food category is reused');

    // Full notification intake applies the fallback before automatic saving and
    // removes raw text in the same transaction without teaching from the default.
    const device = randomUUID();
    await query('insert into public.companion_devices(id,user_id,token_hash,label) values($1,$2,$3,$4)', [device, owner, hash(randomUUID()), 'Synthetic phone']);
    const inputPayload = payload({ merchant: null, payee_name: 'Default payee', transaction_date: '2026-01-02', notification_extraction: {
        version: 1, fields: {}, conflicts: [], date_provenance: 'notification_text',
    } });
    const event = { client_event_id: randomUUID(), source_id: source, source_package: 'my.rytbank.app',
        captured_at: '2026-01-02T10:00:00Z', notification_key_hash: hash(randomUUID()),
        notification: { title: 'Transfer completed', text: `Sent RM${inputPayload.amount} to Default payee`, subtext: null, posted_at: '2026-01-02T10:00:00Z' } };
    const accepted = await scalar('select public.finance_accept_notification_v2($1,$2,$3::jsonb,$4,$5::jsonb) as data', [owner, device, JSON.stringify(event), hash(JSON.stringify(event)), JSON.stringify({
        status: 'review', date_provenance: 'notification_text', payload: inputPayload,
        duplicate_outcome: 'none', duplicate_score: 0, duplicate_signals: [],
    })]);
    assert.equal(accepted.status, 'completed');
    const notificationTx = (await query('select * from public.finance_transactions where intake_item_id=$1', [accepted.intake_item_id]))[0];
    assert.equal(notificationTx.category_id, food);
    assert.equal((await query('select body from public.finance_notification_events where intake_item_id=$1', [accepted.intake_item_id]))[0].body, null);
    assert.equal((await query('select count(*)::int as n from public.finance_category_evidence where transaction_id=$1', [notificationTx.id]))[0].n, 0);

    await db.exec('reset role');
    for (const role of ['anon', 'authenticated']) {
        assert.equal((await query("select has_table_privilege($1,'public.finance_category_memories','SELECT') as allowed", [role]))[0].allowed, false);
        assert.equal((await query("select has_function_privilege($1,'public.finance_auto_confirm_screenshot(uuid,uuid)','EXECUTE') as allowed", [role]))[0].allowed, false);
        assert.equal((await query("select has_function_privilege($1,'public.finance_category_memory_settings(uuid,text,uuid,uuid,boolean)','EXECUTE') as allowed", [role]))[0].allowed, false);
    }
    await query('delete from auth.users where id=$1', [owner]);
    await db.exec('set constraints all immediate');
    assert.equal((await query('select count(*)::int as n from public.finance_category_memories where user_id=$1', [owner]))[0].n, 0, 'account deletion cascades all memories');
    assert.equal((await query('select count(*)::int as n from public.finance_category_evidence where user_id=$1', [owner]))[0].n, 0, 'account deletion cascades all teaching evidence');
    await db.exec('rollback');
    // Existing notification RPC/cleanup and duplicate-link SQL regression suites.
    for (const file of ['finance_notifications.test.sql', 'finance_duplicate_link.test.sql', 'finance_notification_learning.test.sql', 'finance_notification_auto_confirmation.test.sql']) {
        await db.exec((await financeSqlFile(`supabase/tests/${file}`)).replace(/^\\.*$/gm, ''));
        console.log(`Passed ${file}`);
    }
    console.log('Passed category learning, shared intake, Food fallback, screenshot confirmation, ownership and regression checks.');
} catch (error) {
    console.error(error.message, error.where || '');
    process.exitCode = 1;
} finally {
    await db.close();
}
