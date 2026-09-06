begin;
create function pg_temp.check_approved(ok boolean,label text) returns void language plpgsql as $f$
begin if ok is distinct from true then raise exception 'FAILED: %',label; end if; end;
$f$;
insert into auth.users(id) values('d4000000-0000-4000-8000-000000000001');
insert into public.dim_finance_sources(id,user_id,name) values
 ('d4000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000001','Ryt Bank'),
 ('d4000000-0000-4000-8000-000000000003','d4000000-0000-4000-8000-000000000001','TnG');
insert into public.dim_finance_payees(id,user_id,name,normalized_name) values
 ('d4000000-0000-4000-8000-000000000004','d4000000-0000-4000-8000-000000000001','Alex Tan','alextan');
select public.finance_set_parser_learning_cutoff('d4000000-0000-4000-8000-000000000001','2026-09-05T16:00:00Z');
do $fixtures$
declare n int; intake uuid; tx uuid; src uuid; text_value text; ref text; direction text;
begin for n in 1..22 loop
 intake:=md5('approved-intake-'||n)::uuid; tx:=md5('approved-tx-'||n)::uuid;
 src:=case when n>16 then 'd4000000-0000-4000-8000-000000000002'::uuid else 'd4000000-0000-4000-8000-000000000003'::uuid end;
 direction:=case when n between 11 and 13 then 'income' else 'expense' end;
 ref:=case when n<=10 then 'ABC12345678901234567890 71275836468'||lpad(n::text,3,'0') when n<=16 then '2026090311121700010100171275'||lpad(n::text,6,'0') else 'SYN123456789'||n end;
 text_value:=case when n<=10 then E'-RM2.55 +2 points\nTransaction Type Payment\nMerchant Fixture Shop\nDate/Time 01/09/2026 12:22:34\nWallet Ref ABC12345678901234567890\n71275836468'||lpad(n::text,3,'0')||E'\nStatus Successful'
 when n<=13 then E'+RM40.30\nTransaction Type Receive from Wallet\nReceive From Alex Tan\nDate/Time 01/09/2026 12:22:34'
 when n<=16 then E'Transaction Type Transfer to Wallet\nDate/Time 01/09/2026 12:22:34\n'||ref||E'\nWallet Ref 1"\n164'
 else E'-RM12.50\n'||case when n<=19 then 'Today, 1:43 PM' else '1 Sep 2026, 7.09 PM' end||E'\nReference ID @ '||ref end;
 insert into public.finance_intake_items(id,user_id,source,status,created_at,original_filename,ocr_normalized_text)
 values(intake,'d4000000-0000-4000-8000-000000000001','screenshot','completed','2026-09-05T16:00:00Z',
 'Screenshot_20260901_164928_'||case when n>16 then 'Ryt Bank' else 'TNG eWallet' end||'.png',text_value);
 insert into public.finance_transactions(id,user_id,source_id,status,direction,amount,transaction_date,source,reference_number,intake_item_id,merchant,payee_id)
 values(tx,'d4000000-0000-4000-8000-000000000001',src,'confirmed',direction,12.5,'2026-09-01','screenshot',
 case when n<=2 then 'CONFLICT-'||n else ref end,intake,case when n<=10 then 'Fixture Shop' end,
 case when n between 11 and 13 then 'd4000000-0000-4000-8000-000000000004'::uuid end);
 insert into public.finance_candidate_transactions(id,user_id,confirmed_transaction_id,intake_item_id,status)
 values(md5('approved-candidate-'||n)::uuid,'d4000000-0000-4000-8000-000000000001',tx,intake,'accepted');
 end loop;
end;
$fixtures$;
select pg_temp.check_approved((public.finance_install_approved_receipt_rules('d4000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000003')->>'inserted')::int=14,'all fourteen scoped definitions installed');
select pg_temp.check_approved((public.finance_install_approved_receipt_rules('d4000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-000000000003')->>'inserted')::int=0,'operator retry is idempotent');
select pg_temp.check_approved((select status='rejected' and evidence_count=8 and contradiction_count=2 from public.finance_parser_templates where configuration->>'pattern'='tng_wallet_wrapped'),'approved wrapped rule retains conflicts and cannot enter shadow');
select pg_temp.check_approved(not exists(select 1 from public.finance_parser_templates where status='active'),'approval does not activate any template');
select pg_temp.check_approved((select count(*)>=13 from public.finance_parser_templates where status='shadow'),'consistent reviewed rules enter shadow');
select pg_temp.check_approved(not exists(select 1 from public.finance_approved_receipt_rule_catalog() where configuration::text ilike '%transfer to wallet%'),'transfer-to-wallet rule excluded');
select pg_temp.check_approved((select count(*)=0 from public.finance_corrections),'rule installation does not change user correction history');
select pg_temp.check_approved(not has_function_privilege('service_role','public.finance_install_approved_receipt_rules(uuid,uuid,uuid)','execute'),'installation remains operator-only');
rollback;
