-- REVIEW CANDIDATE. Exact execution requires independent official approval.
-- Pending synthetic homologation only. Server-generated key never returned.
-- Existing onboarding_actor stays trusted postgres-owned; runtime gets no Auth grants.
-- postgres retains ADMIN-only membership, with SET/INHERIT both false.
begin isolation level read committed;
set local lock_timeout='3s';set local statement_timeout='30s';set local search_path=pg_catalog;
select pg_advisory_xact_lock(78104,0);select pg_advisory_xact_lock(78106,0);
do $managed_preflight$begin
 if current_user<>'postgres' or exists(select 1 from pg_roles where rolname='connect_hmac_registration')
  or not (select rolcreaterole from pg_roles where rolname=current_user)
  or (select nspowner from pg_namespace where nspname='private')<>current_user::regrole
  or to_regprocedure('private.connect_finish_registration(uuid)') is not null
  or exists(select 1 from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a
    where d.defaclrole=current_user::regrole and d.defaclnamespace in(0,(select oid from pg_namespace where nspname='public'),(select oid from pg_namespace where nspname='private')) and a.grantee<>d.defaclrole)
 then raise exception 'Managed registration initial state refused';end if;
end $managed_preflight$;
create temporary table connect_registration_before(kind text,oid oid) on commit drop;
insert into connect_registration_before select 'relation',c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('public','private');
insert into connect_registration_before select 'function',p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private');
create role connect_hmac_registration nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls noreplication;
grant connect_hmac_registration to postgres with set true;
grant connect_hmac_registration to postgres with inherit false;
-- LOCAL CANDIDATE ONLY; no key, provider, role, approval or remote executor.

set local lock_timeout='3s';set local statement_timeout='30s';
select pg_advisory_xact_lock(78104,0);select pg_advisory_xact_lock(78106,0);
do $install$begin if to_regclass('private.profile_registrations') is not null or to_regclass('private.company_registrations') is not null or to_regclass('private.hmac_model_versions') is not null or to_regprocedure('public.register_profile(uuid,text,text)') is not null or to_regprocedure('private.onboarding_cpf_valid(text)') is not null then raise exception 'Registration install requires foundation-only database';end if;end $install$;
-- Source supabase/candidates/onboarding/onboarding.CANDIDATE.sql SHA256 0d8a28d7b0dd2765f535b00ca1a8dee71284855a8a3747ff6b14761207839bcf
-- LOCAL REVIEW CANDIDATE ONLY. No production key, activation or official lookup.
-- Deliberately fails profile submission until a privileged HMAC-key adapter exists.

do $$
begin
  if current_setting('server_encoding') <> 'UTF8'
    or to_regprocedure('extensions.hmac(bytea,bytea,text)') is null
    or has_schema_privilege('authenticated','private','CREATE') or has_schema_privilege('anon','private','CREATE')
    or (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where (n.nspname,c.relname) in (('public','profiles'),('private','accounts'),('private','account_identity'),('public','companies'),('private','company_controls'))
        and c.relowner=current_user::regrole) <> 5
    or (select nspowner from pg_namespace where nspname='private') is distinct from current_user::regrole then
    raise exception 'Onboarding preflight failed';
  end if;
end $$;

create function private.onboarding_cpf_valid(value text) returns boolean language plpgsql immutable set search_path='' as $$
declare i integer; total integer; digit integer;
begin
  if value is null or value collate "C" !~ '^[0-9]{11}$' or value=repeat(substr(value,1,1),11) then return false; end if;
  for digit in 10..11 loop
    total:=0;
    for i in 1..digit-1 loop total:=total+substr(value,i,1)::integer*(digit+1-i); end loop;
    total:=total%11;
    if substr(value,digit,1)::integer<>(case when total<2 then 0 else 11-total end) then return false; end if;
  end loop;
  return true;
end $$;
create function private.onboarding_cnpj_valid(value text) returns boolean language plpgsql immutable set search_path='' as $$
declare i integer; length integer; total integer; digit integer;
begin
  if value is null or value collate "C" !~ '^[A-Z0-9]{12}[0-9]{2}$' or value=repeat(substr(value,1,1),14) then return false; end if;
  for length in 12..13 loop
    total:=0;
    for i in 1..length loop total:=total+(ascii(substr(value,i,1))-48)*(2+(length-i)%8); end loop;
    total:=total%11; digit:=case when total<2 then 0 else 11-total end;
    if substr(value,length+1,1)::integer<>digit then return false; end if;
  end loop;
  return true;
end $$;
create function private.onboarding_text_valid(value text, max_length integer, required boolean) returns boolean language sql immutable set search_path='' as $$
  select value is not null and char_length(value)<=max_length
    and (not required or value ~ '[^[:space:]]')
    and value !~ '[\x00-\x1f\x7f]'
$$;
create function private.onboarding_hmac_key() returns bytea language plpgsql set search_path='' as $$
begin
  -- Replace only after privileged secret-management/rotation review. Never take
  -- this key from a client argument, request GUC, user_metadata or committed key.
  raise exception using errcode='P0001',message='Operação indisponível';
end $$;
create function private.onboarding_cpf_fingerprint(value text) returns bytea language plpgsql set search_path='' as $$
declare key bytea;
begin
  if not private.onboarding_cpf_valid(value) then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  key:=private.onboarding_hmac_key();
  if key is null or octet_length(key) not between 32 and 128 then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  return extensions.hmac(convert_to('connect-cpf:v1:'||value,'UTF8'),key,'sha256');
end $$;
create function private.onboarding_actor() returns uuid language plpgsql volatile security definer set search_path='' as $$
declare subject uuid; claims jsonb; expiration text;
begin
  subject:=auth.uid(); claims:=auth.jwt(); expiration:=claims->>'exp';
  if current_setting('transaction_isolation')<>'read committed'
    or subject is null or expiration is null or expiration !~ '^[0-9]{1,12}$'
    or expiration::numeric<=extract(epoch from clock_timestamp())
    or not exists(select 1 from auth.users u join auth.sessions s on s.user_id=u.id
      where u.id=subject and u.email_confirmed_at is not null and u.email_confirmed_at<=clock_timestamp()
        and s.id::text=claims->>'session_id' and (s.not_after is null or s.not_after>clock_timestamp())) then
    raise exception using errcode='P0001',message='Operação indisponível';
  end if;
  return subject;
exception when invalid_text_representation then
  raise exception using errcode='P0001',message='Operação indisponível';
end $$;

create table private.profile_registrations (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  request_id uuid not null,
  cpf_fingerprint bytea not null check (octet_length(cpf_fingerprint)=32),
  state text not null default 'pending' check (state in ('pending','approved','rejected')),
  created_at timestamptz not null default clock_timestamp()
);
-- Pending claims deliberately DO NOT reserve an unverified CPF. The trusted
-- verification path must populate this unique registry atomically with grants.
-- There is no public activation/verification function in this candidate.
create table private.confirmed_cpf_registry (
  user_id uuid primary key references public.profiles(id),
  cpf_fingerprint bytea not null unique check (octet_length(cpf_fingerprint)=32),
  key_version integer not null default 1 check (key_version=1)
);
create table private.company_registrations (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id),
  request_id uuid not null,
  company_id uuid not null unique references public.companies(id),
  cnpj text not null check (private.onboarding_cnpj_valid(cnpj)),
  state text not null default 'pending' check (state in ('pending','approved','rejected')),
  created_at timestamptz not null default clock_timestamp(),
  unique(requester_id,request_id), unique(requester_id,cnpj)
);
create index company_registration_pending on private.company_registrations(requester_id,state);
create table private.onboarding_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null,
  target_id uuid not null,
  action text not null check (action in ('profile-requested','company-requested')),
  occurred_at timestamptz not null default clock_timestamp()
);
alter table private.profile_registrations enable row level security;
alter table private.confirmed_cpf_registry enable row level security;
alter table private.company_registrations enable row level security;
alter table private.onboarding_events enable row level security;
revoke all on private.profile_registrations,private.confirmed_cpf_registry,private.company_registrations,private.onboarding_events from public,anon,authenticated;
revoke all on sequence private.onboarding_events_id_seq from public,anon,authenticated;

create function private.register_profile(p_request uuid,p_name text,p_cpf text) returns jsonb language plpgsql security definer set search_path='' as $$
declare subject uuid; fingerprint bytea; existing private.profile_registrations; v_name text:=btrim(p_name);
begin
  perform pg_advisory_xact_lock_shared(78104,0);
  subject:=private.onboarding_actor();
  if p_request is null or not private.onboarding_text_valid(v_name,120,true) or not private.onboarding_cpf_valid(p_cpf) then
    raise exception using errcode='P0001',message='Operação indisponível';
  end if;
  perform pg_advisory_xact_lock(78103,hashtext(subject::text));
  if private.onboarding_actor()<>subject then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  fingerprint:=private.onboarding_cpf_fingerprint(p_cpf);
  select * into existing from private.profile_registrations where user_id=subject;
  if found then
    if existing.request_id<>p_request or existing.cpf_fingerprint<>fingerprint or existing.state='rejected'
      or not exists(select 1 from public.profiles p where p.id=subject and p.display_name=v_name) then
      raise exception using errcode='P0001',message='Operação indisponível';
    end if;
  else
    -- Do not adopt/overwrite an existing profile or reset a previously active account.
    if exists(select 1 from public.profiles where id=subject) then raise exception using errcode='P0001',message='Operação indisponível'; end if;
    insert into public.profiles(id,display_name) values(subject,v_name);
    insert into private.accounts(user_id,state) values(subject,'suspended');
    insert into private.account_identity(user_id,format_state,contact_state) values(subject,'valid','confirmed');
    insert into private.profile_registrations(user_id,request_id,cpf_fingerprint) values(subject,p_request,fingerprint);
    insert into private.onboarding_events(actor_id,target_id,action) values(subject,subject,'profile-requested');
  end if;
  return jsonb_build_object('profile_id',subject,'display_name',v_name,'registration_state',coalesce(existing.state,'pending'),
    'identity_state',(select identity_state from private.account_identity where user_id=subject));
exception when unique_violation then
  raise exception using errcode='P0001',message='Operação indisponível';
end $$;

create function private.request_company(p_request uuid,p_name text,p_address text,p_phone text,p_cnpj text) returns jsonb language plpgsql security definer set search_path='' as $$
declare subject uuid; existing private.company_registrations; target uuid; v_name text:=btrim(p_name); v_address text:=btrim(p_address); v_phone text:=btrim(p_phone);
begin
  perform pg_advisory_xact_lock_shared(78104,0);
  subject:=private.onboarding_actor();
  if p_request is null or not private.onboarding_text_valid(v_name,160,true) or not private.onboarding_text_valid(v_address,500,false)
    or not private.onboarding_text_valid(v_phone,80,false) or not private.onboarding_cnpj_valid(p_cnpj) then
    raise exception using errcode='P0001',message='Operação indisponível';
  end if;
  perform pg_advisory_xact_lock(78103,hashtext(subject::text));
  if private.onboarding_actor()<>subject or not exists(select 1 from private.profile_registrations r
      join private.accounts a on a.user_id=r.user_id join private.account_identity i on i.user_id=r.user_id
      where r.user_id=subject and i.identity_state<>'disputed'
        and ((r.state='pending' and a.state='suspended') or (r.state='approved' and a.state='active')))
    then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  select * into existing from private.company_registrations where requester_id=subject and request_id=p_request;
  if found then
    if existing.state='rejected' or existing.cnpj<>p_cnpj or not exists(select 1 from public.companies c
        where c.id=existing.company_id and c.name=v_name and c.address=v_address and c.phone=v_phone) then
      raise exception using errcode='P0001',message='Operação indisponível';
    end if;
    target:=existing.company_id;
  else
    -- Technical candidate budget, not a final active-company product limit.
    if (select count(*) from private.company_registrations where requester_id=subject and state='pending')>=10 then
      raise exception using errcode='P0001',message='Operação indisponível';
    end if;
    insert into public.companies(name,address,phone) values(v_name,v_address,v_phone) returning id into target;
    -- Unverified requests cannot reserve canonical unique CNPJ or grant a role.
    insert into private.company_controls(company_id,state,cnpj,representation_state) values(target,'pending',null,'unconfirmed');
    insert into private.company_registrations(requester_id,request_id,company_id,cnpj) values(subject,p_request,target,p_cnpj);
    insert into private.onboarding_events(actor_id,target_id,action) values(subject,target,'company-requested');
  end if;
  return jsonb_build_object('company_id',target,'request_id',p_request,'name',v_name,'address',v_address,'phone',v_phone,
    'registration_state',coalesce(existing.state,'pending'),'representation_state',
    (select representation_state from private.company_controls where company_id=target));
