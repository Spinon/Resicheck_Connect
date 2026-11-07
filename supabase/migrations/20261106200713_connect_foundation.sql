-- Connect-only local foundation. Never apply to another application's database.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120)
);
create table private.accounts (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  state text not null default 'suspended' check (state in ('active','suspended'))
);
create table private.account_identity (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  format_state text not null default 'unchecked' check (format_state in ('unchecked','valid','invalid')),
  registry_state text not null default 'unchecked' check (registry_state in ('unchecked','matched','mismatched','unavailable')),
  contact_state text not null default 'unconfirmed' check (contact_state in ('unconfirmed','confirmed')),
  identity_state text not null default 'unconfirmed' check (identity_state in ('unconfirmed','confirmed','disputed'))
);
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 160),
  address text not null default '' check (char_length(address) <= 500),
  phone text not null default '' check (char_length(phone) <= 80)
);
create table private.company_controls (
  company_id uuid primary key references public.companies(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','active','suspended')),
  cnpj text unique check (cnpj ~ '^[A-Z0-9]{12}[0-9]{2}$'),
  representation_state text not null default 'unconfirmed' check (representation_state in ('unconfirmed','confirmed','disputed'))
);
create table public.memberships (
  company_id uuid not null references public.companies(id),
  user_id uuid not null references public.profiles(id),
  role text not null check (role in ('manager','staff','patient')),
  state text not null check (state in ('pending','active','revoked')),
  primary key (company_id,user_id,role)
);
create unique index staff_one_active_company on public.memberships(user_id) where role='staff' and state='active';
create index memberships_user_context on public.memberships(user_id,company_id,role,state);
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  patient_id uuid not null references public.profiles(id),
  patient_role text generated always as ('patient'::text) stored,
  last_sequence bigint not null default 0 check (last_sequence >= 0),
  unique(company_id,patient_id), unique(company_id,id),
  foreign key(company_id,patient_id,patient_role) references public.memberships(company_id,user_id,role)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  conversation_id uuid not null,
  sender_id uuid not null references public.profiles(id),
  sender_role text not null check (sender_role in ('staff','patient')),
  sequence bigint not null check (sequence > 0),
  accepted_at timestamptz not null default now(),
  kind text not null default 'text' check (kind='text'),
  body text not null check (char_length(body) between 1 and 2000 and body ~ '[^[:space:]]' and body !~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]'),
  important boolean not null default false,
  foreign key(company_id,conversation_id) references public.conversations(company_id,id),
  unique(company_id,conversation_id,sequence), unique(company_id,conversation_id,id)
);
create index messages_history on public.messages(company_id,conversation_id,sequence);
create table private.message_receipts (
  sender_id uuid not null references public.profiles(id),
  company_id uuid not null, conversation_id uuid not null,
  client_message_id text not null check (client_message_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  message_id uuid not null,
  primary key(sender_id,company_id,conversation_id,client_message_id),
  foreign key(company_id,conversation_id,message_id) references public.messages(company_id,conversation_id,id)
);
create table private.staff_invitations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  issuer_id uuid not null references public.profiles(id),
  recipient_id uuid not null references public.profiles(id),
  token_hash bytea not null check (octet_length(token_hash)=32),
  expires_at timestamptz not null,
  revoked boolean not null default false,
  consumed_by uuid references public.profiles(id),
  check(consumed_by is null or consumed_by=recipient_id)
);
create table private.platform_grants (
  user_id uuid not null references public.profiles(id),
  grant_name text not null check (grant_name in ('users:metadata:read','companies:metadata:read','audit:read')),
  primary key(user_id,grant_name)
);
create table private.audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid not null references public.profiles(id),
  company_id uuid not null references public.companies(id),
  action text not null check (action in ('patient-linked','staff-requested','staff-invite-accepted','staff-approved','staff-revoked','message-accepted','message-important-changed')),
  target_id uuid not null,
  occurred_at timestamptz not null default now()
);
create index audit_company_time on private.audit_events(company_id,occurred_at);

-- No user-editable metadata participates in permissions. Require a live Auth session as well
-- as active account and unexpired claim; JWT verification itself belongs to the Auth gateway.
create function private.active_actor() returns boolean language plpgsql stable security definer set search_path='' as $$
declare claims jsonb; expiration text;
begin
  claims := auth.jwt(); expiration := claims->>'exp';
  if auth.uid() is null or expiration is null or expiration !~ '^[0-9]{1,12}$' then return false; end if;
  if expiration::numeric <= extract(epoch from now()) then return false; end if;
  return exists(select 1 from private.accounts a join auth.sessions s on s.user_id=a.user_id
    where a.user_id=auth.uid() and a.state='active' and s.id::text=claims->>'session_id'
      and (s.not_after is null or s.not_after>now()));
