-- Isolated migrated database only. Run as the local database owner.
begin;
create function pg_temp.check_final(ok boolean,label text) returns void language plpgsql as $f$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end; $f$;
insert into auth.users(id) values('b5000000-0000-4000-8000-000000000001'),('b5000000-0000-4000-8000-000000000002'),('b5000000-0000-4000-8000-000000000003');
insert into public.dim_modules(id,modules,name,path,enabled,is_always_allowed) values('b5000000-0000-4000-8000-000000000010','finance','Finance','/finance',true,false)
on conflict(modules) do update set enabled=true,is_always_allowed=false;
insert into public.bridge_user_module_overrides(user_id,module_id,effect)
select u.id,m.id,case when u.id='b5000000-0000-4000-8000-000000000003' then 'deny' else 'allow' end
from auth.users u cross join public.dim_modules m where u.id in ('b5000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000002','b5000000-0000-4000-8000-000000000003') and m.modules='finance';
insert into public.dim_finance_sources(id,user_id,name) values('b5000000-0000-4000-8000-000000000004','b5000000-0000-4000-8000-000000000001','Ryt Bank');
insert into public.finance_intake_items(id,user_id,source,status,processing_attempt_id,original_filename,processing_started_at,processing_lease_expires_at,processing_attempt_count,processing_version) values
('b5000000-0000-4000-8000-000000000005','b5000000-0000-4000-8000-000000000001','screenshot','processing','b5000000-0000-4000-8000-000000000006','synthetic.png',clock_timestamp(),clock_timestamp()+interval '5 minutes',1,1);
create function pg_temp.finalize_receipt(
 actor uuid default 'b5000000-0000-4000-8000-000000000001',attempt uuid default 'b5000000-0000-4000-8000-000000000006',
 diagnostics jsonb default '{"format":"ryt_shared_v1","detector_version":1,"failed_regions":[],"conflicts":[]}',hash text default repeat('a',64))
returns jsonb language sql security invoker as $f$
 select public.finance_finalize_screenshot_intake_v3(actor,'b5000000-0000-4000-8000-000000000005',attempt,'original synthetic OCR','Ryt Bank reconstructed synthetic OCR',90,hash,1,
 case when diagnostics->>'format'='unknown' then null else 'b5000000-0000-4000-8000-000000000004'::uuid end,'[]',
 case when diagnostics->>'format'='unknown' then '{}'::jsonb else '{"source_id":"b5000000-0000-4000-8000-000000000004"}'::jsonb end,0.7,null,'none',0,'[]',null,null,diagnostics);
$f$;
set local role service_role;
do $security$ begin
 begin
  perform pg_temp.finalize_receipt(attempt=>'b5000000-0000-4000-8000-000000000099');
  raise exception 'Stale attempt accepted';
 exception when serialization_failure then null; end;
 begin
  perform pg_temp.finalize_receipt(actor=>'b5000000-0000-4000-8000-000000000002',diagnostics=>'{"format":"unknown","detector_version":1,"failed_regions":[],"conflicts":[]}');
  raise exception 'Other owner accepted';
 exception when no_data_found then null; end;
 begin
  perform pg_temp.finalize_receipt(actor=>'b5000000-0000-4000-8000-000000000003');
  raise exception 'Denied module access accepted';
 exception when insufficient_privilege then null; end;
 begin
  perform pg_temp.finalize_receipt(hash=>'invalid');
  raise exception 'Invalid v2 inputs accepted';
 exception when invalid_parameter_value then null; end;
 begin
  perform pg_temp.finalize_receipt(diagnostics=>'{"format":"ryt_shared_v1","detector_version":1,"failed_regions":["arbitrary diagnostic"],"conflicts":[]}');
  raise exception 'Unbounded diagnostic accepted';
 exception when invalid_parameter_value then null; end;
end; $security$;
select pg_temp.check_final((select receipt_format='unknown' and receipt_processing is null and ocr_raw_text is null and status='processing' from public.finance_intake_items),'all failed finalisations roll back format and OCR together');
select pg_temp.check_final(not exists(select 1 from public.finance_candidate_transactions),'failed finalisation creates no candidate');
reset role;
update public.finance_intake_items set receipt_format_eligible=false;
set local role service_role;
do $historical$ begin
 begin perform pg_temp.finalize_receipt(); raise exception 'Historical format accepted'; exception when check_violation then null; end;
end; $historical$;
reset role;
update public.finance_intake_items set receipt_format_eligible=true;
set local role service_role;
select pg_temp.check_final(pg_temp.finalize_receipt()->>'state'='review','trusted worker finalises through v3');
select pg_temp.check_final((select receipt_format='ryt_shared_v1' and receipt_detector_version=1 and ocr_raw_text='original synthetic OCR' and ocr_normalized_text='Ryt Bank reconstructed synthetic OCR' and status='review' from public.finance_intake_items),'OCR and format metadata persist together');
select pg_temp.check_final((select c.payload->'receipt_processing'=i.receipt_processing from public.finance_candidate_transactions c join public.finance_intake_items i on i.id=c.intake_item_id),'candidate and intake share identical diagnostics');
-- A retry after a lost response returns the durable result without changing metadata.
select pg_temp.check_final(pg_temp.finalize_receipt(attempt=>'b5000000-0000-4000-8000-000000000099',diagnostics=>'{"format":"unknown","detector_version":1,"failed_regions":[],"conflicts":[]}')->>'recovered'='true','terminal retry is idempotent');
select pg_temp.check_final((select count(*)=1 from public.finance_candidate_transactions),'terminal retry does not duplicate candidate');
select pg_temp.check_final((select receipt_format='ryt_shared_v1' from public.finance_intake_items),'terminal retry preserves original format');
update public.dim_finance_sources set is_archived=true;
select pg_temp.check_final(pg_temp.finalize_receipt()->>'recovered'='true','retry still returns the durable result after its source is archived');
reset role;
rollback;
