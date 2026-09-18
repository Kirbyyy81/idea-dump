begin;
create function pg_temp.assert_guarded(ok boolean,label text) returns void language plpgsql as $f$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end;
$f$;
insert into auth.users(id) values('e5000000-0000-4000-8000-000000000001'),('e5000000-0000-4000-8000-000000000011');
insert into public.dim_finance_sources(id,user_id,name) values
 ('e5000000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000001','Ryt Bank'),
 ('e5000000-0000-4000-8000-000000000003','e5000000-0000-4000-8000-000000000001','TnG'),
 ('e5000000-0000-4000-8000-000000000004','e5000000-0000-4000-8000-000000000001','TnG Card'),
 ('e5000000-0000-4000-8000-000000000012','e5000000-0000-4000-8000-000000000011','Foreign Wallet');
select public.finance_set_parser_learning_cutoff('e5000000-0000-4000-8000-000000000001','2026-09-01T00:00:00Z');

create function pg_temp.add_guarded_case(n int,kind text,contradiction boolean default false) returns void
language plpgsql as $f$
declare intake uuid:=md5('guarded-intake-'||n)::uuid; tx uuid:=md5('guarded-tx-'||n)::uuid;
 src uuid; txt text; merchant text; signals jsonb:='[]'; template_id uuid;
begin
 src:=case when kind='card' and not contradiction then 'e5000000-0000-4000-8000-000000000004'::uuid
  when kind='card' then 'e5000000-0000-4000-8000-000000000003'::uuid else 'e5000000-0000-4000-8000-000000000002'::uuid end;
 txt:=case kind when 'card' then E'Posting Time 12/09/2026 12:30\nCard Balance RM 12.50\nEntry Loc TEST_STATION'
  when 'qr' then E'To Sample Tea\nTransaction type DuitNow QR\nRM 12.50'
  else E'Successful\nRM 12.50\n'||case when n%2=0 then 'DO ' else 'D ' end||E'Sample Tea\nPaid from Main Account\nReference ID TEST12345' end;
 merchant:=case when kind<>'card' then 'Sample Tea' end;
 select id into template_id from public.finance_parser_templates where user_id='e5000000-0000-4000-8000-000000000001'
  and template_type='source_signature' and status in ('shadow','active') order by template_version desc limit 1;
 if template_id is not null and kind='card' then
  signals:=jsonb_build_array(jsonb_build_object('template_id',template_id,'kind','learned_source_shadow'));
 end if;
 insert into public.finance_intake_items(id,user_id,source,status,created_at,original_filename,ocr_normalized_text,source_detection_signals)
 values(intake,'e5000000-0000-4000-8000-000000000001','screenshot','completed',clock_timestamp(),'Screenshot.png',txt,signals);
 insert into public.finance_transactions(id,user_id,source_id,status,direction,amount,transaction_date,source,intake_item_id,merchant)
 values(tx,'e5000000-0000-4000-8000-000000000001',src,'confirmed','expense',12.5,'2026-09-12','screenshot',intake,merchant);
 insert into public.finance_candidate_transactions(id,user_id,confirmed_transaction_id,intake_item_id,status,created_at)
 values(md5('guarded-candidate-'||n)::uuid,'e5000000-0000-4000-8000-000000000001',tx,intake,'accepted',clock_timestamp());
end;
$f$;
select pg_temp.add_guarded_case(n,'qr') from generate_series(1,5) n;
select pg_temp.add_guarded_case(n,'icon') from generate_series(6,9) n;
select pg_temp.add_guarded_case(n,'card') from generate_series(10,11) n;
select pg_temp.assert_guarded((select count(*)=0 from public.finance_parser_templates),'migration does not install rules globally');
select pg_temp.assert_guarded((public.finance_install_guarded_receipt_rules('e5000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000003','e5000000-0000-4000-8000-000000000004')->>'inserted')::int=3,'install all three proposed definitions');
select pg_temp.assert_guarded((public.finance_install_guarded_receipt_rules('e5000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000003','e5000000-0000-4000-8000-000000000004')->>'inserted')::int=0,'installer retry does not duplicate versions');
select pg_temp.assert_guarded((select status='proposed' and evidence_count=2 from public.finance_parser_templates where template_type='source_signature'),'two card transactions do not enter shadow');
select pg_temp.assert_guarded((select count(*)=2 from public.finance_parser_templates where template_type='guarded_merchant' and status='shadow' and precision=1),'reviewed merchant rules enter shadow');
select pg_temp.assert_guarded((select count(*)=0 from public.finance_parser_templates where status='active'),'no auto activation');
select pg_temp.assert_guarded((select count(*)=11 from public.finance_transactions),'reviewed transactions unchanged');
select pg_temp.assert_guarded((select count(*)=0 from public.finance_corrections),'no fabricated corrections');
select pg_temp.assert_guarded(not exists(select 1 from public.finance_parser_templates where public.finance_parser_template_can_promote_v2(id)),'historical support cannot replace fresh shadow evidence');