exception when unique_violation then
  raise exception using errcode='P0001',message='Operação indisponível';
end $$;

create function private.my_profile_registration() returns jsonb language plpgsql security definer set search_path='' as $$
declare subject uuid; result jsonb;
begin
  perform pg_advisory_xact_lock_shared(78104,0);
  subject:=private.onboarding_actor();
  select jsonb_build_object('profile_id',p.id,'display_name',p.display_name,'registration_state',r.state,'identity_state',i.identity_state)
    into result from private.profile_registrations r join public.profiles p on p.id=r.user_id join private.account_identity i on i.user_id=r.user_id where r.user_id=subject;
  return coalesce(result,jsonb_build_object('registration_state','not_started'));
end $$;
create function private.my_company_registration(p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare subject uuid; result jsonb;
begin
  perform pg_advisory_xact_lock_shared(78104,0);
  subject:=private.onboarding_actor();
  select jsonb_build_object('company_id',c.id,'request_id',r.request_id,'name',c.name,'address',c.address,'phone',c.phone,
    'registration_state',r.state,'representation_state',k.representation_state)
    into result from private.company_registrations r join public.companies c on c.id=r.company_id join private.company_controls k on k.company_id=c.id
    where r.requester_id=subject and r.request_id=p_request;
  if result is null then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  return result;
end $$;

-- Recovery after a clean reinstall/login: own opaque request IDs only. No CPF,
-- CNPJ, arbitrary user selector or local credential journal is needed.
-- Bounded discovery deliberately signals overflow instead of silently hiding it.
create function private.my_company_registration_index() returns jsonb language plpgsql security definer set search_path='' as $$
declare subject uuid; result jsonb;
begin
  perform pg_advisory_xact_lock_shared(78104,0);
  subject:=private.onboarding_actor();
  select jsonb_build_object('request_ids',coalesce(jsonb_agg(s.request_id order by s.request_id) filter(where s.position<=10),'[]'::jsonb),'has_more',count(*)>10)
    into result from (select r.request_id,row_number() over(order by r.request_id) as position
      from private.company_registrations r where r.requester_id=subject order by r.request_id limit 11) s;
  return result;
end $$;

create function public.my_company_registration_index() returns jsonb language sql security invoker set search_path='' as $$ select private.my_company_registration_index() $$;
create function public.register_profile(p_request uuid,p_name text,p_cpf text) returns jsonb language sql security invoker set search_path='' as $$ select private.register_profile(p_request,p_name,p_cpf) $$;
create function public.request_company(p_request uuid,p_name text,p_address text,p_phone text,p_cnpj text) returns jsonb language sql security invoker set search_path='' as $$ select private.request_company(p_request,p_name,p_address,p_phone,p_cnpj) $$;
create function public.my_profile_registration() returns jsonb language sql security invoker set search_path='' as $$ select private.my_profile_registration() $$;
create function public.my_company_registration(p_request uuid) returns jsonb language sql security invoker set search_path='' as $$ select private.my_company_registration(p_request) $$;
revoke all on function private.onboarding_cpf_valid(text),private.onboarding_cnpj_valid(text),private.onboarding_text_valid(text,integer,boolean),private.onboarding_hmac_key(),private.onboarding_cpf_fingerprint(text),private.onboarding_actor() from public,anon,authenticated;
revoke all on function private.my_company_registration_index(),public.my_company_registration_index(),private.register_profile(uuid,text,text),private.request_company(uuid,text,text,text,text),private.my_profile_registration(),private.my_company_registration(uuid),public.register_profile(uuid,text,text),public.request_company(uuid,text,text,text,text),public.my_profile_registration(),public.my_company_registration(uuid) from public,anon,authenticated;
grant execute on function private.my_company_registration_index(),public.my_company_registration_index(),private.register_profile(uuid,text,text),private.request_company(uuid,text,text,text,text),private.my_profile_registration(),private.my_company_registration(uuid),public.register_profile(uuid,text,text),public.request_company(uuid,text,text,text,text),public.my_profile_registration(),public.my_company_registration(uuid) to authenticated;
-- Any unreviewed default ACL on newly-created objects makes the transaction fail.
do $$
begin
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 'S'::"char" else 'r'::"char" end,c.relowner))) a
    where n.nspname='private' and c.relname in ('profile_registrations','confirmed_cpf_registry','company_registrations','onboarding_events','onboarding_events_id_seq') and a.grantee<>c.relowner)
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where ((n.nspname='private' and p.proname like 'onboarding_%') or (n.nspname in ('public','private') and p.proname in ('register_profile','request_company','my_profile_registration','my_company_registration','my_company_registration_index')))
      and a.grantee<>p.proowner and (a.grantee<>'authenticated'::regrole or p.proname like 'onboarding_%')) then
    raise exception 'Onboarding ACL preflight failed';
  end if;
end $$;


-- Source supabase/candidates/versioned-hmac/versioned-hmac.CANDIDATE.sql SHA256 fbe0fe20e62aa85752ed697dc1657a63f8577769041e88171b9dd6772a94d29b
-- LOCAL MODEL, not a migration or identity-verification service.
-- No keys are provisioned; the private provider below always refuses.

set local lock_timeout='3s';
set local statement_timeout='10s';
select pg_advisory_xact_lock(78106,0);
do $$begin
  if (select nspowner from pg_namespace where nspname='private') is distinct from current_user::regrole
    or has_schema_privilege('anon','private','CREATE') or has_schema_privilege('authenticated','private','CREATE')
    or (select proowner from pg_proc where oid=to_regprocedure('private.onboarding_cpf_valid(text)')) is distinct from current_user::regrole then
    raise exception 'Versioned HMAC model preflight failed';
  end if;
end$$;
create table private.hmac_model_versions (
  key_version integer primary key check(key_version>0),
  key_ref uuid not null unique,
  key_check bytea not null check(octet_length(key_check)=32),
  state text not null check(state in ('staged','required','retired'))
);
create table private.hmac_model_policy (
  singleton boolean primary key default true check(singleton),
  current_version integer not null references private.hmac_model_versions,
  epoch bigint not null default 1 check(epoch>0),
  write_enabled boolean not null default true
);
create table private.hmac_model_identities(subject uuid primary key);
create table private.hmac_model_aliases (
  subject uuid not null references private.hmac_model_identities,
  key_version integer not null references private.hmac_model_versions,
  fingerprint bytea not null check(octet_length(fingerprint)=32),
  primary key(subject,key_version),unique(key_version,fingerprint)
);
create table private.hmac_model_pending(request_id uuid primary key,subject uuid not null unique);
-- Pending claims deliberately do not reserve an unverified CPF across people.
create table private.hmac_model_pending_aliases (
  request_id uuid not null references private.hmac_model_pending,
  key_version integer not null references private.hmac_model_versions,
  fingerprint bytea not null check(octet_length(fingerprint)=32),
  primary key(request_id,key_version)
);
create table private.hmac_model_events (
  id bigint generated always as identity primary key,
  action text not null check(action in ('staged','promoted','retired','bound','pending-recorded','paused','resumed')),
  subject uuid,key_version integer
);
alter table private.hmac_model_versions enable row level security;
alter table private.hmac_model_policy enable row level security;
alter table private.hmac_model_identities enable row level security;
alter table private.hmac_model_aliases enable row level security;
alter table private.hmac_model_pending enable row level security;
alter table private.hmac_model_pending_aliases enable row level security;
alter table private.hmac_model_events enable row level security;
revoke all on private.hmac_model_versions,private.hmac_model_policy,private.hmac_model_identities,private.hmac_model_aliases,private.hmac_model_pending,private.hmac_model_pending_aliases,private.hmac_model_events from public,anon,authenticated;
revoke all on sequence private.hmac_model_events_id_seq from public,anon,authenticated;

create function private.hmac_model_fail(code text) returns void language plpgsql set search_path='' as $$begin
  raise exception using errcode=case when code in ('57014','P0004') then code else 'P0001' end,message='Operação indisponível';
end$$;
create function private.hmac_model_lock() returns void language plpgsql set search_path='' as $$begin
  if current_setting('transaction_isolation')<>'read committed' then perform private.hmac_model_fail('P0001');end if;
  -- Deliberately serialized proof model. Not a production throughput claim.
  perform pg_advisory_xact_lock(78106,0);
end$$;
create function private.hmac_model_read_key(ref uuid) returns bytea language plpgsql set search_path='' as $$begin
  -- Future server-side adapter must constrain purpose/project and ACLs.
  -- Do not implement a general client-selected Vault secret reader.
  perform private.hmac_model_fail('P0001');return null;
end$$;
create function private.hmac_model_key(version integer) returns bytea language plpgsql set search_path='' as $$
declare metadata private.hmac_model_versions; material bytea;
begin
  select * into metadata from private.hmac_model_versions v where v.key_version=version and v.state in ('staged','required');
  if not found then perform private.hmac_model_fail('P0001');end if;
  material:=private.hmac_model_read_key(metadata.key_ref);
  if material is null or octet_length(material) not between 32 and 128 or extensions.hmac(convert_to('connect-key-check:v1','UTF8'),material,'sha256')<>metadata.key_check then perform private.hmac_model_fail('P0001');end if;
  return material;
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return null;
end$$;
create function private.hmac_model_fingerprints(cpf text) returns table(key_version integer,fingerprint bytea) language plpgsql set search_path='' as $$
declare item record; material bytea; amount integer:=0;
begin
  perform private.hmac_model_lock();
  if not private.onboarding_cpf_valid(cpf) or not exists(select 1 from private.hmac_model_policy p join private.hmac_model_versions v on v.key_version=p.current_version where p.write_enabled and v.state='required') then perform private.hmac_model_fail('P0001');end if;
  for item in select v.key_version from private.hmac_model_versions v where v.state='required' order by v.key_version loop
    amount:=amount+1;if amount>4 then perform private.hmac_model_fail('P0001');end if;
    material:=private.hmac_model_key(item.key_version);
    key_version:=item.key_version;fingerprint:=extensions.hmac(convert_to('connect-cpf:v1:'||cpf,'UTF8'),material,'sha256');return next;
  end loop;
  if amount=0 then perform private.hmac_model_fail('P0001');end if;
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);
end$$;
create function private.hmac_model_covered(version integer) returns boolean language sql set search_path='' as $$
  select not exists(select 1 from private.hmac_model_identities i where not exists(select 1 from private.hmac_model_aliases a where a.subject=i.subject and a.key_version=version))
    and not exists(select 1 from private.hmac_model_pending p where not exists(select 1 from private.hmac_model_pending_aliases a where a.request_id=p.request_id and a.key_version=version))
