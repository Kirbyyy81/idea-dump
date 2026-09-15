-- Isolated migrated database only. Synthetic fixtures are rolled back.
begin;
create function pg_temp.check_format(ok boolean,label text) returns void language plpgsql as $f$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end; $f$;
insert into auth.users(id) values('b4000000-0000-4000-8000-000000000001');
insert into public.dim_finance_sources(id,user_id,name) values('b4000000-0000-4000-8000-000000000002','b4000000-0000-4000-8000-000000000001','Ryt Bank');
select public.finance_set_parser_learning_cutoff('b4000000-0000-4000-8000-000000000001','2026-09-08T00:00:00Z');
create function pg_temp.format_fixture(n int,fmt text,observed uuid default null) returns void language plpgsql as $f$
declare intake uuid:=md5('format-intake-'||n)::uuid; tx uuid:=md5('format-tx-'||n)::uuid;
begin
 insert into public.finance_intake_items(id,user_id,source,status,created_at,original_filename,ocr_normalized_text,receipt_format)
 values(intake,'b4000000-0000-4000-8000-000000000001','screenshot','completed','2026-09-09T00:00:00Z','Ryt Bank.png','Order ID: SYN-'||n,fmt);
 insert into public.finance_transactions(id,user_id,source_id,status,direction,amount,transaction_date,source,reference_number,intake_item_id)
 values(tx,'b4000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000002','confirmed','expense',17.25,'2026-09-09','screenshot','SYN-'||n,intake);
 insert into public.finance_candidate_transactions(id,user_id,confirmed_transaction_id,intake_item_id,status,created_at,payload)
 values(md5('format-candidate-'||n)::uuid,'b4000000-0000-4000-8000-000000000001',tx,intake,'accepted',clock_timestamp(),
 case when observed is null then '{}'::jsonb else jsonb_build_object('parser_template_evaluations',jsonb_build_array(jsonb_build_object(
 'template_id',observed,'algorithm_version',2,'template_version',1,'status','shadow','outcome','shadow','value_hash',public.finance_template_value_hash_v2('reference_number','SYN-'||n)))) end);
 insert into public.finance_corrections(id,user_id,transaction_id,intake_item_id,field_name,previous_value,corrected_value)
 values(gen_random_uuid(),'b4000000-0000-4000-8000-000000000001',tx,intake,'reference_number','"WRONG"',to_jsonb('SYN-'||n));
end; $f$;
select pg_temp.format_fixture(n,'unknown') from generate_series(1,3) n;
select public.finance_refresh_rule_suggestions();
select pg_temp.check_format(not exists(select 1 from public.finance_parser_templates where field_name='reference_number'),'historical unknown Ryt evidence cannot propose field rules');
select pg_temp.check_format(exists(select 1 from public.finance_parser_templates where field_name='source_id' and scope_receipt_format is null),'source rules remain unscoped');
select pg_temp.format_fixture(n,'ryt_shared_v1') from generate_series(4,6) n;
select pg_temp.format_fixture(n,'ryt_screenshot_v1') from generate_series(7,9) n;
select public.finance_refresh_rule_suggestions();
select pg_temp.check_format((select count(*)=2 from public.finance_parser_templates where algorithm_version=2 and field_name='reference_number'),'identical configurations have separate identities per format');
select pg_temp.check_format((select bool_and(status='shadow' and evidence_count=3 and contradiction_count=0) from public.finance_parser_templates where algorithm_version=2 and field_name='reference_number'),'each format enters shadow using only its three observations');
select pg_temp.check_format(not exists(select 1 from public.finance_template_evidence e join public.finance_parser_templates t on t.id=e.template_id join public.finance_intake_items i on i.id=e.intake_item_id where t.field_name='reference_number' and t.scope_receipt_format<>i.receipt_format),'cross-format evidence is excluded');
select pg_temp.check_format(not exists(select 1 from public.finance_parser_templates t where t.field_name='reference_number' and public.finance_parser_template_can_promote_v2(t.id)),'historical evidence cannot promote');
do $immutability$ begin
 begin
  update public.finance_parser_templates set scope_receipt_format=null where algorithm_version=2 and field_name='reference_number';
  raise exception 'Scope mutation was accepted';
 exception when check_violation then null; end;
end; $immutability$;
-- A screenshot correction must not contradict the shared format rule.
update public.finance_transactions set reference_number='CHANGED' where id=md5('format-tx-7')::uuid;
select public.finance_refresh_rule_suggestions();
select pg_temp.check_format((select status='shadow' and contradiction_count=0 from public.finance_parser_templates where algorithm_version=2 and field_name='reference_number' and scope_receipt_format='ryt_shared_v1'),'screenshot contradiction does not contaminate shared rule');
select pg_temp.check_format((select status='rejected' and contradiction_count=1 from public.finance_parser_templates where algorithm_version=2 and field_name='reference_number' and scope_receipt_format='ryt_screenshot_v1'),'matching screenshot contradiction rejects its rule');
-- Fresh post-shadow shared reviews can promote only the shared rule.
select pg_temp.format_fixture(n,'ryt_shared_v1',(select id from public.finance_parser_templates where algorithm_version=2 and field_name='reference_number' and scope_receipt_format='ryt_shared_v1')) from generate_series(10,12) n;
select public.finance_refresh_rule_suggestions();
select pg_temp.check_format(public.finance_parser_template_can_promote_v2((select id from public.finance_parser_templates where algorithm_version=2 and field_name='reference_number' and scope_receipt_format='ryt_shared_v1')),'three fresh matching observations permit promotion');
-- Even incorrectly attached evidence must fail the promotion gate.
update public.finance_template_evidence set intake_item_id=md5('format-intake-1')::uuid where candidate_id=md5('format-candidate-10')::uuid and template_id=(select id from public.finance_parser_templates where algorithm_version=2 and field_name='reference_number' and scope_receipt_format='ryt_shared_v1');
select pg_temp.check_format(not public.finance_parser_template_can_promote_v2((select id from public.finance_parser_templates where algorithm_version=2 and field_name='reference_number' and scope_receipt_format='ryt_shared_v1')),'unknown intake evidence blocks promotion even when attached incorrectly');
select public.finance_refresh_rule_suggestions();
-- Conflicted OCR fields are invalid evidence, including corrected values that replay successfully.
update public.finance_intake_items set receipt_processing='{"conflicts":["reference_number"]}' where id=md5('format-intake-4')::uuid;
select public.finance_refresh_rule_suggestions();
select pg_temp.check_format((select status='rejected' and contradiction_count>0 from public.finance_parser_templates where algorithm_version=2 and field_name='reference_number' and scope_receipt_format='ryt_shared_v1'),'OCR conflict blocks field promotion');
select pg_temp.check_format(not has_function_privilege('authenticated','public.finance_finalize_screenshot_intake_v3(uuid,uuid,uuid,text,text,numeric,text,integer,uuid,jsonb,jsonb,numeric,uuid,text,numeric,jsonb,text,uuid,jsonb)','execute'),'browser cannot call the trusted finaliser');
rollback;
