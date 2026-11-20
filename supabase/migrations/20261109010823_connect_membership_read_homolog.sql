-- Connect homolog membership/read rollout. No activation, message send or importance changes.
begin;
set local lock_timeout='3s';set local statement_timeout='20s';set local search_path=pg_catalog;
select pg_advisory_xact_lock(900001,192);
do $guard$begin
 if current_user<>'postgres' or current_setting('server_encoding')<>'UTF8'
 or (select nspowner from pg_namespace where nspname='private') is distinct from 'connect_hmac_registration'::regrole
 or has_schema_privilege('postgres','private','CREATE')
 or not (exists(select 1 from pg_auth_members where roleid='connect_hmac_registration'::regrole and member='postgres'::regrole and admin_option and not set_option and not inherit_option) and not exists(select 1 from pg_auth_members where roleid='connect_hmac_registration'::regrole and (member<>'postgres'::regrole or set_option or inherit_option)))
 or not exists(select 1 from pg_class c where c.oid=to_regclass('private.account_identity') and c.relowner='connect_hmac_registration'::regrole and c.relrowsecurity)
 or not exists(select 1 from pg_class c where c.oid=to_regclass('private.accounts') and c.relowner='connect_hmac_registration'::regrole and c.relrowsecurity)
 or not exists(select 1 from pg_class c where c.oid=to_regclass('private.company_controls') and c.relowner='connect_hmac_registration'::regrole and c.relrowsecurity)
 or not exists(select 1 from pg_class c where c.oid=to_regclass('public.companies') and c.relowner='connect_hmac_registration'::regrole and c.relrowsecurity)
 or not exists(select 1 from pg_class c where c.oid=to_regclass('public.conversations') and c.relowner='postgres'::regrole and c.relrowsecurity)
 or not exists(select 1 from pg_class c where c.oid=to_regclass('public.memberships') and c.relowner='postgres'::regrole and c.relrowsecurity)
 or not exists(select 1 from pg_class c where c.oid=to_regclass('public.messages') and c.relowner='postgres'::regrole and c.relrowsecurity)
 or not exists(select 1 from pg_class c where c.oid=to_regclass('public.profiles') and c.relowner='connect_hmac_registration'::regrole and c.relrowsecurity)
 or not exists(select 1 from pg_proc p where p.oid=to_regprocedure('private.accept_staff_invite(uuid,text)') and p.proowner='postgres'::regrole and p.prosecdef and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='0911bcc13c848918b916447edc05ff4b3b34d1820533a9a367669f2a97820349')
 or not exists(select 1 from pg_proc p where p.oid=to_regprocedure('private.active_actor()') and p.proowner='postgres'::regrole and p.prosecdef and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='42cc22d1661362da077f8e653b460f1f9f0c794cbd255a6330ee6097b2df8fc6')
 or not exists(select 1 from pg_proc p where p.oid=to_regprocedure('private.approve_staff(uuid,uuid)') and p.proowner='postgres'::regrole and p.prosecdef and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='6ecc588e51a86b70d86ba3e6114d9681f329e41a0431ac13b3ba8dac2c72c0b3')
 or not exists(select 1 from pg_proc p where p.oid=to_regprocedure('private.can_chat(uuid,uuid)') and p.proowner='postgres'::regrole and p.prosecdef and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='7d4365cd46a06544e701ff3d912dd6f0e5931aa1f838e63a905f5f2284560aeb')
 or not exists(select 1 from pg_proc p where p.oid=to_regprocedure('private.can_read_conversation(uuid,uuid)') and p.proowner='postgres'::regrole and p.prosecdef and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='84e689eb4cd850bc6f386e3c4bdbaa945776b760dff42832750e2a4ddc09692c')
 or not exists(select 1 from pg_proc p where p.oid=to_regprocedure('private.company_active(uuid)') and p.proowner='postgres'::regrole and p.prosecdef and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='912f033480980d9444be5b94a94dcd4b4b549f7270be5251a3b7f2388c1b1591')
 or not exists(select 1 from pg_proc p where p.oid=to_regprocedure('private.has_role(uuid,text)') and p.proowner='postgres'::regrole and p.prosecdef and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='d53e814a3e096982c3450a9481018c499c85eaef6616fecd3a89d45a23621b41')
 or not exists(select 1 from pg_proc p where p.oid=to_regprocedure('private.link_patient(uuid)') and p.proowner='postgres'::regrole and p.prosecdef and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='180df5b36c6cd3ae9474009ab8d3bdac926319a6334160d12f6985405e726183')
 or not exists(select 1 from pg_proc p where p.oid=to_regprocedure('private.lock_accounts(uuid[])') and p.proowner='postgres'::regrole and p.prosecdef and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='1d62bde4d7563e84f7b659244b6de95add39fec3dfb9017405dce46cbccc040f')
 or not exists(select 1 from pg_proc p where p.oid=to_regprocedure('private.request_staff(uuid)') and p.proowner='postgres'::regrole and p.prosecdef and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='3e1bfd4419ea59ed200f2915ccbaa8570b75e3a01819dc7f9e02798c0708c11e')
 or not exists(select 1 from pg_proc p where p.oid=to_regprocedure('private.revoke_staff(uuid,uuid)') and p.proowner='postgres'::regrole and p.prosecdef and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')='91ea8151cc989335012b153660649772bb3e8060e468f50f5ce1ac6db6a57546')
 or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.proname in ('membership_directory_actor','membership_directory_search','membership_directory_mine','membership_directory_staff','membership_directory_inbox','connect_own_staff_employer','company_search_key','patient_company_entry','my_connect_memberships','search_connect_companies','managed_connect_staff','connect_staff_inbox','my_connect_staff_employer','connect_patient_company'))
 then raise exception 'Connect membership initial state refused';end if;end$guard$;
