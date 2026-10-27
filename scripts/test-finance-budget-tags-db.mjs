import assert from 'node:assert/strict';
import { createFinanceTestDatabase, financeSqlFile } from './lib/finance-test-database.mjs';
let frozenBefore;
const upgradeOwner = 'b0230000-0000-4000-8000-000000000001';
const db = await createFinanceTestDatabase(undefined, { beforeMigration: async (database, name) => {
    if (!name.endsWith('_finance_budget_tags_and_one_time.sql')) return;
    await database.exec(`
        insert into auth.users(id) values('${upgradeOwner}');
        insert into public.dim_finance_sources(id,user_id,name) values('b0230000-0000-4000-8000-000000000011','${upgradeOwner}','Synthetic upgrade bank');
        insert into public.finance_transactions(user_id,source_id,direction,amount,transaction_date,status)
        values('${upgradeOwner}','b0230000-0000-4000-8000-000000000011','expense',37.25,'2026-09-14','confirmed');
        select public.finance_budget_mutate('${upgradeOwner}','create',null,null,gen_random_uuid(),
         '{"name":"Synthetic upgrade budget","amount":"100.00","cycle_type":"weekly","start_date":"2026-09-14","custom_days":null,"anchor_day":null,
           "time_zone":"Asia/Kuala_Lumpur","filter_logic":"and","include_uncategorised":false,"source_ids":[],"category_ids":[]}', '2026-09-14T04:00:00Z');
        select public.finance_budget_reconcile('${upgradeOwner}',id,'2026-09-22T04:00:00Z') from public.finance_budgets where user_id='${upgradeOwner}';
    `);
    frozenBefore = (await database.query(`select to_jsonb(c) row from public.finance_budget_cycles c where user_id='${upgradeOwner}' and frozen_at is not null order by id`)).rows;
    assert.equal(frozenBefore.length, 1);
} });
try {
    const frozenAfter = (await db.query(`select to_jsonb(c) row from public.finance_budget_cycles c where user_id='${upgradeOwner}' and frozen_at is not null order by id`)).rows;
    assert.deepEqual(frozenAfter, frozenBefore, 'Forward migration preserves every frozen field and settings snapshot');
    await db.exec(`delete from auth.users where id='${upgradeOwner}'`);
    await db.exec(await financeSqlFile('supabase/tests/finance_budget_tags_one_time.test.sql'));
    process.stdout.write('Passed tag-only budgets, one-time lifecycle, ownership, matching, dashboard visibility and frozen history.\n');
} finally { await db.close(); }
