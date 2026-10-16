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
 const counts=await checked("select (select count(*) from public.finance_transactions where user_id="+literal(owner)+")||','||(select count(*) from public.finance_notification_patterns where user_id="+literal(owner)+");");
 if(counts!=='1,1') throw new Error('Expected exactly one transaction and one saved pattern');
 const autoDate=await checked("select (now() at time zone 'Asia/Kuala_Lumpur')::date;");
 const autoParsed={status:'review',date_provenance:'posted_at',duplicate_outcome:'none',payload:{source_id:source,amount:777.77,direction:'expense',merchant:'Synthetic concurrent cafe',currency:'MYR',transaction_date:autoDate,
  notification_extraction:{version:1,fields:{amount:{pattern_id:'52000000-0000-4000-8000-000000000008',revision:1,learned:false}},conflicts:[],date_provenance:'posted_at'}}};
 const uploads=[randomUUID(),randomUUID()].map(id=>"set role service_role; select public.finance_accept_notification_v2("+[owner,device,JSON.stringify({...event,client_event_id:id,source_package:'my.rytbank.app'}),'e'.repeat(64),JSON.stringify(autoParsed)].map(literal).join(',')+');');
 const automatic=await Promise.all(uploads.map(sql=>checked(sql).then(text=>JSON.parse(text))));
 if(automatic.map(r=>r.status).sort().join(',')!=='completed,review') throw new Error('Concurrent duplicate auto-add was not stopped');
 const replayed=JSON.parse(await checked(uploads[0]));
 if(!replayed.replayed||replayed.status!==automatic[0].status) throw new Error('Automatic upload replay changed the result');
 const autoCounts=await checked("select (select count(*) from public.finance_transactions where user_id="+literal(owner)+")||','||(select count(*) from public.finance_notification_patterns where user_id="+literal(owner)+");");
 if(autoCounts!=='2,1') throw new Error('Automatic intake added duplicate transactions or saved patterns');
 const category=randomUUID();
 await checked('insert into public.dim_finance_categories(id,user_id,name) values('+literal(category)+','+literal(owner)+",'Concurrency category');");
 const screenshotPayload={source_id:source,category_id:category,amount:888.88,direction:'expense',merchant:'Synthetic concurrent screenshot',
  currency:'MYR',transaction_date:autoDate,payee_name:null,notes:null,reference_number:null};
 async function screenshotCandidate(payload) {
  return checked("with intake as (insert into public.finance_intake_items(user_id,source,status) values("+literal(owner)+",'screenshot','review') returning id) "+
   "insert into public.finance_candidate_transactions(user_id,intake_item_id,payload,confidence) select "+literal(owner)+",id,"+literal(JSON.stringify(payload))+"::jsonb,0.1 from intake returning id;");
 }
 const screenshots=await Promise.all([screenshotCandidate(screenshotPayload),screenshotCandidate(screenshotPayload)]);
 const screenshotResults=await Promise.all(screenshots.map(id=>checked('set role service_role; select public.finance_auto_confirm_screenshot('+literal(owner)+','+literal(id)+');').then(JSON.parse)));
 if(screenshotResults.filter(r=>r.confirmed).length!==1) throw new Error('Concurrent screenshots bypassed the locked duplicate check');
 const teachingCandidate=await screenshotCandidate({...screenshotPayload,category_id:null,amount:999.99,merchant:'Synthetic teaching cafe'});
 const teachingConfirm='set role service_role; select public.finance_confirm_candidate_v3('+[owner,teachingCandidate,source,category,'expense'].map(literal).join(',')+
  ",999.99,'Synthetic teaching cafe',null,"+literal(autoDate)+",null,'MYR',null,false,null,'manual');";
 const teaching=await Promise.all([checked(teachingConfirm).then(JSON.parse),checked(teachingConfirm).then(JSON.parse)]);
 if(teaching[0].transaction.id!==teaching[1].transaction.id) throw new Error('Concurrent teaching confirmation created duplicate ledger entries');
 const categoryCounts=await checked("select (select count(*) from public.finance_transactions where user_id="+literal(owner)+")||','||(select count(*) from public.finance_category_evidence where user_id="+literal(owner)+");");
 if(categoryCounts!=='4,1') throw new Error('Expected four ledger entries with exactly one deliberate category teaching example');
 process.stdout.write('Notification/screenshot locks, concurrent confirmation, category teaching, duplicate prevention and replay checks passed.\n');
} finally {
 if(created) await checked('delete from auth.users where id='+literal(owner)+';');
}