-- Existing ADMIN custodianship only, temporary SET/CREATE within this transaction.
grant connect_hmac_registration to postgres with inherit false,set true;
set local role connect_hmac_registration;
grant create on schema private to postgres;
set local role postgres;
-- Pinned source: supabase/candidates/membership-directory/directory.CANDIDATE.sql; changes only split-owner preflight and outer transaction.
-- LOCAL CANDIDATE ONLY. Read projections over the existing foundation.
-- Does not activate accounts, issue invitations, change RLS or store identity.

do $$begin
 if to_regprocedure('private.active_actor()') is null or to_regprocedure('private.has_role(uuid,text)') is null
   or has_schema_privilege('authenticated','private','CREATE')
   or (select nspowner from pg_namespace where nspname='private') is distinct from 'connect_hmac_registration'::regrole
   or (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('profiles','companies','memberships','conversations') and c.relowner=case when c.relname in ('profiles','companies') then 'connect_hmac_registration'::regrole else current_user::regrole end)<>4 then
   raise exception 'Membership directory preflight failed';
 end if;
end$$;
create function private.membership_directory_actor() returns void language plpgsql stable set search_path='' as $$begin
 if not private.active_actor() then raise exception using errcode='P0001',message='Operação indisponível';end if;
end$$;
create function private.membership_directory_search(p_query text,p_after uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 perform private.membership_directory_actor();
 if p_query is null or char_length(btrim(p_query)) not between 2 and 80 or p_query ~ '[\x00-\x1f\x7f]' then raise exception using errcode='P0001',message='Operação indisponível';end if;
 with candidates as materialized(select c.id company_id,c.name,c.address,c.phone from public.companies c
   where private.company_active(c.id) and (p_after is null or c.id>p_after) and strpos(lower(c.name),lower(btrim(p_query)))>0 order by c.id limit 11),
 page as materialized(select * from candidates order by company_id limit 10)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by company_id) from page p),'[]'::jsonb),'has_more',(select count(*)>10 from candidates),'next_cursor',case when (select count(*)>10 from candidates) then (select to_jsonb(company_id) from page order by company_id desc limit 1) else null end) into result;
 return result;