end $$;
create function private.company_active(p_company uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from private.company_controls where company_id=p_company and state='active')
$$;
create function private.has_role(p_company uuid,p_role text) returns boolean language sql stable security definer set search_path='' as $$
  select private.active_actor() and private.company_active(p_company) and exists(select 1 from public.memberships
    where company_id=p_company and user_id=auth.uid() and role=p_role and state='active')
$$;
create function private.can_chat(p_company uuid,p_patient uuid) returns boolean language sql stable security definer set search_path='' as $$
  select private.has_role(p_company,'staff') or (auth.uid()=p_patient and private.has_role(p_company,'patient'))
$$;
create function private.can_read_conversation(p_company uuid,p_conversation uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.conversations c where c.id=p_conversation and c.company_id=p_company and private.can_chat(c.company_id,c.patient_id))
$$;
create function private.lock_accounts(p_users uuid[]) returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from private.accounts where user_id=any(p_users) order by user_id for update;
end $$;

alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.memberships enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table private.accounts enable row level security;
alter table private.account_identity enable row level security;
alter table private.company_controls enable row level security;
alter table private.message_receipts enable row level security;
alter table private.staff_invitations enable row level security;
alter table private.platform_grants enable row level security;
alter table private.audit_events enable row level security;
create policy profile_self on public.profiles for select to authenticated using (id=(select auth.uid()) and (select private.active_actor()));
create policy companies_public_fields on public.companies for select to authenticated using ((select private.active_actor()) and private.company_active(id));
create policy memberships_self_or_manager on public.memberships for select to authenticated using ((select private.active_actor()) and (user_id=(select auth.uid()) or private.has_role(company_id,'manager')));
create policy own_or_staff_conversations on public.conversations for select to authenticated using (private.can_chat(company_id,patient_id));
create policy own_or_staff_messages on public.messages for select to authenticated using (private.can_read_conversation(company_id,conversation_id));
-- Restrict only Connect objects; never change grants on unrelated/extension objects.
revoke all on public.profiles,public.companies,public.memberships,public.conversations,public.messages from public,anon,authenticated;
revoke all on private.accounts,private.account_identity,private.company_controls,private.message_receipts,private.staff_invitations,private.platform_grants,private.audit_events from public,anon,authenticated;
revoke all on sequence private.audit_events_id_seq from public,anon,authenticated;
grant select on public.profiles,public.companies,public.memberships,public.messages to authenticated;
-- Generated patient_role and sequence counter are implementation fields, not API DTOs.
grant select(id,company_id,patient_id) on public.conversations to authenticated;

