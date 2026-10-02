create table public.finance_notification_patterns (
 id uuid primary key default gen_random_uuid(),
 user_id uuid references auth.users(id) on delete cascade,
 source_id uuid references public.dim_finance_sources(id) on delete cascade,
 source_package text not null check (source_package in ('*','my.rytbank.app','my.com.tngdigital.ewallet')),
 format_key text not null check (length(format_key) between 1 and 100),
 origin text not null default 'starter' check (origin in ('starter','learned','override')),
 name text not null check (length(name) between 1 and 100),
 definition jsonb not null check (jsonb_typeof(definition)='object' and octet_length(definition::text)<=8192 and definition->>'version'='1'),
 is_active boolean not null default true,
 evidence_valid boolean not null default true,
 revision integer not null default 1 check (revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 check ((user_id is null and source_id is null) or (user_id is not null and source_id is not null))
);
create unique index finance_notification_starter_key on public.finance_notification_patterns(source_package,format_key) where user_id is null;
create unique index finance_notification_owner_key on public.finance_notification_patterns(user_id,source_id,source_package,format_key) where user_id is not null;
create index finance_notification_pattern_source_idx on public.finance_notification_patterns(source_id);
alter table public.finance_notification_patterns enable row level security;
revoke all on public.finance_notification_patterns from public,anon,authenticated;
grant select,insert,update,delete on public.finance_notification_patterns to service_role;

create function public.finance_notification_patterns_for_user_v1(p_user_id uuid,p_source_id uuid)
returns setof public.finance_notification_patterns language sql stable security invoker set search_path='' as $$
 select p.* from public.finance_notification_patterns p
 where exists(select 1 from public.dim_finance_sources s where s.id=p_source_id and s.user_id=p_user_id and not s.is_archived)
 and (p.user_id is null or (p.user_id=p_user_id and p.source_id=p_source_id))
 order by p.user_id nulls first,p.source_package,p.format_key;
$$;
revoke all on function public.finance_notification_patterns_for_user_v1(uuid,uuid) from public,anon,authenticated;
grant execute on function public.finance_notification_patterns_for_user_v1(uuid,uuid) to service_role;

insert into public.finance_notification_patterns(id,source_package,format_key,name,definition)
values
('52000000-0000-4000-8000-000000000001','my.com.tngdigital.ewallet','tng-incoming','TNG incoming transfer','{"version":1,"parts":[{"kind":"text","field":"payee_name"}," has transferred ",{"kind":"amount","field":"amount"}," to you"],"direction":"income","trailing_sentence":true}'::jsonb),
('52000000-0000-4000-8000-000000000002','my.com.tngdigital.ewallet','tng-sent','TNG outgoing transfer','{"version":1,"parts":[{"kind":"amount","field":"amount"}," has been successfully transferred to ",{"kind":"text","field":"payee_name"}],"direction":"expense"}'::jsonb),
('52000000-0000-4000-8000-000000000003','my.com.tngdigital.ewallet','tng-received','TNG received transfer','{"version":1,"parts":[{"kind":"amount","field":"amount"}," received from ",{"kind":"text","field":"payee_name"}," for Fund Transfer"],"direction":"income"}'::jsonb),
('52000000-0000-4000-8000-000000000004','my.rytbank.app','ryt-youve-sent','Ryt transfer','{"version":1,"parts":["You''ve sent ",{"kind":"amount","field":"amount"}," to ",{"kind":"text","field":"payee_name"}," on ",{"kind":"date","field":"transaction_date"},", ",{"kind":"time"}," (GMT+8) using your main account"],"direction":"expense"}'::jsonb),
('52000000-0000-4000-8000-000000000005','my.rytbank.app','ryt-youve-paid','Ryt merchant payment','{"version":1,"parts":["You''ve paid ",{"kind":"amount","field":"amount"}," to ",{"kind":"text","field":"merchant"}," on ",{"kind":"date","field":"transaction_date"},", ",{"kind":"time"}," (GMT+8) using your main account"],"direction":"expense"}'::jsonb),
('52000000-0000-4000-8000-000000000006','my.rytbank.app','ryt-youhave-sent','Ryt transfer','{"version":1,"parts":["You have sent ",{"kind":"amount","field":"amount"}," to ",{"kind":"text","field":"payee_name"}," on ",{"kind":"date","field":"transaction_date"},", ",{"kind":"time"}," (GMT+8) using your main account"],"direction":"expense"}'::jsonb),
('52000000-0000-4000-8000-000000000007','my.rytbank.app','ryt-youhave-paid','Ryt merchant payment','{"version":1,"parts":["You have paid ",{"kind":"amount","field":"amount"}," to ",{"kind":"text","field":"merchant"}," on ",{"kind":"date","field":"transaction_date"},", ",{"kind":"time"}," (GMT+8) using your main account"],"direction":"expense"}'::jsonb),
('52000000-0000-4000-8000-000000000008','my.rytbank.app','ryt-card-payment','Ryt card payment','{"version":1,"parts":[{"kind":"amount","field":"amount"}," paid at ",{"kind":"text","field":"merchant"}," using your Main Account"],"direction":"expense"}'::jsonb),
('52000000-0000-4000-8000-000000000009','*','context-sent','Transaction amount','{"version":1,"parts":["sent ",{"kind":"amount","field":"amount"}],"match":"contains"}'::jsonb),
('52000000-0000-4000-8000-000000000010','*','context-paid','Transaction amount','{"version":1,"parts":["paid ",{"kind":"amount","field":"amount"}],"match":"contains"}'::jsonb),
('52000000-0000-4000-8000-000000000011','*','context-received','Transaction amount','{"version":1,"parts":["received ",{"kind":"amount","field":"amount"}],"match":"contains"}'::jsonb),
('52000000-0000-4000-8000-000000000012','*','context-transferred','Transaction amount','{"version":1,"parts":["transferred ",{"kind":"amount","field":"amount"}],"match":"contains"}'::jsonb),
('52000000-0000-4000-8000-000000000013','*','context-paymentof','Transaction amount','{"version":1,"parts":["payment of ",{"kind":"amount","field":"amount"}],"match":"contains"}'::jsonb),
('52000000-0000-4000-8000-000000000014','*','context-amount','Transaction amount','{"version":1,"parts":["amount: ",{"kind":"amount","field":"amount"}],"match":"contains"}'::jsonb),
('52000000-0000-4000-8000-000000000015','*','explicit-date','Explicit transaction date','{"version":1,"parts":[{"kind":"date","field":"transaction_date"}],"match":"contains"}'::jsonb);
notify pgrst,'reload schema';
