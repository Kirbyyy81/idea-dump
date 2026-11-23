import assert from 'node:assert/strict';
import { createFinanceTestDatabase } from './lib/finance-test-database.mjs';
const owner='b0270000-0000-4000-8000-000000000001', source='b0270000-0000-4000-8000-000000000011';
const db=await createFinanceTestDatabase(undefined,{beforeMigration:async(db,name)=>{
 if(!name.endsWith('_finance_notification_notes_editor.sql'))return;
 await db.exec(`insert into auth.users(id) values('${owner}'); insert into public.dim_finance_sources(id,user_id,name) values('${source}','${owner}','Synthetic upgrade');`);
 for(const [index,note] of ['Museum tickets','Transfer lunch'].entries())await db.query(`insert into public.finance_notification_patterns(user_id,source_id,source_package,format_key,name,definition,origin,is_active) values($1,$2,'my.com.tngdigital.ewallet',$3,'Legacy fixture',$4,'learned',$5)`,[owner,source,`legacy-${index}`,JSON.stringify({version:1,parts:[{kind:'amount',field:'amount'},' received from ',{kind:'text',field:'payee_name'},` for ${note}`],direction:'income'}),index===0]);
}});
try {
 const rows=(await db.query('select * from public.finance_notification_patterns_for_user_v2($1,$2) where user_id=$1',[owner,source])).rows;
 assert.equal(rows.length,1);assert.equal(rows[0].format_key,'tng-received-notes');assert.equal(rows[0].is_active,false,'disabled legacy preferences stay conservative');
 assert.deepEqual(rows[0].definition.parts.at(-1),{kind:'notes',field:'notes'});
 const legacy=(await db.query("select * from public.finance_notification_patterns_for_user_v1($1,$2) where user_id=$1 and format_key like 'legacy-%'",[owner,source])).rows;
 assert.equal(legacy.length,2);assert.ok(legacy.every(row=>row.revision===1),'legacy clients and historical evidence keep original definitions');
 console.log('Notification notes upgrade, compatibility and disabled preferences passed.');
} finally {await db.close();}