$$;

create function private.hmac_model_stage(version integer,ref uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare material bytea;
begin
  perform private.hmac_model_lock();
  if version is null or version<1 or ref is null or version<=coalesce((select max(v.key_version) from private.hmac_model_versions v),0) then perform private.hmac_model_fail('P0001');end if;
  material:=private.hmac_model_read_key(ref);
  if material is null or octet_length(material) not between 32 and 128 then perform private.hmac_model_fail('P0001');end if;
  insert into private.hmac_model_versions values(version,ref,extensions.hmac(convert_to('connect-key-check:v1','UTF8'),material,'sha256'),'staged');
  insert into private.hmac_model_events(action,key_version) values('staged',version);return true;
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return false;
end$$;
create function private.hmac_model_promote(version integer) returns boolean language plpgsql security definer set search_path='' as $$
declare state text; item record;
begin
  perform private.hmac_model_lock();
  select v.state into state from private.hmac_model_versions v where v.key_version=version;
  if state is null or state='retired' then perform private.hmac_model_fail('P0001');end if;
  for item in select v.key_version from private.hmac_model_versions v where v.state='required' order by v.key_version loop perform private.hmac_model_key(item.key_version);end loop;
  perform private.hmac_model_key(version);
  if exists(select 1 from private.hmac_model_policy p where p.current_version=version) then return true;end if;
  if (state='required' and not private.hmac_model_covered(version)) or (state='staged' and (select count(*) from private.hmac_model_versions v where v.state='required')>=4) then perform private.hmac_model_fail('P0001');end if;
  update private.hmac_model_versions v set state='required' where v.key_version=version;
  insert into private.hmac_model_policy(singleton,current_version) values(true,version) on conflict(singleton) do update set current_version=excluded.current_version,epoch=private.hmac_model_policy.epoch+1;
  insert into private.hmac_model_events(action,key_version) values('promoted',version);return true;
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return false;
end$$;
create function private.hmac_model_retire(version integer) returns boolean language plpgsql security definer set search_path='' as $$
declare current_version integer; state text;
begin
  perform private.hmac_model_lock();select p.current_version into current_version from private.hmac_model_policy p;
  select v.state into state from private.hmac_model_versions v where v.key_version=version;
  if state='retired' then return true;end if;
  if current_version is null or version=current_version or state is distinct from 'required' or not private.hmac_model_covered(current_version) then perform private.hmac_model_fail('P0001');end if;
  perform private.hmac_model_key(current_version);
  update private.hmac_model_versions v set state='retired' where v.key_version=version;
  update private.hmac_model_policy set epoch=epoch+1;
  insert into private.hmac_model_events(action,key_version) values('retired',version);return true;
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return false;
end$$;

-- Trusted verifier only: this model does not verify identity or grant app roles.
create function private.hmac_model_bind_verified(person uuid,cpf text) returns boolean language plpgsql security definer set search_path='' as $$
declare versions integer[]; digests bytea[]; i integer; hit uuid; known uuid; changed boolean:=false; affected bigint;
begin
  perform private.hmac_model_lock();if person is null then perform private.hmac_model_fail('P0001');end if;
  select array_agg(f.key_version order by f.key_version),array_agg(f.fingerprint order by f.key_version) into versions,digests from private.hmac_model_fingerprints(cpf) f;
  for i in 1..cardinality(versions) loop
    select a.subject into hit from private.hmac_model_aliases a where a.key_version=versions[i] and a.fingerprint=digests[i];
    if hit is not null then if known is not null and known<>hit then perform private.hmac_model_fail('P0001');end if;known:=hit;end if;
  end loop;
  if (known is not null and known<>person) or (known is null and exists(select 1 from private.hmac_model_identities where subject=person)) then perform private.hmac_model_fail('P0001');end if;
  insert into private.hmac_model_identities values(person) on conflict do nothing;get diagnostics affected=row_count;changed:=affected>0;
  for i in 1..cardinality(versions) loop
    if exists(select 1 from private.hmac_model_aliases a where a.subject=person and a.key_version=versions[i] and a.fingerprint<>digests[i]) then perform private.hmac_model_fail('P0001');end if;
    insert into private.hmac_model_aliases values(person,versions[i],digests[i]) on conflict(subject,key_version) do nothing;get diagnostics affected=row_count;changed:=changed or affected>0;
  end loop;
  if changed then insert into private.hmac_model_events(action,subject) values('bound',person);end if;return true;
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return false;
end$$;
create function private.hmac_model_record_pending(person uuid,request uuid,cpf text) returns boolean language plpgsql security definer set search_path='' as $$
declare existing private.hmac_model_pending;versions integer[];digests bytea[];i integer;matches boolean:=false;changed boolean:=false;affected bigint;
begin
  perform private.hmac_model_lock();if person is null or request is null then perform private.hmac_model_fail('P0001');end if;
  select * into existing from private.hmac_model_pending p where p.subject=person or p.request_id=request;
  if found and (existing.subject<>person or existing.request_id<>request) then perform private.hmac_model_fail('P0001');end if;
  select array_agg(f.key_version order by f.key_version),array_agg(f.fingerprint order by f.key_version) into versions,digests from private.hmac_model_fingerprints(cpf) f;
  for i in 1..cardinality(versions) loop
    if exists(select 1 from private.hmac_model_pending_aliases a where a.request_id=request and a.key_version=versions[i] and a.fingerprint=digests[i]) then matches:=true;end if;
    if exists(select 1 from private.hmac_model_pending_aliases a where a.request_id=request and a.key_version=versions[i] and a.fingerprint<>digests[i]) then perform private.hmac_model_fail('P0001');end if;
  end loop;
  if existing.request_id is not null and not matches then perform private.hmac_model_fail('P0001');end if;
  insert into private.hmac_model_pending values(request,person) on conflict do nothing;get diagnostics affected=row_count;changed:=affected>0;
  for i in 1..cardinality(versions) loop
    insert into private.hmac_model_pending_aliases values(request,versions[i],digests[i]) on conflict do nothing;get diagnostics affected=row_count;changed:=changed or affected>0;
  end loop;
  if changed then insert into private.hmac_model_events(action,subject) values('pending-recorded',person);end if;return true;
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return false;
end$$;
create function private.hmac_model_set_write_enabled(allowed boolean) returns boolean language plpgsql security definer set search_path='' as $$
declare item record;
begin
  perform private.hmac_model_lock();if allowed is null or not exists(select 1 from private.hmac_model_policy) then perform private.hmac_model_fail('P0001');end if;
  if allowed then for item in select key_version from private.hmac_model_versions where state='required' order by key_version loop perform private.hmac_model_key(item.key_version);end loop;end if;
  update private.hmac_model_policy set write_enabled=allowed,epoch=epoch+1;
  insert into private.hmac_model_events(action) values(case when allowed then 'resumed' else 'paused' end);return true;
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return false;
end$$;
do $$declare item record;begin
  for item in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'hmac_model_%' loop execute format('revoke all on function %s from public,anon,authenticated',item.signature);end loop;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault(case when c.relkind='S' then 'S'::"char" else 'r'::"char" end,c.relowner))) a where n.nspname='private' and c.relname like 'hmac_model_%' and c.relkind in ('r','S') and a.grantee<>c.relowner)
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname='private' and p.proname like 'hmac_model_%' and a.grantee<>p.proowner) then raise exception 'Versioned HMAC model ACL failed';end if;
end$$;


-- Source supabase/candidates/hmac-operations/operations.CANDIDATE.sql SHA256 260a24318954824c8aa0a811c35597dd552416e1b3bbaca864bb873b749494a3
-- LOCAL PROPOSAL ONLY. Empty versioned model required. No secret provisioning.

set local lock_timeout='3s';set local statement_timeout='10s';
select pg_advisory_xact_lock(78106,0);
do $$begin
  if (select nspowner from pg_namespace where nspname='private') is distinct from current_user::regrole
    or has_schema_privilege('anon','private','CREATE') or has_schema_privilege('authenticated','private','CREATE')
    or (select proowner from pg_proc where oid=to_regprocedure('private.hmac_model_read_key(uuid)')) is distinct from current_user::regrole
    or exists(select 1 from private.hmac_model_versions) or exists(select 1 from private.hmac_model_pending) or exists(select 1 from private.hmac_model_identities) then
    raise exception 'HMAC operations require owned empty model';
  end if;
end$$;
create table private.hmac_ops_key_sources (
  ref uuid primary key,secret_id uuid not null unique,
  scope text not null,purpose text not null check(purpose='cpf-hmac'),encoding text not null check(encoding='hex32')
);
create table private.hmac_ops_pending_archive (
  closure_id uuid primary key,request_id uuid not null,subject uuid not null,
  reason text not null check(reason in ('withdrawn','rejected','expired','verified')),
  closed_at timestamptz not null default clock_timestamp(),connection_actor name not null default session_user,
  restored_operation uuid unique,restored_at timestamptz,
  check((restored_operation is null)=(restored_at is null))
);
create unique index hmac_ops_one_active_closure on private.hmac_ops_pending_archive(request_id) where restored_operation is null;
create table private.hmac_ops_archived_aliases (
  closure_id uuid not null references private.hmac_ops_pending_archive,
  key_version integer not null references private.hmac_model_versions,
  fingerprint bytea not null check(octet_length(fingerprint)=32),primary key(closure_id,key_version)
);
create table private.hmac_ops_events (
  operation_id uuid primary key,action text not null check(action in ('closed','reopened','recovered')),
  subject uuid,request_id uuid,source_version integer,target_version integer,
  occurred_at timestamptz not null default clock_timestamp(),connection_actor name not null default session_user
);
alter table private.hmac_ops_key_sources enable row level security;
alter table private.hmac_ops_pending_archive enable row level security;
alter table private.hmac_ops_archived_aliases enable row level security;
alter table private.hmac_ops_events enable row level security;
revoke all on private.hmac_ops_key_sources,private.hmac_ops_pending_archive,private.hmac_ops_archived_aliases,private.hmac_ops_events from public,anon,authenticated;

create function private.hmac_ops_expected_scope() returns text language plpgsql set search_path='' as $$begin
  -- Set only in an approved deployment, never from request metadata/GUC.
  perform private.hmac_model_fail('P0001');return null;
end$$;
create function private.hmac_ops_binding_guard() returns trigger language plpgsql set search_path='' as $$begin
  if current_setting('transaction_isolation')<>'read committed' or exists(select 1 from private.hmac_model_versions where key_ref=old.ref) then perform private.hmac_model_fail('P0001');end if;
  if tg_op='DELETE' then return old;else return new;end if;
end$$;
create trigger hmac_ops_binding_immutable before update or delete on private.hmac_ops_key_sources for each row execute function private.hmac_ops_binding_guard();
create or replace function private.hmac_model_read_key(ref uuid) returns bytea language plpgsql set search_path='' as $$
declare source private.hmac_ops_key_sources; encoded text;expected text;
begin
  expected:=private.hmac_ops_expected_scope();
  select * into strict source from private.hmac_ops_key_sources s where s.ref=hmac_model_read_key.ref for share;
  if expected is null or expected='' or source.scope<>expected or source.purpose<>'cpf-hmac' or source.encoding<>'hex32' then perform private.hmac_model_fail('P0001');end if;
  -- No arbitrary caller-selected secret UUID: only the owner-approved mapping.
  -- Candidate references official Vault columns, but installs no Vault objects.
  select d.decrypted_secret into strict encoded from vault.decrypted_secrets d where d.id=source.secret_id;
  if encoded is null or char_length(encoded)<>64 or encoded collate "C" !~ '^[0-9a-f]{64}$' then perform private.hmac_model_fail('P0001');end if;
  return decode(encoded,'hex');
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return null;
end$$;

