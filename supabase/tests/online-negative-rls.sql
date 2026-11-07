-- Authorized Connect-only negative RLS checks. No Auth users/sessions are created.
-- Claims are SQL test context, NOT issued JWTs or a positive Auth/login test.
begin;
set local statement_timeout='30s';
set local lock_timeout='3s';
create function pg_temp.assert_online(p_value boolean,p_label text) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_value is distinct from true then raise exception 'Online negative assertion failed: %',p_label; end if;
 perform set_config('connect_online.assertions',(coalesce(nullif(current_setting('connect_online.assertions',true),''),'0')::int+1)::text,true);
end $$;
create function pg_temp.deny_online(p_sql text,p_state text,p_label text) returns void language plpgsql security invoker set search_path='' as $$
declare actual text;
begin
 begin execute p_sql; exception when others then actual:=sqlstate; end;
 perform pg_temp.assert_online(actual=p_state,p_label);
end $$;
do $$ begin execute format('grant usage on schema %I to anon,authenticated',(select nspname from pg_namespace where oid=pg_my_temp_schema())); end $$;
revoke all on function pg_temp.assert_online(boolean,text),pg_temp.deny_online(text,text,text) from public;
grant execute on function pg_temp.assert_online(boolean,text),pg_temp.deny_online(text,text,text) to anon,authenticated;

set local role anon;
select pg_temp.assert_online(current_user='anon','actual anonymous role');
select pg_temp.deny_online('select id from public.companies','42501','anon company rows denied');
select pg_temp.deny_online('select id from public.profiles','42501','anon profiles denied');
select pg_temp.deny_online('select user_id from public.memberships','42501','anon memberships denied');
select pg_temp.deny_online('select id from public.conversations','42501','anon conversation denied');
select pg_temp.deny_online('select id from public.messages','42501','anon messages denied');
select pg_temp.deny_online('select user_id from private.accounts','42501','anon private denied');
select pg_temp.deny_online('select public.link_patient(gen_random_uuid())','42501','anon RPC denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{}',true);
select pg_temp.assert_online(current_user='authenticated','actual authenticated nonprivileged role');
select pg_temp.assert_online(not private.active_actor(),'no session is not active');
select pg_temp.assert_online((select count(id)=0 from public.companies),'no-session company rows hidden');
select pg_temp.assert_online((select count(id)=0 from public.profiles),'no-session profiles hidden');
select pg_temp.assert_online((select count(user_id)=0 from public.memberships),'no-session memberships hidden');
select pg_temp.assert_online((select count(id)=0 from public.conversations),'no-session conversations hidden');
select pg_temp.assert_online((select count(id)=0 from public.messages),'no-session messages hidden');
select pg_temp.deny_online('select user_id from private.account_identity','42501','identity private denied');
select pg_temp.deny_online('select id from private.audit_events','42501','audit private denied');
select pg_temp.deny_online('select user_id from private.platform_grants','42501','platform grant rows private denied');
select pg_temp.deny_online('select last_sequence from public.conversations','42501','internal counter not exposed');
select pg_temp.deny_online('select private.lock_accounts(array[gen_random_uuid()])','42501','internal lock is not callable');
select pg_temp.deny_online($q$insert into public.companies(name) values('Synthetic denied online insert')$q$,'42501','direct company insert denied');
select pg_temp.deny_online($q$update public.companies set name='Synthetic denied update'$q$,'42501','direct update denied');
select pg_temp.deny_online('delete from public.companies','42501','direct delete denied');
select pg_temp.deny_online($q$insert into public.profiles(id,display_name) values(gen_random_uuid(),'Synthetic denied profile')$q$,'42501','direct profile promotion denied');
select pg_temp.deny_online('select public.link_patient(gen_random_uuid())','P0001','no-session patient command denied');
select pg_temp.deny_online('select public.request_staff(gen_random_uuid())','P0001','no-session staff command denied');
select pg_temp.deny_online('select public.approve_staff(gen_random_uuid(),gen_random_uuid())','P0001','no-session approval denied');
select pg_temp.deny_online('select public.revoke_staff(gen_random_uuid(),gen_random_uuid())','P0001','no-session revocation denied');
select pg_temp.deny_online($q$select public.send_text(gen_random_uuid(),gen_random_uuid(),'denied','Synthetic denied body')$q$,'P0001','no-session message denied');
select pg_temp.deny_online('select public.set_message_important(gen_random_uuid(),gen_random_uuid(),true)','P0001','no-session importance denied');
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'session_id',gen_random_uuid(),'role','authenticated',
 'exp',extract(epoch from now()+interval '1 hour')::bigint,'user_metadata',jsonb_build_object('role','admin','approved',true))::text,true);
select pg_temp.assert_online(not private.active_actor(),'synthetic unissued context cannot activate actor');
select pg_temp.assert_online((select count(id)=0 from public.messages),'forged role metadata reveals no messages');
select pg_temp.assert_online(not private.has_role(gen_random_uuid(),'manager'),'metadata is not manager authorization');
reset role;
select jsonb_build_object('checks',current_setting('connect_online.assertions')::int,'status','passed','scope','negative real-database RLS with SQL fixture context',
 'authUsersCreated',false,'authSessionsCreated',false,'positiveLoginTested',false) as online_negative_rls_result;
rollback;
