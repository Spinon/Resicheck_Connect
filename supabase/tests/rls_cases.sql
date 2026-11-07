-- LOCAL Connect database only; never run against ResiCheck or a remote database.
-- Run with psql -v ON_ERROR_STOP=1 -f supabase/tests/rls_cases.sql as postgres.
-- Fail-fast alternative to pgTAP: no extension or privileged test function needed.
-- Fixtures and helpers disappear on ROLLBACK. SQL sessions/claims simulate the
-- gateway context; this does NOT test JWT signature verification or HTTP/Auth.
-- References: supabase.com/docs/guides/local-development/testing/overview
--             supabase.com/docs/guides/database/postgres/row-level-security
begin;
set local statement_timeout = '30s';
set local lock_timeout = '3s';

create function pg_temp.assert_true(p_value boolean, p_label text)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_value is distinct from true then
    raise exception 'FAIL: %', p_label;
  end if;
  perform set_config('connect_test.assertions',
    (coalesce(nullif(current_setting('connect_test.assertions', true), ''), '0')::int + 1)::text, true);
  raise notice 'PASS: %', p_label;
end $$;

create function pg_temp.expect_error(p_sql text, p_state text, p_label text)
returns void language plpgsql security invoker set search_path = '' as $$
declare actual_state text;
begin
  begin
    execute p_sql;
  exception when others then actual_state := sqlstate;
  end;
  perform pg_temp.assert_true(actual_state = p_state,
    p_label || ' [expected ' || p_state || ', got ' || coalesce(actual_state, 'success') || ']');
end $$;

create function pg_temp.actor(p_number integer)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', '10000000-0000-4000-8000-' || lpad(p_number::text,12,'0'),
    'session_id', '20000000-0000-4000-8000-' || lpad(p_number::text,12,'0'),
    'role', 'authenticated', 'exp', floor(extract(epoch from now()))::bigint + 3600
  )::text, true);
end $$;

-- Ensure helpers execute as the current test role, never postgres through a definer.
do $$ begin
  execute format('grant usage on schema %I to anon, authenticated',
    (select nspname from pg_namespace where oid = pg_my_temp_schema()));
end $$;
revoke all on function pg_temp.assert_true(boolean,text), pg_temp.expect_error(text,text,text), pg_temp.actor(integer) from public;
grant execute on function pg_temp.assert_true(boolean,text), pg_temp.expect_error(text,text,text), pg_temp.actor(integer) to anon, authenticated;

-- Deterministic reserved fixture UUIDs and .invalid emails, no CPF/CNPJ or real data.
-- 1 manager A, 2 staff A, 3 patient A, 4 patient B, 5 staff B, 6 manager B,
-- 7 requester, 8 invitee, 9 platform operator, 10 suspended account,
-- 11 expired session, 12 independent account.
insert into auth.users(id,email,role,aud,created_at,updated_at)
select ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'connect-sql-fixture-' || n || '@example.invalid', 'authenticated', 'authenticated', now(), now()
from generate_series(1,12) n;
insert into auth.sessions(id,user_id,created_at,updated_at,not_after)
select ('20000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  now(), now(), case when n=11 then now()-interval '1 minute' else now()+interval '1 hour' end
from generate_series(1,12) n;
insert into public.profiles(id,display_name)
select id, 'Synthetic person ' || right(id::text,2) from auth.users
where email like 'connect-sql-fixture-%@example.invalid';
insert into private.accounts(user_id,state)
select id, case when id='10000000-0000-4000-8000-000000000010' then 'suspended' else 'active' end
from public.profiles where id::text like '10000000-0000-4000-8000-%';
insert into private.account_identity(user_id) select user_id from private.accounts
where user_id::text like '10000000-0000-4000-8000-%';
insert into public.companies(id,name,address,phone) values
('30000000-0000-4000-8000-000000000001','Synthetic company A','Synthetic address A',''),
('30000000-0000-4000-8000-000000000002','Synthetic company B','Synthetic address B',''),
('30000000-0000-4000-8000-000000000003','Synthetic pending company','',''),
('30000000-0000-4000-8000-000000000004','Synthetic suspended company','','');
insert into private.company_controls(company_id,state) values
('30000000-0000-4000-8000-000000000001','active'),
('30000000-0000-4000-8000-000000000002','active'),
('30000000-0000-4000-8000-000000000003','pending'),
('30000000-0000-4000-8000-000000000004','suspended');
insert into public.memberships(company_id,user_id,role,state) values
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','manager','active'),
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','staff','active'),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005','staff','active'),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000006','manager','active'),
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','patient','active'),
('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004','patient','active'),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','patient','active'),
('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004','patient','active');
insert into public.conversations(id,company_id,patient_id,last_sequence) values
('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003',1),
('40000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004',1),
('40000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003',1),
('40000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000004',1);
insert into public.messages(id,company_id,conversation_id,sender_id,sender_role,sequence,body)
select ('50000000-0000-4000-8000-' || right(c.id::text,12))::uuid,
  c.company_id,c.id,c.patient_id,'patient',1,'Synthetic message ' || right(c.id::text,1)
