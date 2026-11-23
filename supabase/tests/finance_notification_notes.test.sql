begin;
create function pg_temp.check_notes(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end $$;
insert into auth.users(id) values('b0260000-0000-4000-8000-000000000001'),('b0260000-0000-4000-8000-000000000002');
insert into public.dim_finance_sources(id,user_id,name) values
 ('b0260000-0000-4000-8000-000000000011','b0260000-0000-4000-8000-000000000001','Synthetic notes'),
 ('b0260000-0000-4000-8000-000000000012','b0260000-0000-4000-8000-000000000002','Other source');
insert into public.dim_modules(modules,name,path,enabled) values('finance','Finance','/finance',true) on conflict do nothing;
insert into public.bridge_user_module_overrides(user_id,module_id,effect) select 'b0260000-0000-4000-8000-000000000001',id,'allow' from public.dim_modules where modules='finance';
set local role service_role;
do $$
declare u uuid:='b0260000-0000-4000-8000-000000000001'; s uuid:='b0260000-0000-4000-8000-000000000011'; p public.finance_notification_patterns; seed public.finance_notification_patterns;
 tx uuid; device uuid:=gen_random_uuid(); accepted jsonb; result jsonb; d jsonb; rev integer;
begin
 select * into seed from public.finance_notification_patterns where user_id is null and format_key='tng-received-notes';
 d:=seed.definition;
 perform pg_temp.check_notes(finance_private.notification_definition_valid(d),'notes definition accepted');
 perform pg_temp.check_notes(not finance_private.notification_definition_valid(jsonb_set(d,'{parts}',d->'parts'||'[" extra"]'::jsonb)),'notes must be last');
 perform pg_temp.check_notes(not finance_private.notification_definition_valid(d||'{"match":"contains"}'),'notes cannot be partial');
 perform pg_temp.check_notes((select count(*)=0 from public.finance_notification_patterns_for_user_v2(u,s) where format_key='tng-received'),'v2 hides legacy starter');
 perform pg_temp.check_notes((select count(*)=1 from public.finance_notification_patterns_for_user_v1(u,s) where format_key='tng-received'),'v1 preserves legacy starter');
 select * into p from public.finance_save_notification_pattern_v1(u,s,seed.id,seed.revision,'Reusable incoming notes',d,true);
 perform pg_temp.check_notes(p.user_id=u and p.origin='override' and p.evidence_transaction_id is null,'private manual edit');
 rev:=p.revision;
 begin
  perform public.finance_save_notification_pattern_v1('b0260000-0000-4000-8000-000000000002','b0260000-0000-4000-8000-000000000012',p.id,p.revision,'Other',d,true);
  raise exception 'other owner accepted'; exception when no_data_found then null;
 end;
 begin
  perform public.finance_save_notification_pattern_v1(u,s,seed.id,seed.revision,'Stale',d,true);
  raise exception 'stale starter accepted'; exception when serialization_failure then null;
 end;
 insert into public.companion_devices(id,user_id,token_hash,label) values(device,u,repeat('d',64),'Synthetic notes device');
 accepted:=public.finance_accept_notification_v1(u,device,jsonb_build_object('client_event_id',gen_random_uuid(),'source_id',s,'source_package','my.com.tngdigital.ewallet','captured_at',now(),'notification_key_hash',repeat('a',64),'notification',jsonb_build_object('title','Synthetic','text','RM16.00 received from Alex for Tickets','posted_at',now())),repeat('b',64),
  jsonb_build_object('status','review','date_provenance','posted_at','payload',jsonb_build_object('source_id',s,'amount',16,'direction','income','currency','MYR','payee_name','Alex','transaction_date',current_date,'notes','Tickets','matched_rule_names','[]'::jsonb)));
 result:=public.finance_confirm_notification_v1(u,(accepted->>'candidate_id')::uuid,repeat('b',64),jsonb_build_object('p_confirmation_mode','manual','p_source_id',s,'p_amount',16,'p_direction','income','p_payee_name','Alex','p_transaction_date',current_date,'p_currency','MYR','p_notes','Tickets'),jsonb_build_object('format_key',p.format_key,'name','Learning must not overwrite','definition',d));
 perform pg_temp.check_notes(result->>'confirmed'='true','confirmation succeeds beside manual rule');
 perform pg_temp.check_notes((select name='Reusable incoming notes' and origin='override' and revision=rev from public.finance_notification_patterns where id=p.id),'manual edit wins over stale learning');
 tx:=(result->'transaction'->>'id')::uuid;
 insert into public.finance_notification_patterns(user_id,source_id,source_package,format_key,name,definition,origin,evidence_transaction_id)
 values(u,s,'my.com.tngdigital.ewallet','synthetic-notes-evidence','Notes evidence',d,'learned',tx);
 update public.finance_transactions set notes='Corrected' where id=tx;
 perform pg_temp.check_notes((select not evidence_valid from public.finance_notification_patterns where user_id=u and format_key='synthetic-notes-evidence'),'notes correction invalidates notes evidence');
 perform pg_temp.check_notes((select evidence_valid from public.finance_notification_patterns where id=p.id),'manual rule remains independent');
 perform pg_temp.check_notes(not has_function_privilege('authenticated','public.finance_save_notification_pattern_v1(uuid,uuid,uuid,integer,text,jsonb,boolean)','execute'),'server only editor');
end $$;
reset role;
rollback;
