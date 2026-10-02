import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const raw=process.env.COMPANION_TEST_DATABASE_URL;
if(process.env.COMPANION_ALLOW_LOCAL_DB_TESTS!=='1'||!raw) throw new Error('Isolated database opt-in required');
const url=new URL(raw);
if(!['postgres:','postgresql:'].includes(url.protocol)||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)) throw new Error('Only loopback databases are allowed');
const env={...process.env,PGHOST:url.hostname.replace(/^\[|\]$/g,''),PGPORT:url.port||'5432',PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password)};
const literal=value=>"'"+String(value).replace(/'/g,"''")+"'";
function run(sql,onReady) {
 return new Promise((resolve,reject)=>{
  const child=spawn(process.env.PSQL_PATH||'psql',['-X','-qAt','-v','ON_ERROR_STOP=1'],{env,windowsHide:true});
  let output='',error='',ready=false;
  child.stdout.on('data',chunk=>{output+=chunk;if(!ready&&output.includes('NOTIFICATION_LOCK_READY')){ready=true;onReady?.();}});
  child.stderr.on('data',chunk=>{error+=chunk;});
  child.on('error',reject);child.on('close',code=>resolve({code,output,error}));child.stdin.end(sql);
 });
}
async function checked(sql) {
 const result=await run(sql);
 if(result.code!==0) throw new Error(result.error);
 return result.output.trim();
}
const owner=randomUUID(),source=randomUUID(),device=randomUUID(),client=randomUUID();
let created=false;
try {
 await checked('insert into auth.users(id) values('+literal(owner)+');');created=true;
 const event={client_event_id:client,source_id:source,source_package:'my.com.tngdigital.ewallet',notification_key_hash:'c'.repeat(64),
 captured_at:'2026-10-02T00:00:00Z',notification:{title:'TNG',text:'Alex has transferred RM25.90 to you.',subtext:null,posted_at:'2026-10-02T00:00:00Z'}};
 const parsed={status:'review',date_provenance:'posted_at',payload:{source_id:source,amount:25.9,direction:'income',currency:'MYR',matched_rule_names:[]}};
 const setup=[
 "insert into public.bridge_user_module_overrides(user_id,module_id,effect) select "+literal(owner)+",id,'allow' from public.dim_modules where modules='finance';",
 'insert into public.dim_finance_sources(id,user_id,name) values('+literal(source)+','+literal(owner)+",'Synthetic concurrency source');",
 'insert into public.companion_devices(id,user_id,token_hash,label) values('+literal(device)+','+literal(owner)+','+literal(randomUUID().replaceAll('-','').repeat(2))+",'Synthetic concurrency device');",
 'select public.finance_accept_notification_v1('+[owner,device,JSON.stringify(event),'d'.repeat(64),JSON.stringify(parsed)].map(literal).join(',')+');',
 ].join('\n');
 const accepted=JSON.parse((await checked(setup)).split('\n').at(-1));
 const candidate=accepted.candidate_id;
 const args={p_source_id:source,p_category_id:null,p_direction:'income',p_amount:25.9,p_merchant:null,p_payee_name:'Alex',p_notes:null,p_currency:'MYR',p_reference_number:null,p_allow_duplicate:false,p_duplicate_override_reason:null,p_confirmation_mode:'manual'};
 const pattern={format_key:'concurrency-transfer',name:'Reviewed transfer',definition:{version:1,parts:[{kind:'text',field:'payee_name'},' has transferred ',{kind:'amount',field:'amount'},' to you'],direction:'income'}};
 const confirm='set role service_role; select public.finance_confirm_notification_v1('+[owner,candidate,'d'.repeat(64)].map(literal).join(',')+','+literal(JSON.stringify(args))+"::jsonb || jsonb_build_object('p_transaction_date',current_date),"+literal(JSON.stringify(pattern))+'::jsonb);';
 let signal;const ready=new Promise(resolve=>{signal=resolve;});
 const holding=run('begin; select id from public.finance_candidate_transactions where id='+literal(candidate)+" for update; select 'NOTIFICATION_LOCK_READY'; select pg_sleep(3); rollback;",signal);
 const first=await Promise.race([ready.then(()=>true),holding.then(()=>false)]);
 if(!first) throw new Error('Could not hold candidate lock');
 const conflict=await run(confirm);
 if(conflict.code===0||!conflict.error.includes('Retry the action')) throw new Error('Concurrent row lock was not handled safely');
 await holding;
 const results=await Promise.all([run(confirm),run(confirm)]);
 if(results.some(r=>r.code!==0)) throw new Error('Concurrent confirmation failed: '+results.map(r=>r.error).join(' '));
 const ids=results.map(r=>JSON.parse(r.output.trim().split('\n').at(-1)).transaction.id);
 if(ids[0]!==ids[1]) throw new Error('Replay created a second ledger row');
 const counts=await checked("select (select count(*) from public.finance_transactions where user_id="+literal(owner)+")||','||(select count(*) from public.finance_notification_learning_reviews where user_id="+literal(owner)+");");
 if(counts!=='1,1') throw new Error('Expected exactly one transaction and one learning event');
 process.stdout.write('Notification lock conflict, concurrent confirmation and replay checks passed.\n');
} finally {
 if(created) await checked('delete from auth.users where id='+literal(owner)+';');
}