create function private.hmac_ops_block_closed_request() returns trigger language plpgsql set search_path='' as $$begin
  if exists(select 1 from private.hmac_ops_pending_archive a where a.request_id=new.request_id and a.restored_operation is null) then perform private.hmac_model_fail('P0001');end if;return new;
end$$;
create trigger hmac_ops_pending_tombstone before insert on private.hmac_model_pending for each row execute function private.hmac_ops_block_closed_request();
create function private.hmac_ops_close_pending(person uuid,request uuid,reason text,operation uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare prior private.hmac_ops_pending_archive;
begin
  perform private.hmac_model_lock();
  if person is null or request is null or operation is null or reason is null or reason not in ('withdrawn','rejected','expired','verified') then perform private.hmac_model_fail('P0001');end if;
  select * into prior from private.hmac_ops_pending_archive where closure_id=operation;
  if found then if prior.subject=person and prior.request_id=request and prior.reason=reason then return true;else perform private.hmac_model_fail('P0001');end if;end if;
  if exists(select 1 from private.hmac_ops_events where operation_id=operation) or not exists(select 1 from private.hmac_model_pending p where p.subject=person and p.request_id=request) then perform private.hmac_model_fail('P0001');end if;
  if reason='verified' and (not exists(select 1 from private.hmac_model_identities where subject=person)
    or not exists(select 1 from private.hmac_model_pending_aliases p join private.hmac_model_aliases v on v.subject=person and v.key_version=p.key_version and v.fingerprint=p.fingerprint where p.request_id=request)
    or exists(select 1 from private.hmac_model_pending_aliases p join private.hmac_model_aliases v on v.subject=person and v.key_version=p.key_version where p.request_id=request and p.fingerprint<>v.fingerprint)) then perform private.hmac_model_fail('P0001');end if;
  insert into private.hmac_ops_pending_archive(closure_id,request_id,subject,reason) values(operation,request,person,reason);
  insert into private.hmac_ops_archived_aliases select operation,p.key_version,p.fingerprint from private.hmac_model_pending_aliases p where p.request_id=request;
  delete from private.hmac_model_pending_aliases where request_id=request;
  delete from private.hmac_model_pending where request_id=request and subject=person;
  insert into private.hmac_ops_events(operation_id,action,subject,request_id) values(operation,'closed',person,request);return true;
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return false;
end$$;
create function private.hmac_ops_reopen_pending(closure uuid,operation uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare archived private.hmac_ops_pending_archive; prior private.hmac_ops_events;current_version integer;
begin
  perform private.hmac_model_lock();if closure is null or operation is null then perform private.hmac_model_fail('P0001');end if;
  select * into prior from private.hmac_ops_events where operation_id=operation;
  if found then if prior.action='reopened' and exists(select 1 from private.hmac_ops_pending_archive where closure_id=closure and restored_operation=operation) then return true;else perform private.hmac_model_fail('P0001');end if;end if;
  if exists(select 1 from private.hmac_ops_pending_archive where closure_id=operation) then perform private.hmac_model_fail('P0001');end if;
  select * into archived from private.hmac_ops_pending_archive where closure_id=closure and restored_operation is null;
  if not found then perform private.hmac_model_fail('P0001');end if;
  select p.current_version into current_version from private.hmac_model_policy p join private.hmac_model_versions v on v.key_version=p.current_version where v.state='required';
  if current_version is null or not exists(select 1 from private.hmac_ops_archived_aliases a where a.closure_id=closure and a.key_version=current_version)
    or exists(select 1 from private.hmac_model_pending p where p.subject=archived.subject or p.request_id=archived.request_id) then perform private.hmac_model_fail('P0001');end if;
  update private.hmac_ops_pending_archive set restored_operation=operation,restored_at=clock_timestamp() where closure_id=closure;
  insert into private.hmac_model_pending values(archived.request_id,archived.subject);
  insert into private.hmac_model_pending_aliases select archived.request_id,a.key_version,a.fingerprint from private.hmac_ops_archived_aliases a where a.closure_id=closure;
  insert into private.hmac_ops_events(operation_id,action,subject,request_id) values(operation,'reopened',archived.subject,archived.request_id);return true;
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return false;
end$$;
create function private.hmac_ops_recover_current(target integer,failed integer,operation uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare prior private.hmac_ops_events;item record;
begin
  perform private.hmac_model_lock();if target is null or failed is null or target=failed or operation is null then perform private.hmac_model_fail('P0001');end if;
  select * into prior from private.hmac_ops_events where operation_id=operation;
  if found then if prior.action='recovered' and prior.source_version=failed and prior.target_version=target then return true;else perform private.hmac_model_fail('P0001');end if;end if;
  if exists(select 1 from private.hmac_ops_pending_archive where closure_id=operation)
    or not exists(select 1 from private.hmac_model_policy where current_version=failed and not write_enabled)
    or not exists(select 1 from private.hmac_model_versions where key_version=target and state='required')
    or not exists(select 1 from private.hmac_model_versions where key_version=failed and state='required')
    or not private.hmac_model_covered(target) then perform private.hmac_model_fail('P0001');end if;
  -- Deliberate privileged recovery: never read the declared failed key.
  for item in select key_version from private.hmac_model_versions where state='required' and key_version<>failed order by key_version loop perform private.hmac_model_key(item.key_version);end loop;
  update private.hmac_model_versions set state='retired' where key_version=failed;
  update private.hmac_model_policy set current_version=target,epoch=epoch+1;
  insert into private.hmac_ops_events(operation_id,action,source_version,target_version) values(operation,'recovered',failed,target);return true;
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return false;
end$$;
do $$declare item record;begin
  for item in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and (p.proname like 'hmac_ops_%' or p.proname='hmac_model_read_key') loop execute format('revoke all on function %s from public,anon,authenticated',item.signature);end loop;
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where n.nspname='private' and c.relkind='r' and c.relname like 'hmac_ops_%' and a.grantee<>c.relowner)
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname='private' and (p.proname like 'hmac_ops_%' or p.proname='hmac_model_read_key') and a.grantee<>p.proowner) then raise exception 'HMAC operations ACL failed';end if;
end$$;


-- Source supabase/candidates/onboarding-versioned/bridge.CANDIDATE.sql SHA256 7fc8217e6bbf4013806ea405fc6035726498d3ca25e293ccde54a3123d97437b
-- LOCAL INTEGRATION PROOF ONLY. No provider provisioning, activation or migration.

set local lock_timeout='3s';set local statement_timeout='10s';
-- Admission precedes model serialization, which precedes subject/row locks.
select pg_advisory_xact_lock(78104,0);
select pg_advisory_xact_lock(78106,0);
lock table private.profile_registrations,private.confirmed_cpf_registry,private.company_registrations,private.hmac_model_pending,private.hmac_model_versions in access exclusive mode;
do $$begin
  if current_setting('transaction_isolation')<>'read committed'
    or (select nspowner from pg_namespace where nspname='private') is distinct from current_user::regrole
    or has_schema_privilege('anon','private','CREATE') or has_schema_privilege('authenticated','private','CREATE')
    or exists(select 1 from private.profile_registrations) or exists(select 1 from private.confirmed_cpf_registry)
    or exists(select 1 from private.company_registrations) or exists(select 1 from private.hmac_model_pending)
    or exists(select 1 from private.hmac_model_versions)
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='private' and p.proname in ('register_profile','request_company','hmac_model_record_pending','hmac_model_read_key') and p.proowner<>current_user::regrole)
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where n.nspname='private' and p.proname in ('register_profile','request_company')
      and a.grantee<>p.proowner and (a.grantee<>'authenticated'::regrole or a.privilege_type<>'EXECUTE' or a.is_grantable)) then
    raise exception 'Onboarding versioned bridge requires owned empty candidates';
  end if;
end$$;
alter table private.hmac_model_pending add constraint onboarding_versioned_pending_pair unique(subject,request_id);
alter table private.profile_registrations
  add column fingerprint_version integer not null references private.hmac_model_versions,
  add constraint onboarding_versioned_pending_fk foreign key(user_id,request_id) references private.hmac_model_pending(subject,request_id);
-- The FK deliberately prevents standalone model closure from stranding a profile.
-- Product rejection/reopening/activation needs a separately reviewed transaction.
alter function private.register_profile(uuid,text,text) rename to register_profile_unversioned;
alter function private.request_company(uuid,text,text,text,text) rename to request_company_unversioned;
revoke all on function private.register_profile_unversioned(uuid,text,text),private.request_company_unversioned(uuid,text,text,text,text) from public,anon,authenticated;

