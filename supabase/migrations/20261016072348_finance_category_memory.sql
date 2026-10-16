-- Category classification is shared by notifications and screenshots. Only a
-- deliberate category change through a manual confirmation/edit teaches it.
create table public.finance_category_memories (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 party_kind text not null check(party_kind in ('merchant','payee')),
 party_key text not null check(length(party_key) between 1 and 500),
 party_name text not null,
 payee_id uuid,
 direction text not null check(direction in ('expense','income')),
 is_active boolean not null default true,
 override_category_id uuid,
 revision bigint not null default 1,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(user_id,party_kind,party_key,direction), unique(id,user_id),
 foreign key(override_category_id,user_id) references public.dim_finance_categories(id,user_id) deferrable initially deferred,
 foreign key(payee_id,user_id) references public.dim_finance_payees(id,user_id) deferrable initially deferred
);
create table public.finance_category_evidence (
 transaction_id uuid primary key,
 user_id uuid not null,
 memory_id uuid not null,
 category_id uuid not null,
 foreign key(transaction_id,user_id) references public.finance_transactions(id,user_id) on delete cascade,
 foreign key(memory_id,user_id) references public.finance_category_memories(id,user_id) on delete cascade,
 foreign key(category_id,user_id) references public.dim_finance_categories(id,user_id) deferrable initially deferred
);
create index finance_category_evidence_memory on public.finance_category_evidence(memory_id,user_id);
create index finance_category_evidence_category on public.finance_category_evidence(category_id,user_id);
create index finance_category_memories_category on public.finance_category_memories(override_category_id,user_id);
create index finance_category_memories_payee on public.finance_category_memories(payee_id,user_id);
alter table public.finance_category_memories enable row level security;
alter table public.finance_category_evidence enable row level security;
revoke all on public.finance_category_memories,public.finance_category_evidence from public,anon,authenticated;
grant all on public.finance_category_memories,public.finance_category_evidence to service_role;

-- Preserve punctuation and word boundaries. No substring or fuzzy identity match.
create function finance_private.category_party_key(p text) returns text
language sql immutable security invoker set search_path='' as $$
 select lower(btrim(regexp_replace(normalize(coalesce(p,''),NFKC),'[[:space:]]+',' ','g')));
$$;

