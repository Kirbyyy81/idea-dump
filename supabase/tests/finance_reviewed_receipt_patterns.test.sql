-- Isolated migrated database only. All fixture rows are rolled back.
begin;
create function pg_temp.check_receipt(ok boolean,label text) returns void language plpgsql as $f$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end;
$f$;
insert into auth.users(id) values('b3000000-0000-4000-8000-000000000001');
insert into public.dim_finance_sources(id,user_id,name) values
 ('b3000000-0000-4000-8000-000000000002','b3000000-0000-4000-8000-000000000001','Pattern Bank'),
 ('b3000000-0000-4000-8000-000000000003','b3000000-0000-4000-8000-000000000001','Other Bank');
select public.finance_set_parser_learning_cutoff('b3000000-0000-4000-8000-000000000001','2026-09-05T16:00:00Z');
do $fixtures$
declare n int; intake uuid; tx uuid;
begin for n in 1..4 loop
 intake:=md5('receipt-intake-'||n)::uuid; tx:=md5('receipt-tx-'||n)::uuid;
 insert into public.finance_intake_items(id,user_id,source,status,created_at,original_filename,ocr_normalized_text)
 values(intake,'b3000000-0000-4000-8000-000000000001','screenshot','completed',
  case when n=4 then '2026-09-05T15:59:59Z'::timestamptz else '2026-09-05T16:00:00Z'::timestamptz end,
  'Screenshot_20260901_164928_Pattern Bank.png',E'Today, 1:43 PM\nWallet Ref ABC12345'||n||E'\n678901234\nStatus Successful');
 insert into public.finance_transactions(id,user_id,source_id,status,direction,amount,transaction_date,source,reference_number,intake_item_id)
 values(tx,'b3000000-0000-4000-8000-000000000001',case when n=4 then 'b3000000-0000-4000-8000-000000000003'::uuid else 'b3000000-0000-4000-8000-000000000002'::uuid end,
 'confirmed','expense',12.5,'2026-09-01','screenshot','ABC12345'||n||'678901234',intake);
 insert into public.finance_candidate_transactions(id,user_id,confirmed_transaction_id,intake_item_id,status)
 values(md5('receipt-candidate-'||n)::uuid,'b3000000-0000-4000-8000-000000000001',tx,intake,case when n=3 then 'pending' else 'accepted' end);
 end loop;
end;
$fixtures$;
select public.finance_refresh_rule_suggestions();
select pg_temp.check_receipt(not exists(select 1 from public.finance_parser_templates),'two accepted receipts plus one unreviewed receipt cannot generate a source rule');
update public.finance_candidate_transactions set status='accepted' where id=md5('receipt-candidate-3')::uuid;
select public.finance_refresh_rule_suggestions();
select pg_temp.check_receipt((select count(*)=1 from public.finance_parser_templates),'three accepted sources generate one proposal without corrections');
select pg_temp.check_receipt((select status='shadow' and evidence_count=3 and contradiction_count=0 from public.finance_parser_templates),'old upload contradiction excluded and reviewed source starts in shadow');
select pg_temp.check_receipt(not public.finance_parser_template_can_promote_v2((select id from public.finance_parser_templates)),'confirmation history alone cannot promote');
select pg_temp.check_receipt((select count(*)=0 from public.finance_corrections),'source learning does not manufacture correction records');
do $corrections$
declare n int;
begin for n in 1..3 loop
 insert into public.finance_corrections(id,user_id,transaction_id,intake_item_id,field_name,previous_value,corrected_value) values
 (gen_random_uuid(),'b3000000-0000-4000-8000-000000000001',md5('receipt-tx-'||n)::uuid,md5('receipt-intake-'||n)::uuid,'transaction_date','null','"2026-09-01"'),
 (gen_random_uuid(),'b3000000-0000-4000-8000-000000000001',md5('receipt-tx-'||n)::uuid,md5('receipt-intake-'||n)::uuid,'reference_number','"WRONG"',to_jsonb('ABC12345'||n||'678901234'));
 end loop;
end;
$corrections$;
select public.finance_refresh_rule_suggestions();
select pg_temp.check_receipt((select count(*)=1 from public.finance_parser_templates where template_type='filename_date' and status='shadow' and evidence_count=3),'Today learns the filename date, not the upload date');
select pg_temp.check_receipt((select count(*)=1 from public.finance_parser_templates where template_type='reference_label' and status='shadow' and evidence_count=3),'wrapped wallet references generate and replay consistently');
select public.finance_refresh_rule_suggestions();
select pg_temp.check_receipt((select count(*)=3 from public.finance_parser_templates),'repeat refresh does not duplicate proposals');
select pg_temp.check_receipt(not public.finance_parser_template_configuration_is_valid('{"type":"reference_label","label":"anything","placement":"inline","max_lines":3,"join":"concat"}'),'reference labels remain allowlisted');
select pg_temp.check_receipt(not public.finance_parser_template_configuration_is_valid('{"type":"reference_label","label":"wallet ref","placement":"inline","max_lines":30,"join":"concat"}'),'reference windows remain bounded');
select pg_temp.check_receipt(not has_function_privilege('service_role','public.finance_parser_receipt_configs_v2(text,text,text,text,jsonb)','execute'),'receipt proposal generator is operator-only');
rollback;
