-- Synthetic owners only; every test write rolls back.
begin;
create function pg_temp.check_ignore(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end $$;
insert into auth.users(id) values('b0250000-0000-4000-8000-000000000001'),('b0250000-0000-4000-8000-000000000002');
insert into public.dim_finance_sources(id,user_id,name) values
 ('b0250000-0000-4000-8000-000000000011','b0250000-0000-4000-8000-000000000001','Synthetic ignore source'),
 ('b0250000-0000-4000-8000-000000000012','b0250000-0000-4000-8000-000000000002','Synthetic other source');
set local role service_role;
do $$
declare u uuid:='b0250000-0000-4000-8000-000000000001'; s uuid:='b0250000-0000-4000-8000-000000000011';
 starter public.finance_notification_patterns; r public.finance_notification_patterns; edited public.finance_notification_patterns;
begin
 select * into starter from public.finance_notification_patterns where user_id is null and format_key='ryt-card-approval-request';
 perform pg_temp.check_ignore(starter.definition->>'action'='ignore','saved starter exists');
 select * into edited from public.finance_save_notification_ignore_rule_v1(u,s,
  '52000000-0000-4000-8000-000000000018',1,'My approval title','Different approval title','my.rytbank.app',true);
 perform pg_temp.check_ignore(edited.user_id=u and edited.origin='override','editing starter creates private override');
 perform pg_temp.check_ignore((select definition->'parts'->>0='Tap to confirm card payment' from public.finance_notification_patterns
  where id='52000000-0000-4000-8000-000000000018'),'editing leaves shared starter unchanged');
 begin
  perform public.finance_save_notification_ignore_rule_v1(u,s,'52000000-0000-4000-8000-000000000018',1,'Stale','Other phrase','my.rytbank.app',true);
  raise exception 'stale starter accepted'; exception when serialization_failure then null;
 end;
 select * into r from public.finance_set_notification_pattern_v1(u,s,starter.id,false,starter.revision);
 perform pg_temp.check_ignore(r.user_id=u and r.source_id=s and not r.is_active,'disabling creates private override');
 perform pg_temp.check_ignore((select is_active from public.finance_notification_patterns where id=starter.id),'shared starter unchanged');
 select * into edited from public.finance_save_notification_ignore_rule_v1(u,s,r.id,r.revision,'Edited prompt','  Different   prompt ','my.rytbank.app',true);
 perform pg_temp.check_ignore(edited.definition->'parts'->>0='Different prompt' and edited.revision=r.revision+1 and edited.is_active,'normalized atomic edit');
 begin
  perform public.finance_save_notification_ignore_rule_v1(u,s,r.id,r.revision,'Stale prompt','Different prompt','my.rytbank.app',true);
  raise exception 'stale edit accepted'; exception when serialization_failure then null;
 end;
 begin
  perform public.finance_save_notification_ignore_rule_v1('b0250000-0000-4000-8000-000000000002','b0250000-0000-4000-8000-000000000012',edited.id,edited.revision,'Other','Different prompt','my.rytbank.app',true);
  raise exception 'other owner accepted'; exception when no_data_found then null;
 end;
 begin
  perform public.finance_save_notification_ignore_rule_v1(u,'b0250000-0000-4000-8000-000000000012',null,null,'Other','Different prompt','my.rytbank.app',true);
  raise exception 'other source accepted'; exception when no_data_found then null;
 end;
 begin
  perform public.finance_save_notification_ignore_rule_v1(u,s,edited.id,edited.revision,'Other','Different prompt','*',true);
  raise exception 'application changed'; exception when invalid_parameter_value then null;
 end;
 select * into r from public.finance_save_notification_ignore_rule_v1(u,s,null,null,'Custom','Reminder [card]','*',false);
 perform pg_temp.check_ignore(r.origin='override' and r.definition->>'action'='ignore' and not r.is_active,'custom saved rule');
 select * into r from public.finance_set_notification_pattern_v1(u,s,r.id,true,r.revision);
 perform pg_temp.check_ignore(r.is_active,'restore custom rule');
 perform pg_temp.check_ignore(finance_private.notification_definition_valid('{"version":1,"action":"ignore","parts":["Reminder [card]"],"trailing_sentence":true}'),'valid literal prefix');
 perform pg_temp.check_ignore(not finance_private.notification_definition_valid('{"version":1,"action":"ignore","parts":["x"],"trailing_sentence":true}'),'short prefix rejected');
 perform pg_temp.check_ignore(not finance_private.notification_definition_valid('{"version":1,"action":"ignore","parts":["Enough text"],"trailing_sentence":true,"direction":"expense"}'),'ignore cannot extract');
 perform pg_temp.check_ignore(not has_function_privilege('authenticated','public.finance_save_notification_ignore_rule_v1(uuid,uuid,uuid,integer,text,text,text,boolean)','execute'),'server only mutation');
end $$;
reset role;
rollback;