from public.conversations c where c.id::text like '40000000-0000-4000-8000-%';
insert into private.platform_grants(user_id,grant_name) values
('10000000-0000-4000-8000-000000000009','audit:read'),
('10000000-0000-4000-8000-000000000009','users:metadata:read'),
('10000000-0000-4000-8000-000000000009','companies:metadata:read');
insert into private.staff_invitations(id,company_id,issuer_id,recipient_id,token_hash,expires_at,revoked)
select ('60000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  case when n=5 then '30000000-0000-4000-8000-000000000002'::uuid else '30000000-0000-4000-8000-000000000001'::uuid end,
  case when n=4 then '10000000-0000-4000-8000-000000000012'::uuid
    when n=5 then '10000000-0000-4000-8000-000000000006'::uuid else '10000000-0000-4000-8000-000000000001'::uuid end,
  '10000000-0000-4000-8000-000000000008',
  sha256(convert_to('synthetic-invite-token-only-0000000001','UTF8')),
  case when n=2 then now()-interval '1 minute' else now()+interval '1 hour' end, n=3
from generate_series(1,5) n;

-- Check privileges/structure without replacing runtime row-level tests below.
select pg_temp.assert_true((select bool_and(relrowsecurity) from pg_class
  where oid in ('public.profiles'::regclass,'public.companies'::regclass,
    'public.memberships'::regclass,'public.conversations'::regclass,'public.messages'::regclass)), 'all exposed tables have RLS');
select pg_temp.assert_true(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('link_patient','request_staff','accept_staff_invite','approve_staff','revoke_staff','send_text','set_message_important') and p.prosecdef), 'public command wrappers are security invoker');
select pg_temp.assert_true(not has_function_privilege('authenticated','private.lock_accounts(uuid[])','EXECUTE'), 'account lock helper is not directly callable');
select pg_temp.assert_true((select count(*)=2 and bool_and(not rolsuper and not rolbypassrls and not rolcanlogin)
  from pg_roles where rolname in ('anon','authenticated')), 'client roles cannot login, bypass RLS or act as superuser');

set local role anon;
select set_config('request.jwt.claims','{}',true);
select pg_temp.expect_error('select id from public.companies','42501','anon cannot enumerate companies');
select pg_temp.expect_error('select id from public.messages','42501','anon cannot read messages');
select pg_temp.expect_error('select * from private.accounts','42501','anon cannot read private metadata');
select pg_temp.expect_error($q$select public.link_patient('30000000-0000-4000-8000-000000000001')$q$,'42501','anon cannot invoke commands');
reset role;