end$$;
create function private.membership_directory_mine(p_after_company uuid,p_after_role text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 perform private.membership_directory_actor();
 if (p_after_company is null)<>(p_after_role is null) or (p_after_role is not null and p_after_role not in ('manager','patient','staff')) then raise exception using errcode='P0001',message='Operação indisponível';end if;
 with candidates as materialized(select m.company_id,c.name,c.address,c.phone,m.role,m.state,
   case when m.role='patient' and m.state='active' then (select v.id from public.conversations v where v.company_id=m.company_id and v.patient_id=auth.uid()) else null end conversation_id
   from public.memberships m join public.companies c on c.id=m.company_id where m.user_id=auth.uid() and private.company_active(m.company_id)
   and (p_after_company is null or (m.company_id,m.role collate "C")>(p_after_company,p_after_role collate "C"))
   order by m.company_id,m.role collate "C" limit 11),page as materialized(select * from candidates order by company_id,role collate "C" limit 10)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by company_id,role collate "C") from page p),'[]'::jsonb),'has_more',(select count(*)>10 from candidates),'next_cursor',case when (select count(*)>10 from candidates) then (select jsonb_build_object('company_id',company_id,'role',role) from page order by company_id desc,role collate "C" desc limit 1) else null end) into result;
 return result;
end$$;
create function private.membership_directory_staff(p_company uuid,p_after uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 perform private.membership_directory_actor();
 if not private.has_role(p_company,'manager') then raise exception using errcode='P0001',message='Operação indisponível';end if;
 with candidates as materialized(select m.company_id,m.user_id,p.display_name,m.state from public.memberships m join public.profiles p on p.id=m.user_id
   where m.company_id=p_company and m.role='staff' and (p_after is null or m.user_id>p_after) order by m.user_id limit 11),
 page as materialized(select * from candidates order by user_id limit 10)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by user_id) from page p),'[]'::jsonb),'has_more',(select count(*)>10 from candidates),'next_cursor',case when (select count(*)>10 from candidates) then (select to_jsonb(user_id) from page order by user_id desc limit 1) else null end) into result;
 return result;
end$$;
create function private.membership_directory_inbox(p_company uuid,p_after uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 perform private.membership_directory_actor();
 if not private.has_role(p_company,'staff') then raise exception using errcode='P0001',message='Operação indisponível';end if;
 with candidates as materialized(select c.company_id,c.id conversation_id,c.patient_id,p.display_name from public.conversations c join public.profiles p on p.id=c.patient_id
   where c.company_id=p_company and private.can_read_conversation(c.company_id,c.id) and (p_after is null or c.id>p_after) order by c.id limit 11),
 page as materialized(select * from candidates order by conversation_id limit 10)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by conversation_id) from page p),'[]'::jsonb),'has_more',(select count(*)>10 from candidates),'next_cursor',case when (select count(*)>10 from candidates) then (select to_jsonb(conversation_id) from page order by conversation_id desc limit 1) else null end) into result;
 return result;