create function private.link_patient(p_company uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare conversation uuid; current_state text;
begin
  if not private.active_actor() then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  perform private.lock_accounts(array[auth.uid()]);
  if not private.active_actor() or not private.company_active(p_company) then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  select state into current_state from public.memberships where company_id=p_company and user_id=auth.uid() and role='patient';
  if current_state is not null and current_state<>'active' then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  insert into public.memberships(company_id,user_id,role,state) values(p_company,auth.uid(),'patient','active') on conflict do nothing;
  insert into public.conversations(company_id,patient_id) values(p_company,auth.uid()) on conflict(company_id,patient_id) do nothing returning id into conversation;
  if conversation is not null then
    insert into private.audit_events(actor_id,company_id,action,target_id) values(auth.uid(),p_company,'patient-linked',conversation);
  else select id into conversation from public.conversations where company_id=p_company and patient_id=auth.uid(); end if;
  return conversation;
end $$;

create function private.request_staff(p_company uuid) returns void language plpgsql security definer set search_path='' as $$
declare current_state text;
begin
  if not private.active_actor() then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  perform private.lock_accounts(array[auth.uid()]);
  if not private.active_actor() or not private.company_active(p_company) then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  select state into current_state from public.memberships where company_id=p_company and user_id=auth.uid() and role='staff';
  if current_state in ('active','pending') then return; end if;
  if current_state='revoked' then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  insert into public.memberships(company_id,user_id,role,state) values(p_company,auth.uid(),'staff','pending');
  insert into private.audit_events(actor_id,company_id,action,target_id) values(auth.uid(),p_company,'staff-requested',auth.uid());
end $$;

create function private.accept_staff_invite(p_invite uuid,p_token text) returns void language plpgsql security definer set search_path='' as $$
declare invitation private.staff_invitations; current_state text;
begin
  if not private.active_actor() or p_token is null or char_length(p_token) not between 32 and 256 then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  select * into invitation from private.staff_invitations where id=p_invite;
  if not found then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  perform private.lock_accounts(array[auth.uid(),invitation.issuer_id]);
  select * into invitation from private.staff_invitations where id=p_invite for update;
  if not private.active_actor() or invitation.revoked or invitation.expires_at<=now() or invitation.recipient_id<>auth.uid()
    or invitation.token_hash<>sha256(convert_to(p_token,'UTF8')) or not private.company_active(invitation.company_id)
    or not exists(select 1 from public.memberships m join private.accounts a on a.user_id=m.user_id
      where m.company_id=invitation.company_id and m.user_id=invitation.issuer_id and m.role='manager' and m.state='active' and a.state='active')
    then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  select state into current_state from public.memberships where company_id=invitation.company_id and user_id=auth.uid() and role='staff';
  if invitation.consumed_by is not null then
    if invitation.consumed_by=auth.uid() and current_state='active' then return; end if;
    raise exception using errcode='P0001',message='Operação indisponível';
  end if;
  if current_state='revoked' or exists(select 1 from public.memberships where user_id=auth.uid() and role='staff' and state='active' and company_id<>invitation.company_id)
    then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  insert into public.memberships(company_id,user_id,role,state) values(invitation.company_id,auth.uid(),'staff','active')
    on conflict(company_id,user_id,role) do update set state='active';
  update private.staff_invitations set consumed_by=auth.uid() where id=p_invite;
  insert into private.audit_events(actor_id,company_id,action,target_id) values(auth.uid(),invitation.company_id,'staff-invite-accepted',p_invite);
exception when unique_violation then raise exception using errcode='P0001',message='Operação indisponível';
end $$;

create function private.approve_staff(p_company uuid,p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.active_actor() then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  perform private.lock_accounts(array[auth.uid(),p_user]);
  if not private.has_role(p_company,'manager') or not exists(select 1 from private.accounts where user_id=p_user and state='active')
    or exists(select 1 from public.memberships where user_id=p_user and role='staff' and state='active' and company_id<>p_company)
    then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  update public.memberships set state='active' where company_id=p_company and user_id=p_user and role='staff' and state='pending';
  if not found then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  insert into private.audit_events(actor_id,company_id,action,target_id) values(auth.uid(),p_company,'staff-approved',p_user);
exception when unique_violation then raise exception using errcode='P0001',message='Operação indisponível';
end $$;
create function private.revoke_staff(p_company uuid,p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
  if not private.active_actor() then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  perform private.lock_accounts(array[auth.uid(),p_user]);
  if not private.has_role(p_company,'manager') then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  update public.memberships set state='revoked' where company_id=p_company and user_id=p_user and role='staff' and state in ('active','pending');
  if not found then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  insert into private.audit_events(actor_id,company_id,action,target_id) values(auth.uid(),p_company,'staff-revoked',p_user);
end $$;

create function private.send_text(p_company uuid,p_conversation uuid,p_client_id text,p_body text) returns public.messages language plpgsql security definer set search_path='' as $$
declare result public.messages; existing public.messages; conversation public.conversations; author_role text; next_sequence bigint;
begin
  if not private.active_actor() then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  if p_client_id is null or p_client_id !~ '^[A-Za-z0-9_-]{1,80}$' or p_body is null or char_length(p_body) not between 1 and 2000
    or p_body !~ '[^[:space:]]' or p_body ~ '[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' then raise exception using errcode='P0001',message='Entrada inválida'; end if;
  perform private.lock_accounts(array[auth.uid()]);
  if not private.can_read_conversation(p_company,p_conversation) then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  select * into conversation from public.conversations where id=p_conversation and company_id=p_company for update;
  select m.* into existing from private.message_receipts r join public.messages m on m.id=r.message_id
    where r.sender_id=auth.uid() and r.company_id=p_company and r.conversation_id=p_conversation and r.client_message_id=p_client_id;
  if found then
    if existing.body<>p_body then raise exception using errcode='P0001',message='Conflito de envio'; end if;
    return existing;
  end if;
  if private.has_role(p_company,'staff') then
    if conversation.patient_id=auth.uid() and private.has_role(p_company,'patient') then raise exception using errcode='P0001',message='Operação indisponível'; end if;
    author_role:='staff';
  else author_role:='patient'; end if;
  update public.conversations set last_sequence=last_sequence+1 where id=p_conversation returning last_sequence into next_sequence;
  insert into public.messages(company_id,conversation_id,sender_id,sender_role,sequence,body)
    values(p_company,p_conversation,auth.uid(),author_role,next_sequence,p_body) returning * into result;
  insert into private.message_receipts(sender_id,company_id,conversation_id,client_message_id,message_id)
    values(auth.uid(),p_company,p_conversation,p_client_id,result.id);
  insert into private.audit_events(actor_id,company_id,action,target_id) values(auth.uid(),p_company,'message-accepted',result.id);
  return result;
end $$;
create function private.set_message_important(p_company uuid,p_message uuid,p_important boolean) returns public.messages language plpgsql security definer set search_path='' as $$
declare result public.messages;
begin
  if not private.active_actor() or p_important is null then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  perform private.lock_accounts(array[auth.uid()]);
  if not private.has_role(p_company,'staff') then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  select * into result from public.messages where id=p_message and company_id=p_company for update;
  if not found or not private.can_read_conversation(p_company,result.conversation_id) then raise exception using errcode='P0001',message='Operação indisponível'; end if;
  if result.important=p_important then return result; end if;
  update public.messages set important=p_important where id=p_message returning * into result;
  insert into private.audit_events(actor_id,company_id,action,target_id) values(auth.uid(),p_company,'message-important-changed',result.id);
  return result;
end $$;

-- Exposed wrappers run as the caller; privileged implementations stay in a non-exposed schema.
create function public.link_patient(p_company uuid) returns uuid language sql security invoker set search_path='' as $$ select private.link_patient(p_company) $$;
create function public.request_staff(p_company uuid) returns void language sql security invoker set search_path='' as $$ select private.request_staff(p_company) $$;
create function public.accept_staff_invite(p_invite uuid,p_token text) returns void language sql security invoker set search_path='' as $$ select private.accept_staff_invite(p_invite,p_token) $$;
create function public.approve_staff(p_company uuid,p_user uuid) returns void language sql security invoker set search_path='' as $$ select private.approve_staff(p_company,p_user) $$;
create function public.revoke_staff(p_company uuid,p_user uuid) returns void language sql security invoker set search_path='' as $$ select private.revoke_staff(p_company,p_user) $$;
create function public.send_text(p_company uuid,p_conversation uuid,p_client_id text,p_body text) returns public.messages language sql security invoker set search_path='' as $$ select private.send_text(p_company,p_conversation,p_client_id,p_body) $$;
create function public.set_message_important(p_company uuid,p_message uuid,p_important boolean) returns public.messages language sql security invoker set search_path='' as $$ select private.set_message_important(p_company,p_message,p_important) $$;
revoke all on function public.link_patient(uuid),public.request_staff(uuid),public.accept_staff_invite(uuid,text),public.approve_staff(uuid,uuid),public.revoke_staff(uuid,uuid),public.send_text(uuid,uuid,text,text),public.set_message_important(uuid,uuid,boolean) from public,anon,authenticated;
revoke all on function private.active_actor(),private.company_active(uuid),private.has_role(uuid,text),private.can_chat(uuid,uuid),private.can_read_conversation(uuid,uuid),private.lock_accounts(uuid[]),private.link_patient(uuid),private.request_staff(uuid),private.accept_staff_invite(uuid,text),private.approve_staff(uuid,uuid),private.revoke_staff(uuid,uuid),private.send_text(uuid,uuid,text,text),private.set_message_important(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function private.active_actor(),private.company_active(uuid),private.has_role(uuid,text),private.can_chat(uuid,uuid),private.can_read_conversation(uuid,uuid) to authenticated;
grant execute on function private.link_patient(uuid),private.request_staff(uuid),private.accept_staff_invite(uuid,text),private.approve_staff(uuid,uuid),private.revoke_staff(uuid,uuid),private.send_text(uuid,uuid,text,text),private.set_message_important(uuid,uuid,boolean) to authenticated;
grant execute on function public.link_patient(uuid),public.request_staff(uuid),public.accept_staff_invite(uuid,text),public.approve_staff(uuid,uuid),public.revoke_staff(uuid,uuid),public.send_text(uuid,uuid,text,text),public.set_message_important(uuid,uuid,boolean) to authenticated;
commit;