set local role authenticated;
select pg_temp.actor(3);
select pg_temp.assert_true(current_user='authenticated','RLS assertions run as authenticated, not owner');
select pg_temp.assert_true((select count(*)=1 from public.profiles),'patient sees only own profile');
select pg_temp.assert_true((select count(*)=2 from public.companies),'only active companies expose public fields');
select pg_temp.assert_true((select count(*)=2 from public.memberships),'patient sees only own two memberships');
select pg_temp.assert_true((select count(*)=2 from public.conversations),'patient sees own chats in two companies');
select pg_temp.assert_true((select count(*)=0 from public.conversations where patient_id='10000000-0000-4000-8000-000000000004'),'patient cannot read another patient chat');
select pg_temp.assert_true((select count(*)=2 from public.messages),'patient sees only own messages across companies');
select pg_temp.expect_error('select * from public.conversations','42501','implementation columns do not leak through SELECT star');
select pg_temp.expect_error('select last_sequence from public.conversations','42501','sequence counter is not a DTO field');
do $$ declare t text; begin
  foreach t in array array['accounts','account_identity','company_controls','message_receipts','staff_invitations','platform_grants','audit_events'] loop
    perform pg_temp.expect_error(format('select * from private.%I',t),'42501','patient cannot read private.' || t);
  end loop;
  foreach t in array array['profiles','companies','memberships','conversations','messages'] loop
    perform pg_temp.expect_error(format('delete from public.%I where false',t),'42501','no direct DELETE ' || t);
  end loop;