create function private.register_profile(p_request uuid,p_name text,p_cpf text) returns jsonb language plpgsql security definer set search_path='' as $$
declare subject uuid;existing private.profile_registrations;v_name text:=btrim(p_name);version integer;fingerprint bytea;
begin
  perform pg_advisory_xact_lock_shared(78104,0);
  subject:=private.onboarding_actor();
  if p_request is null or not private.onboarding_text_valid(v_name,120,true) or not private.onboarding_cpf_valid(p_cpf) then perform private.hmac_model_fail('P0001');end if;
  perform private.hmac_model_lock();
  perform pg_advisory_xact_lock(78103,hashtext(subject::text));
  -- Session can be revoked while waiting for model or subject admission.
  if private.onboarding_actor()<>subject then perform private.hmac_model_fail('P0001');end if;
  select * into existing from private.profile_registrations where user_id=subject;
  if found then
    if existing.request_id<>p_request or existing.state<>'pending'
      or not exists(select 1 from public.profiles p join private.accounts a on a.user_id=p.id
        join private.account_identity i on i.user_id=p.id
        where p.id=subject and p.display_name=v_name and a.state='suspended' and i.identity_state<>'disputed') then
      perform private.hmac_model_fail('P0001');
    end if;
  elsif exists(select 1 from public.profiles where id=subject) then
    perform private.hmac_model_fail('P0001');
  end if;
  -- Matches any surviving required alias, then backfills newly-required versions.
  -- Pending claims do not reserve CPF across people or grant verified identity.
  perform private.hmac_model_record_pending(subject,p_request,p_cpf);
  if existing.user_id is null then
    select p.current_version into strict version from private.hmac_model_policy p;
    select a.fingerprint into strict fingerprint from private.hmac_model_pending_aliases a where a.request_id=p_request and a.key_version=version;
    insert into public.profiles(id,display_name) values(subject,v_name);
    insert into private.accounts(user_id,state) values(subject,'suspended');
    insert into private.account_identity(user_id,format_state,contact_state) values(subject,'valid','confirmed');
    -- Immutable request snapshot; never use this single digest for retry/uniqueness.
    insert into private.profile_registrations(user_id,request_id,cpf_fingerprint,fingerprint_version) values(subject,p_request,fingerprint,version);
    insert into private.onboarding_events(actor_id,target_id,action) values(subject,subject,'profile-requested');
  end if;
  return jsonb_build_object('profile_id',subject,'display_name',v_name,'registration_state','pending',
    'identity_state',(select identity_state from private.account_identity where user_id=subject));
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return null;
end$$;
create function private.request_company(p_request uuid,p_name text,p_address text,p_phone text,p_cnpj text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_subject uuid;
begin
  perform pg_advisory_xact_lock_shared(78104,0);
  v_subject:=private.onboarding_actor();perform private.hmac_model_lock();
  perform pg_advisory_xact_lock(78103,hashtext(v_subject::text));
  if private.onboarding_actor()<>v_subject or not exists(select 1 from private.profile_registrations r
    join private.hmac_model_pending p on p.subject=r.user_id and p.request_id=r.request_id where r.user_id=v_subject and r.state='pending') then
    perform private.hmac_model_fail('P0001');
  end if;
  -- Company requests need no key bytes. They remain pending and grant no roles.
  return private.request_company_unversioned(p_request,p_name,p_address,p_phone,p_cnpj);
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return null;
end$$;
revoke all on function private.register_profile(uuid,text,text),private.request_company(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function private.register_profile(uuid,text,text),private.request_company(uuid,text,text,text,text) to authenticated;
do $$begin
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
    where n.nspname='private' and p.proname in ('register_profile','request_company','register_profile_unversioned','request_company_unversioned')
    and a.grantee<>p.proowner and (p.proname like '%_unversioned' or a.grantee<>'authenticated'::regrole or a.privilege_type<>'EXECUTE' or a.is_grantable)) then
    raise exception 'Onboarding versioned bridge ACL failed';
  end if;
end$$;


-- Source supabase/candidates/signup-lifecycle/lifecycle.CANDIDATE.sql SHA256 8f8c5aa1509b9ea4094beb043978ab5a7df4b50630aafe581966e04debe9f6b8
-- LOCAL LIFECYCLE PROOF ONLY. Evidence provider always refuses; no real approval.

set local lock_timeout='3s';set local statement_timeout='10s';
select pg_advisory_xact_lock(78104,0);select pg_advisory_xact_lock(78106,0);
lock table private.profile_registrations,private.company_registrations,private.confirmed_cpf_registry,private.hmac_model_pending,private.hmac_model_versions in access exclusive mode;
do $$begin
  if current_setting('transaction_isolation')<>'read committed'
    or (select nspowner from pg_namespace where nspname='private') is distinct from current_user::regrole
    or has_schema_privilege('anon','private','CREATE') or has_schema_privilege('authenticated','private','CREATE')
    or exists(select 1 from private.profile_registrations) or exists(select 1 from private.company_registrations)
    or exists(select 1 from private.confirmed_cpf_registry) or exists(select 1 from private.hmac_model_pending)
    or exists(select 1 from private.hmac_model_versions)
    or (select proowner from pg_proc where oid=to_regprocedure('private.request_company(uuid,text,text,text,text)')) is distinct from current_user::regrole then
    raise exception 'Signup lifecycle requires owned empty candidates';
  end if;
end$$;
alter table private.profile_registrations drop constraint onboarding_versioned_pending_fk,
  add column pending_request_id uuid,
  add constraint signup_pending_state check((state='pending')=(pending_request_id is not null)),
  add constraint signup_pending_request_matches check(pending_request_id is null or pending_request_id=request_id),
  add constraint signup_pending_fk foreign key(user_id,pending_request_id) references private.hmac_model_pending(subject,request_id);
create function private.signup_initial_pending() returns trigger language plpgsql set search_path='' as $$begin
  if new.state='pending' then new.pending_request_id:=new.request_id;end if;return new;
end$$;
create trigger signup_initial_pending before insert on private.profile_registrations for each row execute function private.signup_initial_pending();
create table private.signup_profile_history (
  request_id uuid primary key,subject uuid not null,display_name text not null,
  fingerprint bytea not null check(octet_length(fingerprint)=32),key_version integer not null references private.hmac_model_versions,
  requested_at timestamptz not null,closed_at timestamptz not null default clock_timestamp(),
  reason text not null check(reason in ('rejected','withdrawn','expired','approved')),operation_id uuid not null unique
);
create table private.signup_lifecycle_events (
  operation_id uuid primary key,subject uuid not null,request_id uuid not null,
  action text not null check(action in ('rejected','withdrawn','expired','approved','refreshed','resubmitted')),
  evidence_id uuid,previous_request_id uuid,occurred_at timestamptz not null default clock_timestamp(),connection_actor name not null default session_user,
  check((action in ('approved','refreshed'))=(evidence_id is not null)),check((action='resubmitted')=(previous_request_id is not null))
);
alter table private.signup_profile_history enable row level security;alter table private.signup_lifecycle_events enable row level security;
revoke all on private.signup_profile_history,private.signup_lifecycle_events from public,anon,authenticated;
-- A future trusted identity-verification adapter must bind proof to the pending
-- alias/version, request and person. CPF format/registry/email alone is not proof.
create function private.signup_identity_evidence(evidence uuid)
returns table(subject uuid,request_id uuid,key_version integer,fingerprint bytea,expires_at timestamptz,identity_confirmed boolean)
language plpgsql set search_path='' as $$begin perform private.hmac_model_fail('P0001');end$$;
-- Retention proposal is not an approved expiry policy. No timer or default TTL.
create function private.signup_expiry_eligible(p_subject uuid,p_request uuid) returns boolean
language plpgsql set search_path='' as $$begin perform private.hmac_model_fail('P0001');return false;end$$;

create function private.signup_close_profile(p_subject uuid,p_request uuid,p_reason text,p_operation uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare item private.profile_registrations;prior private.signup_lifecycle_events;
begin
  perform pg_advisory_xact_lock_shared(78104,0);perform private.hmac_model_lock();
  if p_subject is null or p_request is null or p_operation is null or p_reason is null or p_reason not in ('rejected','withdrawn','expired') then perform private.hmac_model_fail('P0001');end if;
  perform pg_advisory_xact_lock(78103,hashtext(p_subject::text));
  select * into prior from private.signup_lifecycle_events where operation_id=p_operation;
  if found then
    if prior.subject=p_subject and prior.request_id=p_request and prior.action=p_reason then return true;end if;
    perform private.hmac_model_fail('P0001');
  end if;
  select * into strict item from private.profile_registrations where user_id=p_subject and request_id=p_request and state='pending';
  if p_reason='expired' and private.signup_expiry_eligible(p_subject,p_request) is distinct from true then perform private.hmac_model_fail('P0001');end if;
  if exists(select 1 from private.hmac_model_identities where subject=p_subject)
    or not exists(select 1 from private.accounts where user_id=p_subject and state='suspended') then perform private.hmac_model_fail('P0001');end if;
  insert into private.signup_profile_history(request_id,subject,display_name,fingerprint,key_version,requested_at,reason,operation_id)
    select item.request_id,item.user_id,p.display_name,item.cpf_fingerprint,item.fingerprint_version,item.created_at,p_reason,p_operation from public.profiles p where p.id=p_subject;
  update private.profile_registrations set state='rejected',pending_request_id=null where user_id=p_subject;
  perform private.hmac_ops_close_pending(p_subject,p_request,p_reason,p_operation);
  -- Requests made under the closed, unverified profile cannot later activate.
  update private.company_registrations set state='rejected' where requester_id=p_subject and state='pending';
  insert into private.signup_lifecycle_events(operation_id,subject,request_id,action) values(p_operation,p_subject,p_request,p_reason);
  return true;
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return false;
end$$;
create function private.signup_approve_profile(p_subject uuid,p_request uuid,p_cpf text,p_evidence uuid,p_operation uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare item private.profile_registrations;prior private.signup_lifecycle_events;proof record;
begin
  perform pg_advisory_xact_lock_shared(78104,0);perform private.hmac_model_lock();
  if p_subject is null or p_request is null or p_evidence is null or p_operation is null then perform private.hmac_model_fail('P0001');end if;
  perform pg_advisory_xact_lock(78103,hashtext(p_subject::text));
  select * into prior from private.signup_lifecycle_events where operation_id=p_operation;
  if found then
    if prior.subject=p_subject and prior.request_id=p_request and prior.action='approved' and prior.evidence_id=p_evidence then return true;end if;
    perform private.hmac_model_fail('P0001');
  end if;
  select * into strict item from private.profile_registrations where user_id=p_subject and request_id=p_request and state='pending';
  if not exists(select 1 from private.accounts where user_id=p_subject and state='suspended')
    or not exists(select 1 from private.account_identity where user_id=p_subject and identity_state='unconfirmed') then perform private.hmac_model_fail('P0001');end if;
  -- Re-entry must match the pending claim; adds new required aliases atomically.
  perform private.hmac_model_record_pending(p_subject,p_request,p_cpf);
  select * into strict proof from private.signup_identity_evidence(p_evidence);
  if proof.subject is distinct from p_subject or proof.request_id is distinct from p_request or proof.identity_confirmed is distinct from true
    or proof.expires_at is null or proof.expires_at<=clock_timestamp()
    or not exists(select 1 from private.hmac_model_pending_aliases a join private.hmac_model_versions v on v.key_version=a.key_version
      where a.request_id=p_request and v.state='required' and a.key_version=proof.key_version and a.fingerprint=proof.fingerprint) then
    perform private.hmac_model_fail('P0001');
  end if;
  perform private.hmac_model_bind_verified(p_subject,p_cpf);
  insert into private.signup_profile_history(request_id,subject,display_name,fingerprint,key_version,requested_at,reason,operation_id)
    select item.request_id,item.user_id,p.display_name,item.cpf_fingerprint,item.fingerprint_version,item.created_at,'approved',p_operation from public.profiles p where p.id=p_subject;
  update private.profile_registrations set state='approved',pending_request_id=null where user_id=p_subject;
  perform private.hmac_ops_close_pending(p_subject,p_request,'verified',p_operation);
  update private.accounts set state='active' where user_id=p_subject;
  -- Identity proof is not the result of an official registry lookup.
  update private.account_identity set identity_state='confirmed' where user_id=p_subject;
  insert into private.signup_lifecycle_events(operation_id,subject,request_id,action,evidence_id) values(p_operation,p_subject,p_request,'approved',p_evidence);
  if proof.expires_at<=clock_timestamp() then perform private.hmac_model_fail('P0001');end if;
  return true;
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return false;
end$$;
-- Technical re-entry for an already verified identity; does not replace its CPF
-- or reopen registration. A trusted, bound evidence adapter is still required.
create function private.signup_refresh_identity(p_subject uuid,p_cpf text,p_evidence uuid,p_operation uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare item private.profile_registrations;prior private.signup_lifecycle_events;proof record;
begin
  perform pg_advisory_xact_lock_shared(78104,0);perform private.hmac_model_lock();
  if p_subject is null or p_evidence is null or p_operation is null then perform private.hmac_model_fail('P0001');end if;
  perform pg_advisory_xact_lock(78103,hashtext(p_subject::text));
  select * into strict item from private.profile_registrations where user_id=p_subject and state='approved';
  if not exists(select 1 from private.accounts a join private.account_identity i on i.user_id=a.user_id where a.user_id=p_subject and a.state='active' and i.identity_state='confirmed') then perform private.hmac_model_fail('P0001');end if;
  select * into prior from private.signup_lifecycle_events where operation_id=p_operation;
  if found then
    if prior.subject=p_subject and prior.request_id=item.request_id and prior.action='refreshed' and prior.evidence_id=p_evidence then return true;end if;
    perform private.hmac_model_fail('P0001');
  end if;
  select * into strict proof from private.signup_identity_evidence(p_evidence);
  if proof.subject is distinct from p_subject or proof.request_id is distinct from item.request_id or proof.identity_confirmed is distinct from true
    or proof.expires_at is null or proof.expires_at<=clock_timestamp()
    or not exists(select 1 from private.hmac_model_aliases a join private.hmac_model_versions v on v.key_version=a.key_version
      where a.subject=p_subject and v.state='required' and a.key_version=proof.key_version and a.fingerprint=proof.fingerprint) then perform private.hmac_model_fail('P0001');end if;
  perform private.hmac_model_bind_verified(p_subject,p_cpf);
  insert into private.signup_lifecycle_events(operation_id,subject,request_id,action,evidence_id) values(p_operation,p_subject,item.request_id,'refreshed',p_evidence);
  if proof.expires_at<=clock_timestamp() then perform private.hmac_model_fail('P0001');end if;
  return true;
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return false;
end$$;
create function private.signup_withdraw_profile(p_request uuid,p_operation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_subject uuid;
begin
  perform pg_advisory_xact_lock_shared(78104,0);v_subject:=private.onboarding_actor();perform private.hmac_model_lock();
  perform pg_advisory_xact_lock(78103,hashtext(v_subject::text));
  if private.onboarding_actor()<>v_subject then perform private.hmac_model_fail('P0001');end if;
  perform private.signup_close_profile(v_subject,p_request,'withdrawn',p_operation);
  return private.my_profile_registration();
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return null;
end$$;
create function private.signup_resubmit_profile(p_previous uuid,p_request uuid,p_name text,p_cpf text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_subject uuid;item private.profile_registrations;v_name text:=btrim(p_name);version integer;digest bytea;prior private.signup_lifecycle_events;
begin
  perform pg_advisory_xact_lock_shared(78104,0);v_subject:=private.onboarding_actor();perform private.hmac_model_lock();
  perform pg_advisory_xact_lock(78103,hashtext(v_subject::text));
  if private.onboarding_actor()<>v_subject or p_previous is null or p_request is null or p_previous=p_request
    or not private.onboarding_text_valid(v_name,120,true) or not private.onboarding_cpf_valid(p_cpf) then perform private.hmac_model_fail('P0001');end if;
  select * into prior from private.signup_lifecycle_events where operation_id=p_request;
  if found then
    if prior.subject<>v_subject or prior.request_id<>p_request or prior.action<>'resubmitted' or prior.previous_request_id is distinct from p_previous
      or not exists(select 1 from private.signup_profile_history where request_id=p_previous and subject=v_subject) then perform private.hmac_model_fail('P0001');end if;
    return private.register_profile(p_request,v_name,p_cpf);
  end if;
  select * into strict item from private.profile_registrations where user_id=v_subject and request_id=p_previous and state='rejected';
  if not exists(select 1 from private.signup_profile_history where request_id=p_previous and subject=v_subject)
    or exists(select 1 from private.hmac_model_identities where subject=v_subject)
    or not exists(select 1 from private.accounts a join private.account_identity i on i.user_id=a.user_id
      where a.user_id=v_subject and a.state='suspended' and i.identity_state='unconfirmed') then perform private.hmac_model_fail('P0001');end if;
  perform private.hmac_model_record_pending(v_subject,p_request,p_cpf);
  select p.current_version into strict version from private.hmac_model_policy p;
  select a.fingerprint into strict digest from private.hmac_model_pending_aliases a where a.request_id=p_request and a.key_version=version;
  update public.profiles set display_name=v_name where id=v_subject;
  update private.profile_registrations set request_id=p_request,state='pending',pending_request_id=p_request,cpf_fingerprint=digest,fingerprint_version=version,created_at=clock_timestamp() where user_id=v_subject;
  insert into private.signup_lifecycle_events(operation_id,subject,request_id,action,previous_request_id) values(p_request,v_subject,p_request,'resubmitted',p_previous);
  return private.my_profile_registration();
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return null;
end$$;

alter function private.request_company(uuid,text,text,text,text) rename to request_company_pending_only;
revoke all on function private.request_company_pending_only(uuid,text,text,text,text) from public,anon,authenticated;
create function private.request_company(p_request uuid,p_name text,p_address text,p_phone text,p_cnpj text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_subject uuid;
begin
  perform pg_advisory_xact_lock_shared(78104,0);v_subject:=private.onboarding_actor();perform private.hmac_model_lock();
  perform pg_advisory_xact_lock(78103,hashtext(v_subject::text));
  if private.onboarding_actor()<>v_subject or not exists(select 1 from private.profile_registrations r where r.user_id=v_subject
    and ((r.state='pending' and exists(select 1 from private.hmac_model_pending p where p.subject=r.user_id and p.request_id=r.request_id))
      or (r.state='approved' and exists(select 1 from private.hmac_model_identities i where i.subject=r.user_id)))) then perform private.hmac_model_fail('P0001');end if;
  return private.request_company_unversioned(p_request,p_name,p_address,p_phone,p_cnpj);
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return null;
end$$;
create function public.resubmit_profile(p_previous uuid,p_request uuid,p_name text,p_cpf text) returns jsonb language sql security invoker set search_path='' as $$select private.signup_resubmit_profile(p_previous,p_request,p_name,p_cpf)$$;
create function public.withdraw_profile(p_request uuid,p_operation uuid) returns jsonb language sql security invoker set search_path='' as $$select private.signup_withdraw_profile(p_request,p_operation)$$;
do $$declare item record;begin
  for item in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'signup_%' loop execute format('revoke all on function %s from public,anon,authenticated',item.signature);end loop;
end$$;
revoke all on function public.resubmit_profile(uuid,uuid,text,text),public.withdraw_profile(uuid,uuid),private.request_company(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.resubmit_profile(uuid,uuid,text,text),public.withdraw_profile(uuid,uuid),private.signup_resubmit_profile(uuid,uuid,text,text),private.signup_withdraw_profile(uuid,uuid),private.request_company(uuid,text,text,text,text) to authenticated;
do $$begin
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    where n.nspname='private' and c.relkind='r' and c.relname like 'signup_%' and a.grantee<>c.relowner)
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where ((n.nspname='private' and (p.proname like 'signup_%' or p.proname in ('request_company','request_company_pending_only')))
        or (n.nspname='public' and p.proname in ('withdraw_profile','resubmit_profile')))
      and a.grantee<>p.proowner and (a.grantee<>'authenticated'::regrole or a.privilege_type<>'EXECUTE' or a.is_grantable
        or p.proname not in ('signup_withdraw_profile','signup_resubmit_profile','withdraw_profile','resubmit_profile','request_company'))) then
    raise exception 'Signup lifecycle ACL failed';
  end if;
end$$;


-- Source supabase/candidates/company-correction/correction.CANDIDATE.sql SHA256 2ab9f4913089e2c33030263ab2764edf6c290f24e8ccbed4184bb7d15d85f57b
-- LOCAL PROOF ONLY. No official CNPJ lookup, representation approval or activation.

set local lock_timeout='3s';set local statement_timeout='10s';
select pg_advisory_xact_lock(78104,0);select pg_advisory_xact_lock(78106,0);
lock table private.company_registrations,private.company_controls in access exclusive mode;
do $$begin
  if current_setting('transaction_isolation')<>'read committed'
    or (select nspowner from pg_namespace where nspname='private') is distinct from current_user::regrole
    or has_schema_privilege('anon','private','CREATE') or has_schema_privilege('authenticated','private','CREATE')
    or (select proowner from pg_proc where oid=to_regprocedure('private.request_company(uuid,text,text,text,text)')) is distinct from current_user::regrole
    or exists(select 1 from private.company_registrations) then raise exception 'Company correction requires owned empty requests';end if;
end$$;
create table private.company_request_history (
  subject uuid not null,request_id uuid not null,company_id uuid not null references public.companies,
  cnpj text not null,name text not null,address text not null,phone text not null,
  requested_at timestamptz not null,archived_at timestamptz not null default clock_timestamp(),
  primary key(subject,request_id)
);
create table private.company_correction_events (
  subject uuid not null,operation_id uuid not null,request_id uuid not null,previous_request_id uuid,
  action text not null check(action in ('rejected','withdrawn','resubmitted')),
  occurred_at timestamptz not null default clock_timestamp(),connection_actor name not null default session_user,
  primary key(subject,operation_id),check((action='resubmitted')=(previous_request_id is not null))
);
alter table private.company_request_history enable row level security;alter table private.company_correction_events enable row level security;
revoke all on private.company_request_history,private.company_correction_events from public,anon,authenticated;
create function private.company_correction_archive(p_subject uuid,p_request uuid) returns void language plpgsql set search_path='' as $$begin
  insert into private.company_request_history(subject,request_id,company_id,cnpj,name,address,phone,requested_at)
    select r.requester_id,r.request_id,r.company_id,r.cnpj,c.name,c.address,c.phone,r.created_at
    from private.company_registrations r join public.companies c on c.id=r.company_id
    where r.requester_id=p_subject and r.request_id=p_request on conflict(subject,request_id) do nothing;
end$$;
create function private.company_correction_close(p_subject uuid,p_request uuid,p_reason text,p_operation uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare item private.company_registrations;prior private.company_correction_events;
begin
  perform pg_advisory_xact_lock_shared(78104,0);perform private.hmac_model_lock();
  if p_subject is null or p_request is null or p_operation is null or p_reason is null or p_reason not in ('rejected','withdrawn') then perform private.hmac_model_fail('P0001');end if;
  perform pg_advisory_xact_lock(78103,hashtext(p_subject::text));
  select * into prior from private.company_correction_events where subject=p_subject and operation_id=p_operation;
  if found then
    if prior.action=p_reason and prior.request_id=p_request then return true;end if;perform private.hmac_model_fail('P0001');
  end if;
  select * into strict item from private.company_registrations where requester_id=p_subject and request_id=p_request and state='pending';
  if not exists(select 1 from private.company_controls where company_id=item.company_id and state='pending' and cnpj is null and representation_state='unconfirmed')
    or exists(select 1 from public.memberships where company_id=item.company_id) then perform private.hmac_model_fail('P0001');end if;
  perform private.company_correction_archive(p_subject,p_request);
  update private.company_registrations set state='rejected' where id=item.id;
  insert into private.company_correction_events(subject,operation_id,request_id,action) values(p_subject,p_operation,p_request,p_reason);
  return true;
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return false;
end$$;
create function private.company_correction_withdraw(p_request uuid,p_operation uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_subject uuid;
begin
  perform pg_advisory_xact_lock_shared(78104,0);v_subject:=private.onboarding_actor();perform private.hmac_model_lock();
  perform pg_advisory_xact_lock(78103,hashtext(v_subject::text));
  if private.onboarding_actor()<>v_subject then perform private.hmac_model_fail('P0001');end if;
  perform private.company_correction_close(v_subject,p_request,'withdrawn',p_operation);
  return private.my_company_registration(p_request);
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return null;
end$$;
create function private.company_correction_resubmit(p_previous uuid,p_request uuid,p_name text,p_address text,p_phone text,p_cnpj text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_subject uuid;item private.company_registrations;prior private.company_correction_events;
  v_name text:=btrim(p_name);v_address text:=btrim(p_address);v_phone text:=btrim(p_phone);
begin
  perform pg_advisory_xact_lock_shared(78104,0);v_subject:=private.onboarding_actor();perform private.hmac_model_lock();
  perform pg_advisory_xact_lock(78103,hashtext(v_subject::text));
  if private.onboarding_actor()<>v_subject or p_previous is null or p_request is null or p_previous=p_request
    or not private.onboarding_text_valid(v_name,160,true) or not private.onboarding_text_valid(v_address,500,false)
    or not private.onboarding_text_valid(v_phone,80,false) or not private.onboarding_cnpj_valid(p_cnpj)
    or not exists(select 1 from private.profile_registrations r join private.accounts a on a.user_id=r.user_id join private.account_identity i on i.user_id=r.user_id
      where r.user_id=v_subject and i.identity_state<>'disputed'
        and ((r.state='pending' and a.state='suspended' and exists(select 1 from private.hmac_model_pending p where p.subject=r.user_id and p.request_id=r.request_id))
          or (r.state='approved' and a.state='active' and exists(select 1 from private.hmac_model_identities m where m.subject=r.user_id)))) then perform private.hmac_model_fail('P0001');end if;
  select * into prior from private.company_correction_events where subject=v_subject and operation_id=p_request;
  if found then
    if prior.action<>'resubmitted' or prior.request_id<>p_request or prior.previous_request_id is distinct from p_previous
      or not exists(select 1 from private.company_registrations r join public.companies c on c.id=r.company_id
        where r.requester_id=v_subject and r.request_id=p_request and r.state='pending' and r.cnpj=p_cnpj and c.name=v_name and c.address=v_address and c.phone=v_phone) then perform private.hmac_model_fail('P0001');end if;
    return private.my_company_registration(p_request);
  end if;
  if exists(select 1 from private.company_request_history where subject=v_subject and request_id=p_request)
    or exists(select 1 from private.company_registrations where requester_id=v_subject and request_id=p_request)
    or (select count(*) from private.company_registrations where requester_id=v_subject and state='pending')>=10 then perform private.hmac_model_fail('P0001');end if;
  select * into strict item from private.company_registrations where requester_id=v_subject and request_id=p_previous and state='rejected';
  if not exists(select 1 from private.company_controls where company_id=item.company_id and state='pending' and cnpj is null and representation_state='unconfirmed')
    or exists(select 1 from public.memberships where company_id=item.company_id) then perform private.hmac_model_fail('P0001');end if;
  perform private.company_correction_archive(v_subject,p_previous);
  -- Update the same unverified company, preserving its ID and private history.
  update public.companies set name=v_name,address=v_address,phone=v_phone where id=item.company_id;
  update private.company_registrations set request_id=p_request,cnpj=p_cnpj,state='pending',created_at=clock_timestamp() where id=item.id;
  insert into private.company_correction_events(subject,operation_id,request_id,previous_request_id,action) values(v_subject,p_request,p_request,p_previous,'resubmitted');
  return private.my_company_registration(p_request);
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return null;
end$$;
alter function private.request_company(uuid,text,text,text,text) rename to request_company_before_correction;
revoke all on function private.request_company_before_correction(uuid,text,text,text,text) from public,anon,authenticated;
create function private.request_company(p_request uuid,p_name text,p_address text,p_phone text,p_cnpj text) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_subject uuid;
begin
  perform pg_advisory_xact_lock_shared(78104,0);v_subject:=private.onboarding_actor();perform private.hmac_model_lock();
  perform pg_advisory_xact_lock(78103,hashtext(v_subject::text));
  if private.onboarding_actor()<>v_subject or exists(select 1 from private.company_request_history where subject=v_subject and request_id=p_request) then perform private.hmac_model_fail('P0001');end if;
  return private.request_company_before_correction(p_request,p_name,p_address,p_phone,p_cnpj);
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return null;
end$$;
create function public.resubmit_company(p_previous uuid,p_request uuid,p_name text,p_address text,p_phone text,p_cnpj text) returns jsonb language sql security invoker set search_path='' as $$select private.company_correction_resubmit(p_previous,p_request,p_name,p_address,p_phone,p_cnpj)$$;
create function public.withdraw_company(p_request uuid,p_operation uuid) returns jsonb language sql security invoker set search_path='' as $$select private.company_correction_withdraw(p_request,p_operation)$$;
do $$declare item record;begin
  for item in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname like 'company_correction_%' loop execute format('revoke all on function %s from public,anon,authenticated',item.signature);end loop;
end$$;
revoke all on function public.resubmit_company(uuid,uuid,text,text,text,text),public.withdraw_company(uuid,uuid),private.request_company(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.resubmit_company(uuid,uuid,text,text,text,text),public.withdraw_company(uuid,uuid),private.company_correction_resubmit(uuid,uuid,text,text,text,text),private.company_correction_withdraw(uuid,uuid),private.request_company(uuid,text,text,text,text) to authenticated;
do $$begin
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    where n.nspname='private' and c.relkind='r' and c.relname in ('company_request_history','company_correction_events') and a.grantee<>c.relowner)
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where ((n.nspname='private' and (p.proname like 'company_correction_%' or p.proname in ('request_company','request_company_before_correction')))
        or (n.nspname='public' and p.proname in ('resubmit_company','withdraw_company')))
      and a.grantee<>p.proowner and (a.grantee<>'authenticated'::regrole or a.privilege_type<>'EXECUTE' or a.is_grantable
        or p.proname not in ('company_correction_resubmit','company_correction_withdraw','request_company','resubmit_company','withdraw_company'))) then raise exception 'Company correction ACL failed';end if;
end$$;


-- Source supabase/candidates/registration-recovery/recovery.CANDIDATE.sql SHA256 a891b16acdbabb60941e4454416c1812cc766bc34329c5bcbb0ef8dfa7cce2e9
-- LOCAL REVIEW CANDIDATE. Technical admission budgets; no online policy enabled.

set local lock_timeout='3s';set local statement_timeout='10s';
select pg_advisory_xact_lock(78104,0);select pg_advisory_xact_lock(78106,0);
lock table private.profile_registrations,private.company_registrations in access exclusive mode;
do $$begin
  if current_setting('transaction_isolation')<>'read committed'
    or (select nspowner from pg_namespace where nspname='private') is distinct from current_user::regrole
    or has_schema_privilege('anon','private','CREATE') or has_schema_privilege('authenticated','private','CREATE')
    or exists(select 1 from private.profile_registrations) or exists(select 1 from private.company_registrations)
    or exists(select 1 from private.signup_profile_history) or exists(select 1 from private.company_request_history) then raise exception 'Registration recovery requires owned empty requests';end if;
end$$;
create table private.registration_admissions (
  subject uuid not null,domain text not null check(domain in ('profile','company')),
  request_id uuid not null,accepted_at timestamptz not null default clock_timestamp(),primary key(subject,domain,request_id)
);
alter table private.registration_admissions enable row level security;
revoke all on private.registration_admissions from public,anon,authenticated;
create function private.registration_admit(p_domain text,p_request uuid) returns void language plpgsql set search_path='' as $$
declare v_subject uuid;v_limit integer;
begin
  perform pg_advisory_xact_lock_shared(78104,0);v_subject:=private.onboarding_actor();perform private.hmac_model_lock();
  perform pg_advisory_xact_lock(78103,hashtext(v_subject::text));
  if private.onboarding_actor()<>v_subject or p_request is null or p_domain is null or p_domain not in ('profile','company') then perform private.hmac_model_fail('P0001');end if;
  if exists(select 1 from private.registration_admissions where subject=v_subject and domain=p_domain and request_id=p_request) then return;end if;
  -- Local technical proposal, not a final product/commercial limit. Withdrawal
  -- never removes admissions; unsuccessful statements roll them back atomically.
  v_limit:=case when p_domain='profile' then 10 else 20 end;
  if (select count(*) from private.registration_admissions where subject=v_subject and domain=p_domain and accepted_at>clock_timestamp()-interval '24 hours')>=v_limit then perform private.hmac_model_fail('P0001');end if;
  insert into private.registration_admissions(subject,domain,request_id) values(v_subject,p_domain,p_request);
end$$;
create function private.registration_profile_request() returns jsonb language plpgsql security definer set search_path='' as $$
declare v_subject uuid;result jsonb;
begin
  perform pg_advisory_xact_lock_shared(78104,0);v_subject:=private.onboarding_actor();
  select jsonb_build_object('request_id',r.request_id,'registration_state',r.state) into result from private.profile_registrations r where r.user_id=v_subject;
  return coalesce(result,jsonb_build_object('request_id',null,'registration_state','not_started'));
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return null;
end$$;
create function private.registration_company_page(p_after uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_subject uuid;result jsonb;
begin
  perform pg_advisory_xact_lock_shared(78104,0);v_subject:=private.onboarding_actor();
  with page as (select r.request_id,row_number() over(order by r.request_id) position from private.company_registrations r
      where r.requester_id=v_subject and (p_after is null or r.request_id>p_after) order by r.request_id limit 11)
    select jsonb_build_object('request_ids',coalesce(jsonb_agg(request_id order by request_id) filter(where position<=10),'[]'::jsonb),
      'has_more',count(*)>10,'next_cursor',case when count(*)>10 then (select request_id from page where position=10) else null end) into result from page;
  return result;
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return null;
end$$;
alter function private.register_profile(uuid,text,text) rename to register_profile_before_limits;
alter function private.signup_resubmit_profile(uuid,uuid,text,text) rename to signup_resubmit_profile_before_limits;
alter function private.request_company(uuid,text,text,text,text) rename to request_company_before_limits;
alter function private.company_correction_resubmit(uuid,uuid,text,text,text,text) rename to company_correction_resubmit_before_limits;
revoke all on function private.register_profile_before_limits(uuid,text,text),private.signup_resubmit_profile_before_limits(uuid,uuid,text,text),private.request_company_before_limits(uuid,text,text,text,text),private.company_correction_resubmit_before_limits(uuid,uuid,text,text,text,text) from public,anon,authenticated;
create function private.register_profile(p_request uuid,p_name text,p_cpf text) returns jsonb language plpgsql security definer set search_path='' as $$begin
  perform private.registration_admit('profile',p_request);return private.register_profile_before_limits(p_request,p_name,p_cpf);
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return null;end$$;
create function private.signup_resubmit_profile(p_previous uuid,p_request uuid,p_name text,p_cpf text) returns jsonb language plpgsql security definer set search_path='' as $$begin
  perform private.registration_admit('profile',p_request);return private.signup_resubmit_profile_before_limits(p_previous,p_request,p_name,p_cpf);
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return null;end$$;
create function private.request_company(p_request uuid,p_name text,p_address text,p_phone text,p_cnpj text) returns jsonb language plpgsql security definer set search_path='' as $$begin
  perform private.registration_admit('company',p_request);return private.request_company_before_limits(p_request,p_name,p_address,p_phone,p_cnpj);
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return null;end$$;
create function private.company_correction_resubmit(p_previous uuid,p_request uuid,p_name text,p_address text,p_phone text,p_cnpj text) returns jsonb language plpgsql security definer set search_path='' as $$begin
  perform private.registration_admit('company',p_request);return private.company_correction_resubmit_before_limits(p_previous,p_request,p_name,p_address,p_phone,p_cnpj);
exception when others or query_canceled or assert_failure then perform private.hmac_model_fail(sqlstate);return null;end$$;
create function public.my_profile_registration_request() returns jsonb language sql security invoker set search_path='' as $$select private.registration_profile_request()$$;
create function public.my_company_registration_page(p_after uuid) returns jsonb language sql security invoker set search_path='' as $$select private.registration_company_page(p_after)$$;
do $$declare item record;begin
  for item in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and (p.proname like 'registration_%' or p.proname in ('register_profile','signup_resubmit_profile','request_company','company_correction_resubmit')) loop execute format('revoke all on function %s from public,anon,authenticated',item.signature);end loop;
end$$;
revoke all on function public.my_profile_registration_request(),public.my_company_registration_page(uuid) from public,anon,authenticated;
grant execute on function public.my_profile_registration_request(),public.my_company_registration_page(uuid),private.registration_profile_request(),private.registration_company_page(uuid),private.register_profile(uuid,text,text),private.signup_resubmit_profile(uuid,uuid,text,text),private.request_company(uuid,text,text,text,text),private.company_correction_resubmit(uuid,uuid,text,text,text,text) to authenticated;
do $$begin
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
    where n.nspname='private' and c.relname='registration_admissions' and a.grantee<>c.relowner)
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where ((n.nspname='private' and (p.proname like 'registration_%' or p.proname in ('register_profile','signup_resubmit_profile','request_company','company_correction_resubmit','register_profile_before_limits','signup_resubmit_profile_before_limits','request_company_before_limits','company_correction_resubmit_before_limits')))
        or(n.nspname='public' and p.proname in ('my_profile_registration_request','my_company_registration_page')))
      and a.grantee<>p.proowner and (a.grantee<>'authenticated'::regrole or a.privilege_type<>'EXECUTE' or a.is_grantable
        or p.proname not in ('registration_profile_request','registration_company_page','my_profile_registration_request','my_company_registration_page','register_profile','signup_resubmit_profile','request_company','company_correction_resubmit'))) then raise exception 'Registration recovery ACL failed';end if;
end$$;




grant create on schema public to connect_hmac_registration;
do $schema_owner_grant$begin execute format('grant create on database %I to connect_hmac_registration',current_database());end $schema_owner_grant$;
alter schema private owner to connect_hmac_registration;
do $schema_owner_revoke$begin execute format('revoke create on database %I from connect_hmac_registration',current_database());end $schema_owner_revoke$;
set role connect_hmac_registration;grant usage on schema private to postgres;set role postgres;
alter table public.profiles owner to connect_hmac_registration;
alter table private.accounts owner to connect_hmac_registration;
alter table private.account_identity owner to connect_hmac_registration;
alter table public.companies owner to connect_hmac_registration;
alter table private.company_controls owner to connect_hmac_registration;
set role connect_hmac_registration;
grant all on public.profiles,private.accounts,private.account_identity,public.companies,private.company_controls to postgres;
set role postgres;
do $move_objects$declare item record;begin
 for item in select c.oid,n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in('public','private') and c.relkind in('r','p') and not exists(select 1 from pg_temp.connect_registration_before b where b.kind='relation' and b.oid=c.oid)
 loop execute format('alter table %I.%I owner to connect_hmac_registration',item.nspname,item.relname);end loop;
 for item in select c.oid,n.nspname,c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in('public','private') and c.relkind='S' and c.relowner<>'connect_hmac_registration'::regrole and not exists(select 1 from pg_temp.connect_registration_before b where b.kind='relation' and b.oid=c.oid)
 loop execute format('alter sequence %I.%I owner to connect_hmac_registration',item.nspname,item.relname);end loop;
 for item in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('public','private') and p.oid<>'private.onboarding_actor()'::regprocedure and not exists(select 1 from pg_temp.connect_registration_before b where b.kind='function' and b.oid=p.oid)
 loop execute format('alter function %s owner to connect_hmac_registration',item.oid::regprocedure);end loop;
end $move_objects$;
revoke create on schema public from connect_hmac_registration;
grant usage on schema extensions to connect_hmac_registration;
grant execute on function extensions.hmac(bytea,bytea,text),private.lock_accounts(uuid[]),private.onboarding_actor() to connect_hmac_registration;
grant usage on schema vault to connect_hmac_registration;
grant select(id,decrypted_secret) on vault.decrypted_secrets to connect_hmac_registration;
grant execute on function vault._crypto_aead_det_decrypt(bytea,bytea,bigint,bytea,bytea) to connect_hmac_registration;
grant select on pg_temp.connect_registration_before to connect_hmac_registration;
set role connect_hmac_registration;
-- The first connected cut exposes only the six pending-registration RPCs.
-- Correction/withdrawal/activation are outside this cut and are closed on server.
do $pending_surface$declare item record;begin
 for item in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in('public','private') and p.proowner='connect_hmac_registration'::regrole
   and not exists(select 1 from pg_temp.connect_registration_before b where b.kind='function' and b.oid=p.oid)
 loop execute format('revoke all on function %s from public,anon,authenticated',item.oid::regprocedure);end loop;
end $pending_surface$;
grant execute on function public.register_profile(uuid,text,text),private.register_profile(uuid,text,text),
 public.request_company(uuid,text,text,text,text),private.request_company(uuid,text,text,text,text),
 public.my_profile_registration(),private.my_profile_registration(),
 public.my_profile_registration_request(),private.registration_profile_request(),
 public.my_company_registration_page(uuid),private.registration_company_page(uuid),
 public.my_company_registration(uuid),private.my_company_registration(uuid) to authenticated;
create function private.connect_finish_registration(source_secret uuid) returns boolean language plpgsql security definer set search_path='' as $finish$
declare key_reference uuid:=gen_random_uuid();
begin
 execute $scope_plan$-- LOCAL CANDIDATE. Metadata assertion is not human approval. No key, mapping, grants or roles created.
-- Review review-managed-connect-20261108; operations source 260a24318954824c8aa0a811c35597dd552416e1b3bbaca864bb873b749494a3

set local lock_timeout='3s';set local statement_timeout='10s';set local search_path=pg_catalog;
select pg_advisory_xact_lock(78104,0);select pg_advisory_xact_lock(78106,0);
do $preflight$
declare runtime oid; view_oid oid;
begin
  select oid into runtime from pg_roles where rolname='connect_hmac_registration' and not rolcanlogin and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb and not rolreplication;
  if runtime is null or current_user::regrole::oid<>runtime
    or exists(select 1 from pg_auth_members where member=runtime or (roleid=runtime and (member<>'postgres'::regrole or inherit_option or set_option)))
    or (select nspowner from pg_namespace where nspname='private') is distinct from runtime
    or has_schema_privilege('anon','private','CREATE') or has_schema_privilege('authenticated','private','CREATE')
    or to_regprocedure('private.hmac_ops_expected_scope()') is null
    or to_regprocedure('private.hmac_model_read_key(uuid)') is null then raise exception 'Runtime principal preflight refused';end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and (p.proname like 'hmac\_%' escape '\' or p.proname in ('register_profile','request_company')) and p.proowner<>runtime)
    or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='private' and c.relname like 'hmac\_%' escape '\' and c.relowner<>runtime)
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where n.nspname='private' and p.proname like 'hmac\_%' escape '\' and a.grantee<>runtime)
    or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a where n.nspname='private' and c.relname like 'hmac\_%' escape '\' and a.grantee<>runtime)
    or exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace join pg_attribute col on col.attrelid=c.oid cross join lateral aclexplode(col.attacl) a where n.nspname='private' and c.relname like 'hmac\_%' escape '\' and a.grantee<>runtime) then raise exception 'Runtime ownership or ACL preflight refused';end if;
  view_oid:=to_regclass('vault.decrypted_secrets');
  if view_oid is null or (select relowner from pg_class where oid=view_oid) is distinct from (select oid from pg_roles where rolname='supabase_admin')
    or not has_schema_privilege(runtime,'vault','USAGE') or not has_column_privilege(runtime,view_oid,'decrypted_secret','SELECT') or not has_column_privilege(runtime,view_oid,'id','SELECT')
    or exists(select 1 from pg_roles r where r.rolname in ('anon','authenticated') and (has_schema_privilege(r.oid,'vault','USAGE') or has_column_privilege(r.oid,view_oid,'decrypted_secret','SELECT')))
    or exists(select 1 from pg_rewrite w join pg_depend d on d.classid='pg_rewrite'::regclass and d.objid=w.oid and d.refclassid='pg_proc'::regclass where w.ev_class=view_oid and not has_function_privilege(runtime,d.refobjid,'EXECUTE')) then raise exception 'Runtime provider metadata preflight refused';end if;
  lock table private.hmac_ops_key_sources,private.hmac_model_versions,private.hmac_model_policy in access exclusive mode;
  if exists(select 1 from private.hmac_ops_key_sources) or exists(select 1 from private.hmac_model_versions) or exists(select 1 from private.hmac_model_policy) then raise exception 'Runtime requires unconfigured model';end if;
end $preflight$;
create or replace function private.hmac_ops_expected_scope() returns text language sql set search_path='' as $scope$select 'connect/ibdlvlwdzmsrbqadrudb/homolog/cpf-hmac'::text$scope$;
revoke all on function private.hmac_ops_expected_scope() from public,anon,authenticated;

$scope_plan$;
 insert into private.hmac_ops_key_sources(ref,secret_id,scope,purpose,encoding)
 values(key_reference,source_secret,'connect/ibdlvlwdzmsrbqadrudb/homolog/cpf-hmac','cpf-hmac','hex32');
 if private.hmac_model_stage(1,key_reference) is distinct from true then raise exception 'Managed registration stage refused';end if;
 if private.hmac_model_promote(1) is distinct from true then raise exception 'Managed registration promotion refused';end if;
 if not exists(select 1 from private.hmac_model_policy where singleton and current_version=1 and write_enabled)
  or not exists(select 1 from private.hmac_model_versions where key_version=1 and state='required') then
  raise exception 'Managed registration model initialization refused';end if;
 drop function private.connect_finish_registration(uuid);
 return true;
end $finish$;
revoke all on function private.connect_finish_registration(uuid) from public,anon,authenticated;
grant execute on function private.connect_finish_registration(uuid) to postgres;
set role postgres;
grant connect_hmac_registration to postgres with set false;
do $key_setup$declare source_id uuid;finished boolean;begin
 source_id:=vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'connect/ibdlvlwdzmsrbqadrudb/homolog/cpf-hmac/v1','Connect synthetic homologation CPF HMAC version 1');
 finished:=private.connect_finish_registration(source_id);
 if finished is distinct from true then raise exception 'Managed registration setup refused';end if;
exception when others then raise exception using errcode='P0001',message='Managed registration key setup failed';
end $key_setup$;
do $managed_final$begin
 if not exists(select 1 from pg_auth_members where roleid='connect_hmac_registration'::regrole and member='postgres'::regrole and admin_option and not inherit_option and not set_option)
  or exists(select 1 from pg_auth_members where member='connect_hmac_registration'::regrole or (roleid='connect_hmac_registration'::regrole and (member<>'postgres'::regrole or inherit_option or set_option)))
  or not exists(select 1 from pg_roles where rolname='connect_hmac_registration' and not rolcanlogin and not rolsuper and not rolbypassrls and not rolcreaterole and not rolcreatedb and not rolreplication)
  or to_regprocedure('private.connect_finish_registration(uuid)') is not null
  or has_schema_privilege('connect_hmac_registration','public','CREATE')
  or has_database_privilege('connect_hmac_registration',current_database(),'CREATE')
  or has_table_privilege('connect_hmac_registration','auth.users','SELECT')
  or has_column_privilege('connect_hmac_registration','auth.users','email','SELECT')
  or has_column_privilege('connect_hmac_registration','auth.users','email_confirmed_at','SELECT')
  or (select proowner from pg_proc where oid='private.onboarding_actor()'::regprocedure)<>'postgres'::regrole
  or has_function_privilege('anon','private.onboarding_actor()','EXECUTE')
  or has_function_privilege('authenticated','private.onboarding_actor()','EXECUTE')
  or has_function_privilege('authenticated','private.hmac_model_read_key(uuid)','EXECUTE')
  or (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and not exists(select 1 from pg_temp.connect_registration_before b where b.kind='function' and b.oid=p.oid)
       and has_function_privilege('authenticated',p.oid,'EXECUTE'))<>6
  or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname in('public','private') and not exists(select 1 from pg_temp.connect_registration_before b where b.kind='function' and b.oid=p.oid)
       and has_function_privilege('anon',p.oid,'EXECUTE'))
 then raise exception 'Managed registration final privilege state refused';end if;
end $managed_final$;
notify pgrst,'reload schema';
commit;