create function finance_private.teach_category(p_user uuid,p_transaction uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare t public.finance_transactions; party text; kind text; memory uuid;
begin
 select * into t from public.finance_transactions where id=p_transaction and user_id=p_user and status='confirmed';
 if not found or t.category_id is null then return; end if;
 if t.payee_id is not null then
  select name into party from public.dim_finance_payees where id=t.payee_id and user_id=p_user and not is_archived;
  kind:='payee';
 else party:=t.merchant; kind:='merchant'; end if;
 if finance_private.category_party_key(party)='' then return; end if;
 insert into public.finance_category_memories(user_id,party_kind,party_key,party_name,payee_id,direction)
 values(p_user,kind,case when kind='payee' then 'id:'||t.payee_id::text else finance_private.category_party_key(party) end,btrim(party),t.payee_id,t.direction)
 on conflict(user_id,party_kind,party_key,direction) do update
 set revision=finance_category_memories.revision+1,updated_at=clock_timestamp()
 returning id into memory;
 insert into public.finance_category_evidence(transaction_id,user_id,memory_id,category_id)
 values(t.id,p_user,memory,t.category_id)
 on conflict(transaction_id) do update set memory_id=excluded.memory_id,category_id=excluded.category_id;
end $$;

-- An edited identity/direction/category can no longer support its old mapping.
create function finance_private.invalidate_category_evidence() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if (old.merchant,old.payee_id,old.direction,old.category_id,old.status)
  is distinct from (new.merchant,new.payee_id,new.direction,new.category_id,new.status) then
  delete from public.finance_category_evidence where transaction_id=new.id and user_id=new.user_id;
 end if;
 return new;
end $$;
create trigger finance_invalidate_category_evidence after update on public.finance_transactions
 for each row execute function finance_private.invalidate_category_evidence();

create function finance_private.category_evidence_changed() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op<>'INSERT' then
  update public.finance_category_memories set revision=revision+1,updated_at=clock_timestamp() where id=old.memory_id;
 end if;
 if tg_op<>'DELETE' then
  update public.finance_category_memories set revision=revision+1,updated_at=clock_timestamp() where id=new.memory_id;
 end if;
 return null;
end $$;
create trigger finance_category_evidence_changed after insert or update or delete on public.finance_category_evidence
 for each row execute function finance_private.category_evidence_changed();

create function finance_private.resolve_category(p_user uuid,p jsonb,p_intake_source text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb:=p; m public.finance_category_memories; party text; kind text; saved_payee uuid; identity_key text;
 category uuid; category_count int; reason text; food public.dim_finance_categories;
begin
 -- A category already selected by the manual parser keeps precedence. Learned
 -- assignments are always rebuilt, so Retry cannot retain invalidated evidence.
 if nullif(p->>'category_id','') is not null and coalesce(p->'category_assignment'->>'origin','manual')='manual' then return p; end if;
 result:=(p-'category_assignment')||jsonb_build_object('category_id',null);
 if coalesce(p->>'direction','') not in ('expense','income') then return result; end if;
 if nullif(btrim(p->>'payee_name'),'') is not null then
  kind:='payee'; party:=p->>'payee_name';
  -- Resolve the saved name before falling back to conservative text identity.
  select id,name into saved_payee,party from public.dim_finance_payees
   where user_id=p_user and not is_archived and normalized_name=finance_private.finance_normalize_payee_key(p->>'payee_name');
  if not found then party:=p->>'payee_name'; end if;
 else kind:='merchant'; party:=p->>'merchant'; end if;
 if finance_private.category_party_key(party)='' then return result; end if;
 identity_key:=case when saved_payee is not null then 'id:'||saved_payee::text else finance_private.category_party_key(party) end;
 select * into m from public.finance_category_memories
 where user_id=p_user and party_kind=kind and party_key=identity_key and direction=p->>'direction';
 if found then
  if not m.is_active then reason:='disabled';
  elsif m.override_category_id is not null then category:=m.override_category_id;
  else
   select count(distinct e.category_id),min(e.category_id::text)::uuid into category_count,category
   from public.finance_category_evidence e
   join public.finance_transactions t on t.id=e.transaction_id and t.user_id=e.user_id and t.status='confirmed' and t.category_id=e.category_id
   left join public.dim_finance_payees payee on payee.id=t.payee_id and payee.user_id=t.user_id
   where e.memory_id=m.id and e.user_id=p_user and t.direction=m.direction
    and case when m.party_kind='payee' then t.payee_id is not null and not payee.is_archived
       and t.payee_id=m.payee_id
     else t.payee_id is null and finance_private.category_party_key(t.merchant)=m.party_key end;
   if category_count>1 then category:=null;reason:='conflict';
   elsif category_count=0 then category:=null;reason:='no_evidence'; end if;
  end if;
  if category is not null and not exists(select 1 from public.dim_finance_categories where id=category and user_id=p_user and not is_archived) then category:=null;reason:='category_unavailable'; end if;
  -- Conflicts and disabled memories must not be hidden by the Food fallback.
  if reason is distinct from 'no_evidence' then
   return result||jsonb_build_object('category_id',category,'category_assignment',jsonb_build_object(
    'origin','learned','memory_id',m.id,'revision',m.revision,'status',coalesce(reason,'applied')));
  end if;
 end if;
 if p_intake_source='notification' and kind='payee' and p->>'direction'='expense' then
  -- Reuse the owner's Food category; archived Food is an explicit opt-out.
  select * into food from public.dim_finance_categories where user_id=p_user and lower(btrim(name))='food';
  if not found then
   insert into public.dim_finance_categories(user_id,name) values(p_user,'Food')
   on conflict do nothing;
   select * into food from public.dim_finance_categories where user_id=p_user and lower(btrim(name))='food';
  end if;
  if food.id is not null and not food.is_archived then
   result:=result||jsonb_build_object('category_id',food.id,'category_assignment',jsonb_build_object('origin','payee_default','status','applied'));
  end if;
 end if;
 return result;
end $$;

-- Candidate insertion and explicit Retry share the same final classification.
create function finance_private.assign_candidate_category() returns trigger
language plpgsql security invoker set search_path='' as $$
declare intake_source text;
begin
 if new.status<>'pending' then return new; end if;
 select source into intake_source from public.finance_intake_items where id=new.intake_item_id and user_id=new.user_id;
 if intake_source in ('screenshot','notification') then
  new.payload:=finance_private.resolve_category(new.user_id,new.payload,intake_source);
 end if;
 return new;
end $$;
create trigger finance_candidate_category_assignment before insert or update of payload on public.finance_candidate_transactions
 for each row execute function finance_private.assign_candidate_category();

create function finance_private.screenshot_auto_eligible(p jsonb) returns boolean
language plpgsql stable security invoker set search_path='' as $$
declare amount numeric; day date; field text;
begin
 if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'amount') is distinct from 'number'
  or p->>'currency' is distinct from 'MYR' or coalesce(p->>'direction','') not in ('expense','income')
  or nullif(p->>'source_id','') is null or nullif(p->>'category_id','') is null
  or coalesce(p->>'transaction_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
  or (p->'receipt_processing'->'conflicts' is not null and p->'receipt_processing'->'conflicts'<>'[]'::jsonb)
  then return false; end if;
 amount:=(p->>'amount')::numeric; day:=(p->>'transaction_date')::date;
 if amount<=0 or amount>999999999999.99 or amount<>round(amount,2)
  or day::text<>p->>'transaction_date' or day>(now() at time zone 'Asia/Kuala_Lumpur')::date then return false; end if;
 foreach field in array array['merchant','payee_name','reference_number','notes'] loop
  if p->field is not null and p->field<>'null'::jsonb and jsonb_typeof(p->field)<>'string' then return false; end if;
  if length(btrim(p->>field))>(case field when 'notes' then 2500 when 'reference_number' then 200 else 500 end) then return false; end if;
 end loop;
 return nullif(btrim(p->>'merchant'),'') is not null or nullif(btrim(p->>'payee_name'),'') is not null;
exception when invalid_text_representation or datetime_field_overflow then return false;
end $$;

create function finance_private.category_assignment_current(p_user uuid,p jsonb,p_intake_source text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare resolved jsonb;
begin
 if coalesce(p->'category_assignment'->>'origin','manual')='manual' then
  if p->'category_assignment'->>'rule_id' is not null then
   perform 1 from public.finance_rules r where r.id::text=p->'category_assignment'->>'rule_id'
    and r.user_id=p_user and r.is_active and r.source='manual' and r.category_id::text=p->>'category_id'
    and (r.source_id is null or r.source_id::text=p->>'source_id') and (r.direction is null or r.direction=p->>'direction') for share;
   return found;
  end if;
  return nullif(p->>'category_id','') is not null;
 end if;
 resolved:=finance_private.resolve_category(p_user,p,p_intake_source);
 return resolved->>'category_id' is not distinct from p->>'category_id'
  and resolved->'category_assignment' is not distinct from p->'category_assignment';
end $$;

create function public.finance_auto_confirm_screenshot(p_user_id uuid,p_candidate_id uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare c public.finance_candidate_transactions; p jsonb; result jsonb;
begin
 if not public.finance_user_can_access_module_v1(p_user_id,'finance') then raise exception using errcode='42501',message='Finance access denied'; end if;
 perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
 select * into c from public.finance_candidate_transactions where id=p_candidate_id and user_id=p_user_id for update;
 if not found then raise exception using errcode='P0002',message='Finance candidate not found'; end if;
 if not exists(select 1 from public.finance_intake_items where id=c.intake_item_id and user_id=p_user_id and source='screenshot') then
  raise exception using errcode='22023',message='Screenshot candidate required'; end if;
 p:=c.payload;
 if c.status<>'pending' or c.duplicate_outcome<>'none' or not finance_private.screenshot_auto_eligible(p)
  or not finance_private.category_assignment_current(p_user_id,p,'screenshot') then
  return jsonb_build_object('confirmed',false,'candidate',to_jsonb(c)); end if;
 begin
  result:=public.finance_confirm_candidate_v3(p_user_id,c.id,(p->>'source_id')::uuid,(p->>'category_id')::uuid,
   p->>'direction',(p->>'amount')::numeric,p->>'merchant',p->>'payee_name',(p->>'transaction_date')::date,
   p->>'notes',p->>'currency',p->>'reference_number',false,null,'automatic');
 exception when invalid_parameter_value or invalid_text_representation or foreign_key_violation or check_violation or no_data_found then
  return jsonb_build_object('confirmed',false,'candidate',to_jsonb(c));
 end;
 return result;
end $$;

-- Extend existing RPCs in place, retaining their fencing, ownership checks,
-- duplicate locking, receipt diagnostics, notification cleanup and signatures.
do $patch$
declare definition text; before_text text; after_text text; signature regprocedure; gate_start int; gate_end int;
begin
 signature:='public.finance_confirm_candidate(uuid,uuid,uuid,uuid,text,numeric,text,date,text,text,text,boolean,text,text)'::regprocedure;
 definition:=replace(pg_get_functiondef(signature),E'\r','');
 gate_start:=position(E'  elsif p_confirmation_mode = ''automatic'' then\n' in definition);
 gate_end:=position(E'\n  select * into transaction_row\n  from public.finance_transactions\n  where intake_item_id = candidate_row.intake_item_id' in definition);
 if gate_start=0 or gate_end<=gate_start then raise exception 'Screenshot confirmation gate not found'; end if;
 definition:=left(definition,gate_start-1)||$gate$  elsif p_confirmation_mode = 'automatic' then
    if not finance_private.screenshot_auto_eligible(candidate_row.payload)
      or (candidate_row.payload->>'source_id')::uuid is distinct from p_source_id
      or (candidate_row.payload->>'category_id')::uuid is distinct from p_category_id
      or (candidate_row.payload->>'amount')::numeric is distinct from p_amount
      or candidate_row.payload->>'direction' is distinct from p_direction
      or nullif(btrim(candidate_row.payload->>'merchant'),'') is distinct from nullif(btrim(p_merchant),'')
      or (candidate_row.payload->>'transaction_date')::date is distinct from p_transaction_date
      or not finance_private.category_assignment_current(p_user_id,candidate_row.payload,'screenshot') then
      raise exception using errcode='23514',message='Screenshot needs a current category and complete details';
    end if;
  end if;
$gate$||substr(definition,gate_end);
 execute definition;

 -- Notification confirmation also rechecks category provenance at the locked
 -- shared entry point, including calls outside the intake convenience wrapper.
 definition:=replace(pg_get_functiondef(signature),E'\r','');
 before_text:='    if not finance_private.notification_auto_eligible(candidate_row.payload)';
 after_text:=$gate$    if (candidate_row.payload->>'category_id' is not null and not finance_private.category_assignment_current(p_user_id,candidate_row.payload,'notification'))
      or not finance_private.notification_auto_eligible(candidate_row.payload)$gate$;
 if position(before_text in definition)=0 then raise exception 'Notification automatic gate not found'; end if;
 execute replace(definition,before_text,after_text);

 signature:='public.finance_confirm_candidate_v3(uuid,uuid,uuid,uuid,text,numeric,text,text,date,text,text,text,boolean,text,text)'::regprocedure;
 definition:=replace(pg_get_functiondef(signature),E'\r','');
 -- The outer wrapper must acquire the ledger lock before locking the candidate.
 before_text:=E'  select * into candidate_row\n  from public.finance_candidate_transactions';
 after_text:=E'  perform pg_advisory_xact_lock(hashtextextended(''idea-dump:finance-ledger:''||p_user_id::text,0));\n'||before_text;
 if position(before_text in definition)=0 then raise exception 'Confirmation candidate lock not found'; end if;
 definition:=replace(definition,before_text,after_text);
 before_text:=$needle$and exists(select 1 from public.finance_intake_items where id=candidate_row.intake_item_id and user_id=p_user_id and source='notification')$needle$;
 definition:=replace(definition,before_text,$replacement$and exists(select 1 from public.finance_intake_items where id=candidate_row.intake_item_id and user_id=p_user_id and source in ('notification','screenshot'))$replacement$);
 before_text:='  return pg_catalog.jsonb_set(confirmation, ''{transaction}'', pg_catalog.to_jsonb(transaction_row), true);';
 after_text:=$teach$  if p_confirmation_mode='manual' and candidate_row.payload->>'category_id' is distinct from p_category_id::text then
    perform finance_private.teach_category(p_user_id,transaction_row.id);
  end if;
$teach$||before_text;
 if position(before_text in definition)=0 then raise exception 'Confirmation learning hook not found'; end if;
 execute replace(definition,before_text,after_text);

 signature:='public.finance_update_transaction_v3(uuid,uuid,uuid,uuid,text,numeric,text,text,date,text,text,text)'::regprocedure;
 definition:=replace(pg_get_functiondef(signature),E'\r','');
 before_text:='  return updated_row;';
 after_text:=$teach$  if previous_row.category_id is distinct from updated_row.category_id then
    perform finance_private.teach_category(p_user_id,updated_row.id);
  end if;
$teach$||before_text;
 if position(before_text in definition)=0 then raise exception 'Edit learning hook not found'; end if;
 execute replace(definition,before_text,after_text);

 signature:='finance_private.auto_confirm_notification(uuid,uuid)'::regprocedure;
 definition:=replace(pg_get_functiondef(signature),E'\r','');
 before_text:=' -- Rules may have been disabled or invalidated after preparation.';
 after_text:=$gate$ if not finance_private.category_assignment_current(p_user_id,p,'notification') and p->>'category_id' is not null then
  return jsonb_build_object('confirmed',false,'candidate',to_jsonb(c)); end if;
$gate$||before_text;
 if position(before_text in definition)=0 then raise exception 'Notification category validation hook not found'; end if;
 execute replace(definition,before_text,after_text);

 signature:='public.finance_finalize_screenshot_intake_v2(uuid,uuid,uuid,text,text,numeric,text,integer,uuid,jsonb,jsonb,numeric,uuid,text,numeric,jsonb,text,uuid)'::regprocedure;
 definition:=replace(pg_get_functiondef(signature),E'\r','');
 before_text:=E'  select * into intake_row\n  from public.finance_intake_items';
 after_text:=E'  perform pg_advisory_xact_lock(hashtextextended(''idea-dump:finance-ledger:''||p_user_id::text,0));\n'||before_text;
 if position(before_text in definition)=0 then raise exception 'Finalize intake lock not found'; end if;
 definition:=replace(definition,before_text,after_text);
 before_text:=E'  return jsonb_build_object(\n    ''state'', ''review'',';
 after_text:=$confirm$  if finance_private.screenshot_auto_eligible(candidate_row.payload) then
    declare auto_result jsonb;
    begin
      auto_result:=public.finance_auto_confirm_screenshot(p_user_id,candidate_row.id);
      if auto_result->>'confirmed'='true' then
        return auto_result||jsonb_build_object('state','completed','auto_confirmed',true,'recovered',false);
      end if;
      select * into candidate_row from public.finance_candidate_transactions where id=candidate_row.id and user_id=p_user_id;
    end;
  end if;
$confirm$||before_text;
 if position(before_text in definition)=0 then raise exception 'Finalize confirmation hook not found'; end if;
 execute replace(definition,before_text,after_text);

 -- Format-aware finalization must take the same lock before touching intake.
 signature:='public.finance_finalize_screenshot_intake_v3(uuid,uuid,uuid,text,text,numeric,text,integer,uuid,jsonb,jsonb,numeric,uuid,text,numeric,jsonb,text,uuid,jsonb)'::regprocedure;
 definition:=replace(pg_get_functiondef(signature),E'\r','');
 before_text:=' select * into item from public.finance_intake_items';
 after_text:=E' perform pg_advisory_xact_lock(hashtextextended(''idea-dump:finance-ledger:''||p_user_id::text,0));\n'||before_text;
 if position(before_text in definition)=0 then raise exception 'Format intake lock not found'; end if;
 execute replace(definition,before_text,after_text);
end $patch$;

create function public.finance_category_memory_settings(p_user_id uuid,p_action text default 'list',p_id uuid default null,p_category_id uuid default null,p_active boolean default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 if not public.finance_user_can_access_module_v1(p_user_id,'finance') then raise exception using errcode='42501',message='Finance access denied'; end if;
 perform pg_advisory_xact_lock(hashtextextended('idea-dump:finance-ledger:'||p_user_id::text,0));
 if p_action<>'list' then
  perform 1 from public.finance_category_memories where id=p_id and user_id=p_user_id for update;
  if not found then raise exception using errcode='P0002',message='Category memory not found'; end if;
  if p_action='forget' then delete from public.finance_category_memories where id=p_id and user_id=p_user_id;
  elsif p_action='set' then
   if p_category_id is not null and not exists(select 1 from public.dim_finance_categories where id=p_category_id and user_id=p_user_id and not is_archived) then
    raise exception using errcode='22023',message='Choose an active category'; end if;
   update public.finance_category_memories set override_category_id=p_category_id,is_active=coalesce(p_active,is_active),revision=revision+1,updated_at=clock_timestamp()
    where id=p_id and user_id=p_user_id;
  else raise exception using errcode='22023',message='Invalid category memory action'; end if;
 end if;
 select coalesce(jsonb_agg(to_jsonb(rows) order by rows.party_name,rows.id),'[]'::jsonb) into result from (
  select m.id,m.party_kind,coalesce(payee.name,m.party_name) as party_name,m.direction,m.is_active,m.override_category_id,m.revision,
   count(e.transaction_id)::int as evidence_count,
   case when m.override_category_id is not null then m.override_category_id
    when count(distinct e.category_id)=1 then min(e.category_id::text)::uuid end as category_id,
   count(distinct e.category_id)>1 and m.override_category_id is null as has_conflict
  from public.finance_category_memories m left join public.finance_category_evidence e on e.memory_id=m.id and e.user_id=m.user_id
  left join public.dim_finance_payees payee on payee.id=m.payee_id and payee.user_id=m.user_id
  where m.user_id=p_user_id group by m.id,payee.name
 ) rows;
 return result;
end $$;

do $permissions$
declare f record;
begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where (n.nspname='finance_private' and p.proname in ('category_party_key','teach_category','invalidate_category_evidence','category_evidence_changed','resolve_category','assign_candidate_category','screenshot_auto_eligible','category_assignment_current'))
  or (n.nspname='public' and p.proname in ('finance_auto_confirm_screenshot','finance_category_memory_settings')) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $permissions$;
notify pgrst,'reload schema';