end $$;
select pg_temp.expect_error($q$insert into public.memberships(company_id,user_id,role,state) values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','staff','active')$q$,'42501','patient cannot insert own staff role');
select pg_temp.expect_error($q$update public.memberships set role='manager'$q$,'42501','patient cannot escalate role');
select pg_temp.expect_error($q$insert into public.messages(company_id,conversation_id,sender_id,sender_role,sequence,body) values('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','staff',2,'Synthetic spoof')$q$,'42501','direct sender impersonation denied');
select pg_temp.expect_error($q$update public.messages set important=true$q$,'42501','patient cannot update importance directly');
select pg_temp.expect_error($q$select public.set_message_important('30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',true)$q$,'P0001','patient cannot mark important via RPC');
select pg_temp.expect_error($q$select public.approve_staff('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003')$q$,'P0001','patient cannot approve staff');
select pg_temp.expect_error($q$select public.send_text('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','wrong_patient','Synthetic intrusion')$q$,'P0001','patient cannot send to another patient conversation');
select pg_temp.expect_error($q$select public.send_text('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','wrong_company','Synthetic mismatch')$q$,'P0001','company and conversation IDs must agree');

select set_config('connect_test.message', (public.send_text('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','retry_1','Synthetic patient payload')).id::text,true);
select pg_temp.assert_true((select sender_id='10000000-0000-4000-8000-000000000003' and sender_role='patient' and sequence=2 and kind='text' and not important and accepted_at<=now()
  from public.messages where id=current_setting('connect_test.message')::uuid),'server assigns patient author, sequence, time and initial importance');
select pg_temp.assert_true((public.send_text('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','retry_1','Synthetic patient payload')).id=current_setting('connect_test.message')::uuid,'same client ID and body returns same message');
select pg_temp.expect_error($q$select public.send_text('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','retry_1','Different synthetic payload')$q$,'P0001','same client ID with different body conflicts');
do $$ declare b text; begin
  foreach b in array array['','   ',repeat('x',2001),chr(1)] loop
    perform pg_temp.expect_error(format('select public.send_text(%L,%L,%L,%L)',
      '30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','invalid_body',b),'P0001','invalid text body denied');
  end loop;
end $$;
select pg_temp.expect_error($q$select public.send_text('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','bad id','Synthetic payload')$q$,'P0001','invalid idempotency key denied');
select pg_temp.expect_error($q$select public.link_patient('30000000-0000-4000-8000-000000000003')$q$,'P0001','pending company cannot be linked');
select pg_temp.expect_error($q$select public.link_patient('30000000-0000-4000-8000-000000000004')$q$,'P0001','suspended company cannot be linked');

select pg_temp.actor(2);
select pg_temp.assert_true((select count(*)=2 from public.conversations),'approved staff sees every patient chat in own company');
select pg_temp.assert_true((select count(*)=0 from public.conversations where company_id='30000000-0000-4000-8000-000000000002'),'staff cannot see other company chats');
select pg_temp.assert_true((select count(*)=0 from public.messages where company_id='30000000-0000-4000-8000-000000000002'),'staff cannot read other company messages');
select pg_temp.assert_true((select count(*)=1 from public.memberships),'ordinary staff cannot enumerate colleagues memberships');
select pg_temp.assert_true((public.send_text('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','staff_reply','Synthetic staff reply')).sender_role='staff','staff may answer any own-company patient');
select pg_temp.assert_true((public.set_message_important('30000000-0000-4000-8000-000000000001',current_setting('connect_test.message')::uuid,true)).important,'staff may mark own-company message important');
select pg_temp.expect_error($q$select public.set_message_important('30000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000003',true)$q$,'P0001','staff cannot mark other-company message');
select pg_temp.expect_error($q$select public.send_text('30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000003','other_company','Synthetic intrusion')$q$,'P0001','staff cannot send in another company');
select pg_temp.expect_error($q$select public.approve_staff('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000007')$q$,'P0001','staff cannot approve colleagues');

select pg_temp.actor(1);
select pg_temp.assert_true((select count(*)=4 from public.memberships),'manager sees own company memberships');
select pg_temp.assert_true((select count(*)=0 from public.memberships where company_id='30000000-0000-4000-8000-000000000002'),'manager cannot see other company memberships');
select pg_temp.assert_true((select count(*)=0 from public.messages),'manager-only role does not implicitly grant chat');
select pg_temp.expect_error('select * from private.audit_events','42501','manager cannot read restricted audit table');
select pg_temp.expect_error($q$select public.approve_staff('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000007')$q$,'P0001','manager cannot approve for another company');

-- Independent registration requests approval, and cannot read chat while pending.
select pg_temp.actor(7);
select public.request_staff('30000000-0000-4000-8000-000000000001');
select public.request_staff('30000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select count(*)=1 and bool_and(state='pending') from public.memberships),'staff request remains pending and idempotent');
select pg_temp.assert_true((select count(*)=0 from public.messages),'pending staff sees no chat');
select pg_temp.expect_error($q$select public.approve_staff('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000007')$q$,'P0001','pending staff cannot self-approve');
select pg_temp.actor(1);
select public.approve_staff('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000007');
select pg_temp.actor(7);
select pg_temp.assert_true((select count(*)=2 from public.conversations),'manager approval activates staff access immediately');

-- Invitation path activates directly, without an extra approval.
select pg_temp.actor(12);
select pg_temp.expect_error($q$select public.accept_staff_invite('60000000-0000-4000-8000-000000000001','synthetic-invite-token-only-0000000001')$q$,'P0001','invitation is bound to intended recipient');
select pg_temp.actor(8);
select pg_temp.expect_error($q$select public.accept_staff_invite('60000000-0000-4000-8000-000000000001','synthetic-invite-token-only-WRONG00001')$q$,'P0001','wrong invitation token denied');
select pg_temp.expect_error($q$select public.accept_staff_invite('60000000-0000-4000-8000-000000000001','short')$q$,'P0001','short token denied');
select pg_temp.expect_error($q$select public.accept_staff_invite('60000000-0000-4000-8000-000000000002','synthetic-invite-token-only-0000000001')$q$,'P0001','expired invitation denied');
select pg_temp.expect_error($q$select public.accept_staff_invite('60000000-0000-4000-8000-000000000003','synthetic-invite-token-only-0000000001')$q$,'P0001','revoked invitation denied');
select pg_temp.expect_error($q$select public.accept_staff_invite('60000000-0000-4000-8000-000000000004','synthetic-invite-token-only-0000000001')$q$,'P0001','issuer must be active manager');
select public.accept_staff_invite('60000000-0000-4000-8000-000000000001','synthetic-invite-token-only-0000000001');
select public.accept_staff_invite('60000000-0000-4000-8000-000000000001','synthetic-invite-token-only-0000000001');
select pg_temp.assert_true((select count(*)=1 and bool_and(state='active' and role='staff') from public.memberships),'valid invitation activates staff directly and replay is idempotent');
select pg_temp.assert_true((select count(*)=2 from public.conversations),'invited staff enters company chats directly');
select pg_temp.expect_error($q$select public.accept_staff_invite('60000000-0000-4000-8000-000000000005','synthetic-invite-token-only-0000000001')$q$,'P0001','invitation cannot activate staff in a second company');
select public.request_staff('30000000-0000-4000-8000-000000000002');
select pg_temp.actor(6);
select pg_temp.expect_error($q$select public.approve_staff('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000008')$q$,'P0001','manager cannot activate staff already active elsewhere');
reset role;
select pg_temp.expect_error($q$insert into public.memberships(company_id,user_id,role,state) values('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','staff','active')$q$,'23505','database constraint independently enforces one active staff company');
select pg_temp.assert_true((select consumed_by='10000000-0000-4000-8000-000000000008' from private.staff_invitations where id='60000000-0000-4000-8000-000000000001'),'invitation consumption persisted atomically');

-- Patient linking is immediate in either company, without approval or unified history.
set local role authenticated;
select pg_temp.actor(12);
select set_config('connect_test.new_conversation',public.link_patient('30000000-0000-4000-8000-000000000001')::text,true);
select pg_temp.assert_true(public.link_patient('30000000-0000-4000-8000-000000000001')=current_setting('connect_test.new_conversation')::uuid,'patient linking returns same own conversation on retry');
select public.link_patient('30000000-0000-4000-8000-000000000002');
select pg_temp.assert_true((select count(*)=2 and bool_and(role='patient' and state='active') from public.memberships),'patient may link immediately to multiple companies');
select pg_temp.assert_true((select count(*)=2 from public.conversations),'linked patient sees only own new chats');
select pg_temp.assert_true((select count(*)=0 from public.messages),'patient company linking does not merge other histories');

-- Platform operational grants alone never confer clinical content or raw logs.
select pg_temp.actor(9);
select pg_temp.assert_true((select count(*)=0 from public.messages),'platform operator has no automatic message access');
select pg_temp.assert_true((select count(*)=0 from public.conversations),'platform operator has no automatic conversation access');
select pg_temp.assert_true((select count(*)=0 from public.memberships),'platform operator cannot enumerate memberships without explicit API');
select pg_temp.expect_error('select * from private.audit_events','42501','platform grant is not raw audit table permission');
select pg_temp.expect_error('select * from private.account_identity','42501','platform grant is not identity table permission');

-- Forged user_metadata cannot elevate permissions; gateway verifies JWT signature separately.
select pg_temp.actor(12);
select set_config('request.jwt.claims',(current_setting('request.jwt.claims')::jsonb ||
  '{"user_metadata":{"role":"manager","company_id":"30000000-0000-4000-8000-000000000001"}}'::jsonb)::text,true);
select pg_temp.expect_error($q$select public.approve_staff('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000007')$q$,'P0001','user-editable metadata does not authorize manager action');

-- Every protected read/command requires a matching live session and active account.
select pg_temp.actor(3);
select set_config('request.jwt.claims',(current_setting('request.jwt.claims')::jsonb - 'session_id')::text,true);
select pg_temp.assert_true((select count(*)=0 from public.messages),'missing session claim hides messages');
select pg_temp.expect_error($q$select public.link_patient('30000000-0000-4000-8000-000000000001')$q$,'P0001','missing session claim denies command');
select pg_temp.actor(3);
select set_config('request.jwt.claims',jsonb_set(current_setting('request.jwt.claims')::jsonb,'{session_id}','"20000000-0000-4000-8000-000000000002"')::text,true);
select pg_temp.assert_true((select count(*)=0 from public.messages),'session from different account cannot authorize actor');
select pg_temp.actor(3);
select set_config('request.jwt.claims',jsonb_set(current_setting('request.jwt.claims')::jsonb,'{exp}',to_jsonb(floor(extract(epoch from now()))::bigint-1))::text,true);
select pg_temp.assert_true((select count(*)=0 from public.messages),'expired JWT claim hides content');
select pg_temp.expect_error($q$select public.link_patient('30000000-0000-4000-8000-000000000001')$q$,'P0001','expired JWT claim denies command');
select pg_temp.actor(3);
select set_config('request.jwt.claims',jsonb_set(current_setting('request.jwt.claims')::jsonb,'{exp}','"not-an-expiry"')::text,true);
select pg_temp.assert_true((select count(*)=0 from public.messages),'malformed expiry denies safely');
select pg_temp.actor(10);
select pg_temp.assert_true((select count(*)=0 from public.companies),'suspended account sees no directory');
select pg_temp.expect_error($q$select public.link_patient('30000000-0000-4000-8000-000000000001')$q$,'P0001','suspended account cannot link');
select pg_temp.actor(11);
select pg_temp.assert_true((select count(*)=0 from public.companies),'expired database session sees no directory');
select pg_temp.expect_error($q$select public.link_patient('30000000-0000-4000-8000-000000000001')$q$,'P0001','expired database session denies command');
reset role;
delete from auth.sessions where id='20000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.actor(3);
select pg_temp.assert_true((select count(*)=0 from public.messages),'deleted session invalidates unexpired token immediately');
select pg_temp.expect_error($q$select public.send_text('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','deleted_session','Synthetic blocked')$q$,'P0001','deleted session cannot send');
reset role;

-- Revocation applies to the same already-issued claims, including idempotent retries.
set local role authenticated;
select pg_temp.actor(1);
select public.revoke_staff('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
select pg_temp.actor(2);
select pg_temp.assert_true((select count(*)=0 from public.conversations),'revoked staff loses conversation access without JWT refresh');
select pg_temp.assert_true((select count(*)=0 from public.messages),'revoked staff loses message access without JWT refresh');
select pg_temp.expect_error($q$select public.send_text('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','staff_reply','Synthetic staff reply')$q$,'P0001','revoked staff cannot retrieve receipt by retry');
select pg_temp.expect_error($q$select public.set_message_important('30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',true)$q$,'P0001','revoked staff cannot mark important');
select pg_temp.expect_error($q$select public.request_staff('30000000-0000-4000-8000-000000000001')$q$,'P0001','revoked staff cannot silently rejoin');
select pg_temp.actor(1);
select public.revoke_staff('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000008');
select pg_temp.actor(8);
select pg_temp.expect_error($q$select public.accept_staff_invite('60000000-0000-4000-8000-000000000001','synthetic-invite-token-only-0000000001')$q$,'P0001','consumed invitation cannot undo staff revocation');
reset role;

-- Company suspension removes clinical reads/commands independently of membership state.
update private.company_controls set state='suspended' where company_id='30000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.actor(7);
select pg_temp.assert_true((select count(*)=0 from public.messages),'company suspension hides staff messages immediately');
select pg_temp.expect_error($q$select public.send_text('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','suspended_company','Synthetic blocked')$q$,'P0001','company suspension denies send');
select pg_temp.actor(4);
select pg_temp.assert_true((select count(*)=0 from public.messages where company_id='30000000-0000-4000-8000-000000000001'),'company suspension hides patient messages');
select pg_temp.assert_true((select count(*)=1 from public.conversations where company_id='30000000-0000-4000-8000-000000000002'),'company suspension does not revoke another company context');
reset role;

-- Privileged invariant checks only: runtime role tests above establish authorization.
select pg_temp.assert_true((select count(*)=1 from private.message_receipts where sender_id='10000000-0000-4000-8000-000000000003' and client_message_id='retry_1'),'idempotent retry creates one receipt');
select pg_temp.assert_true((select count(*)=1 from private.audit_events where action='message-accepted' and target_id=current_setting('connect_test.message')::uuid),'idempotent retry creates one accepted event');
select pg_temp.assert_true((select count(*)=1 from private.audit_events where action='staff-invite-accepted' and target_id='60000000-0000-4000-8000-000000000001'),'invitation replay creates no duplicate event');
select pg_temp.assert_true((select bool_and(last_sequence=(select max(sequence) from public.messages m where m.conversation_id=c.id)) from public.conversations c where c.id::text like '40000000-0000-4000-8000-%'),'rejected sends do not consume conversation sequence');
do $$ begin raise notice 'Completed % local SQL assertions; rolling back all fixtures.', current_setting('connect_test.assertions'); end $$;
rollback;
