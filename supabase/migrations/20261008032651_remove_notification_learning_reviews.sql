set local lock_timeout='5s';

-- Save notification patterns directly during confirmation, without review audit rows.
-- The existing RPC signature keeps deployed clients compatible.
lock table public.finance_notification_learning_reviews in access exclusive mode;

CREATE OR REPLACE FUNCTION public.finance_confirm_notification_v1(p_user_id uuid, p_candidate_id uuid, p_expected_digest text, p_confirmation jsonb, p_learning jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare c public.finance_candidate_transactions; e public.finance_notification_events; result jsonb;
 t uuid; target_source uuid;
begin
 perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
 select * into c from public.finance_candidate_transactions where id=p_candidate_id and user_id=p_user_id for update nowait;
 if not found then raise exception using errcode='P0002',message='Finance review item not found'; end if;
 select * into e from public.finance_notification_events where intake_item_id=c.intake_item_id and user_id=p_user_id for update nowait;
 if not found then raise exception using errcode='P0002',message='Finance notification not found'; end if;
 if p_confirmation->>'p_confirmation_mode' is distinct from 'manual' then raise exception using errcode='22023',message='Manual confirmation required'; end if;
 if c.status<>'accepted' and (e.status<>'review' or e.body is null or p_expected_digest is distinct from e.payload_digest) then
  raise exception using errcode='40001',message='Notification changed during review';
 end if;
 target_source:=(p_confirmation->>'p_source_id')::uuid;
 result:=public.finance_confirm_candidate_v3(p_user_id,p_candidate_id,target_source,
  (p_confirmation->>'p_category_id')::uuid,p_confirmation->>'p_direction',(p_confirmation->>'p_amount')::numeric,
  p_confirmation->>'p_merchant',p_confirmation->>'p_payee_name',(p_confirmation->>'p_transaction_date')::date,
  p_confirmation->>'p_notes',p_confirmation->>'p_currency',p_confirmation->>'p_reference_number',
  coalesce((p_confirmation->>'p_allow_duplicate')::boolean,false),p_confirmation->>'p_duplicate_override_reason','manual');
 if c.status='accepted' or coalesce((result->>'confirmed')::boolean,false) is false then return result; end if;
 t:=(result->'transaction'->>'id')::uuid;
 if target_source=e.source_id and p_learning is not null and p_learning<>'null'::jsonb then
  if jsonb_typeof(p_learning)<>'object' or finance_private.notification_definition_valid(p_learning->'definition') is distinct from true
   or length(coalesce(p_learning->>'format_key','')) not between 1 and 100
   or length(coalesce(p_learning->>'name','')) not between 1 and 100
   or p_learning->'definition' ? 'match' then
   raise exception using errcode='22023',message='Invalid notification learning pattern';
  end if;
  if (select count(*) from public.finance_notification_patterns where user_id=p_user_id and source_id=e.source_id)<200
   or exists(select 1 from public.finance_notification_patterns where user_id=p_user_id and source_id=e.source_id and source_package=e.source_package and format_key=p_learning->>'format_key') then
   insert into public.finance_notification_patterns(user_id,source_id,source_package,format_key,name,definition,origin,evidence_transaction_id)
   values(p_user_id,e.source_id,e.source_package,p_learning->>'format_key',p_learning->>'name',p_learning->'definition','learned',t)
   on conflict(user_id,source_id,source_package,format_key) where user_id is not null do update
   set definition=excluded.definition,origin='learned',evidence_transaction_id=t,evidence_valid=true,
    revision=finance_notification_patterns.revision+1,updated_at=clock_timestamp();
  end if;
 end if;
 return result;
exception when lock_not_available then
 raise exception using errcode='40001',message='Finance data changed concurrently. Retry the action.';
end $function$;

drop table public.finance_notification_learning_reviews restrict;

do $no_callers$
begin
  if exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname in ('public','finance_private')
      and p.prosrc like '%finance_notification_learning_reviews%'
  ) then raise exception 'Notification learning review callers remain'; end if;
end;
$no_callers$;

notify pgrst, 'reload schema';