select pg_temp.add_guarded_case(12,'card');
select public.finance_refresh_rule_suggestions();
select pg_temp.assert_guarded((select status='shadow' and evidence_count=3 from public.finance_parser_templates where template_type='source_signature'),'third independent transaction permits shadow');
select pg_temp.assert_guarded((select not public.finance_promote_parser_template_v2(id) from public.finance_parser_templates where template_type='source_signature'),'operator cannot bypass fresh shadow gate');
select pg_temp.add_guarded_case(n,'card') from generate_series(13,15) n;
select public.finance_refresh_rule_suggestions();
select pg_temp.assert_guarded((select public.finance_parser_template_can_promote_v2(id) from public.finance_parser_templates where template_type='source_signature'),'three fresh reviewed observations qualify');
select pg_temp.assert_guarded((select public.finance_promote_parser_template_v2(id) from public.finance_parser_templates where template_type='source_signature'),'explicit operator promotion');
select pg_temp.add_guarded_case(16,'card',true);
select public.finance_refresh_rule_suggestions();
select pg_temp.assert_guarded((select status='disabled' and contradiction_count=1 from public.finance_parser_templates where template_type='source_signature'),'contradiction automatically disables active rule');

set constraints finance_guarded_replacement_source_fkey immediate;
do $ownership$
declare cfg jsonb;
begin
 select configuration into cfg from public.finance_guarded_receipt_rule_catalog('e5000000-0000-4000-8000-000000000012') where field_name='source_id';
 begin
  insert into public.finance_parser_templates(user_id,template_key,target_source_id,field_name,template_type,configuration,algorithm_version,template_version,status,learning_cutoff_at)
  values('e5000000-0000-4000-8000-000000000001','foreign-replacement','e5000000-0000-4000-8000-000000000004','source_id','source_signature',cfg,2,1,'proposed','2026-09-01T00:00:00Z');
  raise exception 'FAILED: foreign replacement accepted';
 exception when foreign_key_violation then null; end;
 begin
  perform public.finance_install_guarded_receipt_rules('e5000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000002','e5000000-0000-4000-8000-000000000012','e5000000-0000-4000-8000-000000000004');
  raise exception 'FAILED: foreign installer source accepted';
 exception when raise_exception then
  if sqlerrm<>'Select three distinct active owned sources' then raise; end if;
 end;
end;
$ownership$;
select pg_temp.assert_guarded(not public.finance_parser_template_configuration_is_valid('{"type":"guarded_merchant","conditions":[],"extraction":{"type":"same_line_label","label":"To"},"clear_matching_payee":true}'),'empty guards rejected');
select pg_temp.assert_guarded(public.finance_guarded_rule_text_is_valid(to_jsonb(repeat(chr(128512),60))),'120 UTF-16 unit anchor accepted');
select pg_temp.assert_guarded(not public.finance_guarded_rule_text_is_valid(to_jsonb(repeat(chr(128512),61))),'Unicode anchor limit agrees with TypeScript');
select pg_temp.assert_guarded(not public.finance_parser_template_configuration_is_valid('{"type":"guarded_merchant","conditions":[{"mode":"regex","text":".*"}],"extraction":{"type":"same_line_label","label":"To"},"clear_matching_payee":true}'),'raw regex rejected');
select pg_temp.assert_guarded(not public.finance_parser_template_configuration_is_valid('{"type":"guarded_merchant","conditions":[{"mode":"exact","text":"x"}],"extraction":{"type":"same_line_label","label":"To","unsafe":true},"clear_matching_payee":true}'),'unknown extraction keys rejected');
select pg_temp.assert_guarded(not has_function_privilege('service_role','public.finance_install_guarded_receipt_rules(uuid,uuid,uuid,uuid)','execute'),'installer is operator-only');
select pg_temp.assert_guarded(not has_function_privilege('authenticated','public.finance_guarded_receipt_rule_catalog(uuid)','execute'),'catalog is not browser-accessible');
select pg_temp.assert_guarded(not has_table_privilege('authenticated','public.finance_parser_templates','select'),'browser cannot read private rule configurations');
select pg_temp.assert_guarded((select relrowsecurity from pg_class where oid='public.finance_parser_templates'::regclass),'template RLS retained');
rollback;
