import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createFinanceTestDatabase } from './lib/finance-test-database.mjs';
const db = await createFinanceTestDatabase();
const owner=randomUUID(), other=randomUUID(), source=randomUUID(), category=randomUUID();
const q=async (sql,args=[]) => (await db.query(sql,args)).rows;
const scalar=async (sql,args=[]) => (await q(sql,args))[0]?.v;
async function rejected(work) { await db.exec('savepoint expected'); await assert.rejects(work); await db.exec('rollback to expected'); }
try {
    await db.exec("insert into public.dim_modules(modules,name,path,enabled) values('finance','Finance','/finance',true) on conflict do nothing; begin;");
    await q('insert into auth.users(id) values($1),($2)',[owner,other]);
    await db.exec("insert into public.bridge_user_module_overrides(user_id,module_id,effect) select u.id,m.id,'allow' from auth.users u cross join public.dim_modules m where m.modules='finance'");
    await q("insert into public.dim_finance_sources(id,user_id,name) values($1,$2,'Bank')",[source,owner]);
    await q("insert into public.dim_finance_categories(id,user_id,name) values($1,$2,'Shopping')",[category,owner]);
    await db.exec('set role service_role');
    const tag=await scalar("select to_jsonb(public.finance_save_tag($1,null,'Trip')) v",[owner]);
    assert.equal((await scalar("select to_jsonb(public.finance_save_tag($1,null,' trip ')) v",[owner])).id,tag.id);
    const tag2=await scalar("select to_jsonb(public.finance_save_tag($1,null,'Reimbursable')) v",[owner]);
    const foreign=await scalar("select to_jsonb(public.finance_save_tag($1,null,'Private')) v",[other]);
    const input={p_source_id:source,p_category_id:category,p_direction:'expense',p_amount:70,p_merchant:'PINDUODUO',p_payee_name:null,p_transaction_date:'2026-01-01',p_notes:null,p_currency:'MYR',p_reference_number:null,p_manual_idempotency_key:randomUUID(),p_tag_ids:[tag.id,tag2.id]};
    const save=(body=input,id=null,user=owner)=>scalar('select to_jsonb(public.finance_save_tagged_transaction($1,$2::jsonb,$3)) v',[user,JSON.stringify(body),id]);
    const tx=await save(); assert.ok(tx.id);
    assert.equal((await save()).id,tx.id,'same request replays without duplicates');
    await rejected(()=>save({...input,p_tag_ids:[tag.id]}));
    await rejected(()=>save({...input,p_amount:999,p_tag_ids:[foreign.id]},tx.id));
    assert.equal(Number(await scalar('select amount v from public.finance_transactions where id=$1',[tx.id])),70,'tag validation rolls back the financial edit');
    assert.equal((await q('select * from public.finance_transaction_tags where transaction_id=$1',[tx.id])).length,2,'invalid edit rolls back both assignments and transaction');
    await save({...input,p_notes:'Edited'},tx.id);
    const untagged={...input,p_notes:'Edited'};delete untagged.p_tag_ids;
    await save(untagged,tx.id);
    assert.equal((await q('select * from public.finance_transaction_tags where transaction_id=$1',[tx.id])).length,2,'omitting tags preserves them');
    const count=(ids,mode='include',user=owner)=>scalar('select count(*)::int v from public.finance_tagged_transactions($1,$2,$3)',[user,ids,mode]);
    assert.equal(await count([tag.id,tag2.id]),1,'multiple matches count once');
    assert.equal(await count([tag.id],'exclude'),0);
    assert.equal(await count([tag.id],'include',other),0,'cross-user filtering cannot expose transactions');
    const second=await save({...input,p_amount:71,p_manual_idempotency_key:randomUUID(),p_tag_ids:[]});
    assert.equal(await count([tag.id],'exclude'),1,'untagged transactions remain in exclude results');
    await scalar('select to_jsonb(public.finance_save_tag($1,$2,null,true)) v',[owner,tag.id]);
    await save({...input,p_notes:'Archived retained'},tx.id);
    assert.equal(await count([tag.id]),1,'archived tags remain filterable');
    await rejected(()=>save({...input,p_tag_ids:[tag.id]},second.id));
    await rejected(()=>save({...input,p_manual_idempotency_key:randomUUID(),p_tag_ids:[foreign.id]}));
    assert.equal(await scalar('select count(*)::int v from public.finance_transactions where user_id=$1',[owner]),2,'failed create leaves no financial row');
    const bulk=(ids,tags,op='add')=>scalar('select public.finance_bulk_transaction_tags($1,$2,$3,$4) v',[owner,ids,tags,op]);
    await q('select finance_private.teach_category($1,$2)',[owner,tx.id]);
    const before=await q('select transaction_id,category_id from public.finance_category_evidence where user_id=$1',[owner]);
    await bulk([tx.id,second.id],[tag2.id]);
    assert.equal(await count([tag2.id]),2);
    assert.deepEqual(await q('select transaction_id,category_id from public.finance_category_evidence where user_id=$1',[owner]),before,'tag-only edits do not teach categories');
    await rejected(()=>bulk([tx.id,randomUUID()],[tag2.id],'remove'));
    assert.equal(await count([tag2.id]),2,'bulk failure is atomic');
    await bulk([tx.id],[tag.id],'remove');
    await scalar('select to_jsonb(public.finance_save_tag($1,$2,null,false)) v',[owner,tag.id]);
    await bulk([second.id],[tag.id]);
    await save({...input,p_tag_ids:[]},tx.id);
    assert.equal((await q('select * from public.finance_transaction_tags where transaction_id=$1',[tx.id])).length,0,'empty array clears assignments');
    for (const role of ['anon','authenticated']) {
        assert.equal(await scalar("select has_table_privilege($1,'public.dim_finance_tags','SELECT') v",[role]),false);
        assert.equal(await scalar("select has_table_privilege($1,'public.finance_transaction_tags','INSERT') v",[role]),false);
        assert.equal(await scalar("select has_function_privilege($1,'public.finance_bulk_transaction_tags(uuid,uuid[],uuid[],text)','EXECUTE') v",[role]),false);
    }
    await db.exec('reset role');
    await q('delete from auth.users where id=$1',[owner]);
    assert.equal(await scalar('select count(*)::int v from public.finance_transaction_tags where user_id=$1',[owner]),0);
    await db.exec('rollback');
    console.log('Passed Finance tags: ownership, archive/restore, atomic saves, replay, filtering, bulk edits, learning isolation and cascades.');
} catch(error) { console.error(error.message,error.where || '',error.stack);process.exitCode=1; }
finally {await db.close();}