end$$;
create function public.search_connect_companies(p_query text,p_after uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.membership_directory_search(p_query,p_after)$$;
create function public.my_connect_memberships(p_after_company uuid,p_after_role text) returns jsonb language sql stable security invoker set search_path='' as $$select private.membership_directory_mine(p_after_company,p_after_role)$$;
create function public.managed_connect_staff(p_company uuid,p_after uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.membership_directory_staff(p_company,p_after)$$;
create function public.connect_staff_inbox(p_company uuid,p_after uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.membership_directory_inbox(p_company,p_after)$$;
revoke all on function private.membership_directory_actor(),private.membership_directory_search(text,uuid),private.membership_directory_mine(uuid,text),private.membership_directory_staff(uuid,uuid),private.membership_directory_inbox(uuid,uuid),public.search_connect_companies(text,uuid),public.my_connect_memberships(uuid,text),public.managed_connect_staff(uuid,uuid),public.connect_staff_inbox(uuid,uuid) from public,anon,authenticated;
grant execute on function private.membership_directory_search(text,uuid),private.membership_directory_mine(uuid,text),private.membership_directory_staff(uuid,uuid),private.membership_directory_inbox(uuid,uuid),public.search_connect_companies(text,uuid),public.my_connect_memberships(uuid,text),public.managed_connect_staff(uuid,uuid),public.connect_staff_inbox(uuid,uuid) to authenticated;
do $$begin
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where ((n.nspname='private' and p.proname in ('membership_directory_actor','membership_directory_search','membership_directory_mine','membership_directory_staff','membership_directory_inbox'))
     or(n.nspname='public' and p.proname in ('search_connect_companies','my_connect_memberships','managed_connect_staff','connect_staff_inbox')))
   and a.grantee<>p.proowner and (a.grantee<>'authenticated'::regrole or a.privilege_type<>'EXECUTE' or a.is_grantable or p.proname='membership_directory_actor')) then
   raise exception 'Membership directory ACL failed';end if;
end$$;

-- Pinned source: supabase/candidates/single-staff-employer/request.CANDIDATE.sql; changes only split-owner preflight and outer transaction.
-- Local reviewed candidate only. No canonical/remote migration or data deletion.

select pg_advisory_xact_lock(900001,1);
do $preflight$
declare definition text;
begin
  select replace(p.prosrc,E'\r\n',E'\n') into definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='private' and p.proname='request_staff' and p.oid=to_regprocedure('private.request_staff(uuid)') and p.prosecdef;
  if definition is null or md5(definition) not in ('81d4f964657d5e6475a709693e4fba43','34b1b79aec357ff853766ab04bc45149') then
    raise exception using errcode='P0001',message='Candidato de vínculo indisponível';
  end if;
end $preflight$;
-- CREATE OR REPLACE preserves existing ownership and EXECUTE grants.
create or replace function private.request_staff(p_company uuid) returns void language plpgsql security definer set search_path='' as $$
declare current_state text;
begin
  if not private.active_actor() then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  perform private.lock_accounts(array[auth.uid()]);
  if not private.active_actor() or not private.company_active(p_company) then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  -- Provisional product rule: no new/replayed request for another employer
  -- while an active staff membership exists. Keep older pending history.
  if exists(select 1 from public.memberships where user_id=auth.uid() and role='staff' and state='active' and company_id<>p_company)
    then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  select state into current_state from public.memberships where company_id=p_company and user_id=auth.uid() and role='staff';
  if current_state in ('active','pending') then return; end if;
  if current_state='revoked' then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  insert into public.memberships(company_id,user_id,role,state) values(p_company,auth.uid(),'staff','pending');
  insert into private.audit_events(actor_id,company_id,action,target_id) values(auth.uid(),p_company,'staff-requested',auth.uid());
end $$;

-- Pinned source: supabase/candidates/single-staff-employer/own-employer.CANDIDATE.sql; changes only split-owner preflight and outer transaction.
-- Local read-only projection candidate. No replacement of existing functions/RLS.

do $$begin
 if to_regprocedure('private.active_actor()') is null
   or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where (n.nspname='private' and p.proname='connect_own_staff_employer') or (n.nspname='public' and p.proname='my_connect_staff_employer'))
   or (select nspowner from pg_namespace where nspname='private') is distinct from 'connect_hmac_registration'::regrole
   or (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where (n.nspname,c.relname) in (('public','memberships'),('public','companies'),('private','company_controls')) and c.relowner=case when c.relname='memberships' then current_user::regrole else 'connect_hmac_registration'::regrole end)<>3 then
   raise exception using errcode='P0001',message='Projeção de vínculo indisponível';
 end if;
end$$;
create function private.connect_own_staff_employer() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if not private.active_actor() then raise exception using errcode='P0001',message='Operação indisponível';end if;
 select jsonb_build_object('state','active','company_id',m.company_id,'name',c.name,'company_available',exists(select 1 from private.company_controls cc where cc.company_id=m.company_id and cc.state='active')) into result
 from public.memberships m join public.companies c on c.id=m.company_id
 where m.user_id=auth.uid() and m.role='staff' and m.state='active';
 return coalesce(result,jsonb_build_object('state','none'));
end$$;
create function public.my_connect_staff_employer() returns jsonb language sql stable security invoker set search_path='' as $$select private.connect_own_staff_employer()$$;
revoke all on function private.connect_own_staff_employer(),public.my_connect_staff_employer() from public,anon,authenticated;
grant execute on function private.connect_own_staff_employer(),public.my_connect_staff_employer() to authenticated;

-- Pinned source: supabase/candidates/company-search-normalization/search.CANDIDATE.sql; changes only split-owner preflight and outer transaction.
-- Local candidate only: literal public-company name search; no new grants or data writes.

do $$begin
 if current_setting('server_encoding')<>'UTF8'
 or (select nspowner from pg_namespace where nspname='private') is distinct from 'connect_hmac_registration'::regrole
 or not exists(select 1 from pg_proc where oid=to_regprocedure('private.membership_directory_search(text,uuid)') and proowner=current_user::regrole and prosecdef and provolatile='s' and proconfig=ARRAY['search_path=""'] and encode(sha256(convert_to(prosrc,'UTF8')),'hex')='873a4df4d81430f774bec217bee634471f107fc914ffee196650dbaa04c4a164')
 then raise exception 'Company search candidate preflight failed';end if;
end$$;
create function private.company_search_key(p_value text) returns text language sql immutable strict parallel safe set search_path='' as $$
 select pg_catalog.lower(pg_catalog.regexp_replace(normalize(p_value,NFD),U&'[\0300-\036F]','','g') collate "C")
$$;
revoke all on function private.company_search_key(text) from public,anon,authenticated;
create or replace function private.membership_directory_search(p_query text,p_after uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;query_key text;begin
 perform private.membership_directory_actor();
 if p_query is null or char_length(btrim(p_query)) not between 2 and 80 or p_query ~ '[\x00-\x1f\x7f]' then raise exception using errcode='P0001',message='Operação indisponível';end if;
 query_key:=private.company_search_key(btrim(p_query));
 if char_length(query_key)<2 then raise exception using errcode='P0001',message='Operação indisponível';end if;
 with candidates as materialized(select c.id company_id,c.name,c.address,c.phone from public.companies c
   where private.company_active(c.id) and (p_after is null or c.id>p_after) and strpos(private.company_search_key(c.name),query_key)>0 order by c.id limit 11),
 page as materialized(select * from candidates order by company_id limit 10)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by company_id) from page p),'[]'::jsonb),'has_more',(select count(*)>10 from candidates),'next_cursor',case when (select count(*)>10 from candidates) then (select to_jsonb(company_id) from page order by company_id desc limit 1) else null end) into result;
 return result;
end$$;

-- Pinned source: supabase/candidates/patient-company-entry/entry.CANDIDATE.sql; changes only split-owner preflight and outer transaction.
-- LOCAL candidate: authenticated public-company details by UUID. No membership writes.

set local lock_timeout='3s';
set local statement_timeout='10s';
do $$begin
 if (select nspowner from pg_namespace where nspname='private') is distinct from 'connect_hmac_registration'::regrole
 or not exists(select 1 from pg_proc where oid=to_regprocedure('private.active_actor()') and encode(sha256(convert_to(prosrc,'UTF8')),'hex')='42cc22d1661362da077f8e653b460f1f9f0c794cbd255a6330ee6097b2df8fc6' and proowner=current_user::regrole and prosecdef and provolatile='s' and proconfig=ARRAY['search_path=""'])
 or not exists(select 1 from pg_proc where oid=to_regprocedure('private.company_active(uuid)') and encode(sha256(convert_to(prosrc,'UTF8')),'hex')='912f033480980d9444be5b94a94dcd4b4b549f7270be5251a3b7f2388c1b1591' and proowner=current_user::regrole and prosecdef and provolatile='s' and proconfig=ARRAY['search_path=""'])
 or to_regprocedure('private.patient_company_entry(uuid)') is not null
 or to_regprocedure('public.connect_patient_company(uuid)') is not null
 then raise exception 'Patient company entry preflight failed';end if;
end$$;
create function private.patient_company_entry(p_company uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;begin
 if not private.active_actor() or p_company is null then raise exception using errcode='P0001',message='Operação indisponível';end if;
 select jsonb_build_object('company_id',c.id,'name',c.name,'address',c.address,'phone',c.phone) into result
 from public.companies c where c.id=p_company and private.company_active(c.id);
 if result is null then raise exception using errcode='P0001',message='Operação indisponível';end if;
 return result;
end$$;
create function public.connect_patient_company(p_company uuid) returns jsonb language sql stable security invoker set search_path='' as $$select private.patient_company_entry(p_company)$$;
revoke all on function private.patient_company_entry(uuid),public.connect_patient_company(uuid) from public,anon,authenticated;
grant execute on function private.patient_company_entry(uuid),public.connect_patient_company(uuid) to authenticated;
do $$begin
 if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where p.oid in ('private.patient_company_entry(uuid)'::regprocedure,'public.connect_patient_company(uuid)'::regprocedure)
  and (p.proowner<>current_user::regrole or a.grantee not in (p.proowner,'authenticated'::regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable))
 then raise exception 'Patient company entry ACL failed';end if;
end$$;
set local role connect_hmac_registration;
revoke create on schema private from postgres;
set local role postgres;
grant connect_hmac_registration to postgres with inherit false,set false;
do $final$begin
 if has_schema_privilege('postgres','private','CREATE') or not (exists(select 1 from pg_auth_members where roleid='connect_hmac_registration'::regrole and member='postgres'::regrole and admin_option and not set_option and not inherit_option) and not exists(select 1 from pg_auth_members where roleid='connect_hmac_registration'::regrole and (member<>'postgres'::regrole or set_option or inherit_option)))
 or not exists(select 1 from pg_class c where c.oid=to_regclass('private.account_identity') and c.relowner='connect_hmac_registration'::regrole and c.relrowsecurity)
 or not exists(select 1 from pg_class c where c.oid=to_regclass('private.accounts') and c.relowner='connect_hmac_registration'::regrole and c.relrowsecurity)
 or not exists(select 1 from pg_class c where c.oid=to_regclass('private.company_controls') and c.relowner='connect_hmac_registration'::regrole and c.relrowsecurity)
 or not exists(select 1 from pg_class c where c.oid=to_regclass('public.companies') and c.relowner='connect_hmac_registration'::regrole and c.relrowsecurity)
 or not exists(select 1 from pg_class c where c.oid=to_regclass('public.conversations') and c.relowner='postgres'::regrole and c.relrowsecurity)
 or not exists(select 1 from pg_class c where c.oid=to_regclass('public.memberships') and c.relowner='postgres'::regrole and c.relrowsecurity)
 or not exists(select 1 from pg_class c where c.oid=to_regclass('public.messages') and c.relowner='postgres'::regrole and c.relrowsecurity)
 or not exists(select 1 from pg_class c where c.oid=to_regclass('public.profiles') and c.relowner='connect_hmac_registration'::regrole and c.relrowsecurity)
 or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname in ('private','public') and p.proname in ('membership_directory_actor','membership_directory_search','membership_directory_mine','membership_directory_staff','membership_directory_inbox','connect_own_staff_employer','company_search_key','patient_company_entry','my_connect_memberships','search_connect_companies','managed_connect_staff','connect_staff_inbox','my_connect_staff_employer','connect_patient_company') and (p.proowner<>'postgres'::regrole or a.grantee not in (p.proowner,'authenticated'::regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable or (p.proname in ('membership_directory_actor','company_search_key') and a.grantee<>p.proowner)))
 then raise exception 'Connect membership final boundary failed';end if;end$final$;
notify pgrst,'reload schema';
commit;
