-- LOCAL CANDIDATE ONLY. Requires closed audio catalog/message candidates and a Storage fixture.
-- Not a managed migration; no bucket, Auth identity, secret, network service or DB role is created.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
create table private.audio_inspectors (
 user_id uuid primary key references auth.users(id),
 company_id uuid not null references public.companies(id),
 enabled boolean not null default false,
 valid_until timestamptz not null
);
create table private.audio_inspection_jobs (
 attachment_id uuid primary key references private.attachment_catalog(id),
 lease_id uuid not null unique,
 inspector_id uuid not null references private.audio_inspectors(user_id),
 session_id uuid not null,
 valid_until timestamptz not null,
 attempts integer not null check(attempts between 1 and 3),
 result jsonb
);
alter table private.audio_inspectors enable row level security;
alter table private.audio_inspection_jobs enable row level security;
revoke all on private.audio_inspectors,private.audio_inspection_jobs from public,anon,authenticated;
create index audio_queue_pending on private.attachment_catalog(created_at,id) where media_kind='audio' and state='uploaded';

-- An inspector may have a suspended profile, but cannot become an active app actor
-- or acquire any company membership, even while its allowlist entry is disabled.
create function private.audio_inspector_guard() returns trigger
language plpgsql security definer set search_path='' as $$begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text,57101));
 if tg_table_name='audio_inspectors' then
  if exists(select 1 from private.accounts where user_id=new.user_id and state='active')
    or exists(select 1 from public.memberships where user_id=new.user_id) then raise exception 'Audio identity unavailable';end if;
 elsif tg_table_name='accounts' then
  if new.state='active' and exists(select 1 from private.audio_inspectors where user_id=new.user_id)then raise exception 'Audio identity unavailable';end if;
 elsif exists(select 1 from private.audio_inspectors where user_id=new.user_id)then raise exception 'Audio identity unavailable';
 end if;
 return new;
end$$;
create trigger audio_inspector_identity before insert or update on private.audio_inspectors for each row execute function private.audio_inspector_guard();
create trigger audio_inspector_account before insert or update on private.accounts for each row execute function private.audio_inspector_guard();
create trigger audio_inspector_membership before insert or update on public.memberships for each row execute function private.audio_inspector_guard();

create function private.audio_inspector_active()returns boolean
language plpgsql volatile security definer set search_path='' as $$begin
 return (auth.jwt()->>'role')='authenticated'
  and (auth.jwt()->>'exp')::numeric>extract(epoch from clock_timestamp())
  and exists(select 1 from private.audio_inspectors i join auth.sessions s on s.user_id=i.user_id
    where i.user_id=auth.uid() and i.enabled and i.valid_until>clock_timestamp()and exists(select 1 from private.company_controls c where c.company_id=i.company_id and c.state='active')
    and s.id=(auth.jwt()->>'session_id')::uuid and(s.not_after is null or s.not_after>clock_timestamp())
    and not exists(select 1 from private.accounts a where a.user_id=i.user_id and a.state='active')
    and not exists(select 1 from public.memberships m where m.user_id=i.user_id));
 exception when others then return false;
end$$;

create function private.audio_reserve_scoped(p_company uuid,p_conversation uuid,p_client text,p_digest text,p_bytes integer)returns jsonb
language plpgsql security definer set search_path='' as $$
declare reserved jsonb;a private.attachment_catalog;
begin
 if exists(select 1 from private.audio_inspectors where user_id=auth.uid())then raise exception 'Audio unavailable';end if;
 -- Pilot-wide hard cap, including rejected/expired rows until a reviewed retention operation.
 perform pg_catalog.pg_advisory_xact_lock(2147483000,1);
 if not exists(select 1 from private.attachment_catalog where company_id=p_company and conversation_id=p_conversation and sender_id=auth.uid()and client_upload_id=p_client)
   and(select count(*)from private.attachment_catalog)>=256 then raise exception 'Audio unavailable';end if;
 reserved:=private.audio_catalog_reserve(p_company,p_conversation,p_client,p_digest,p_bytes);
 select * into strict a from private.attachment_catalog where id=(reserved->'row'->>'id')::uuid;
 return reserved||jsonb_build_object('upload',case when a.state='reserved'then jsonb_build_object('bucket','connect-private-attachments','objectKey',a.object_name,'validUntil',least(a.valid_until,a.created_at+interval'5 minutes'))else null end);
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;

create function private.audio_confirm_scoped(p_company uuid,p_conversation uuid,p_attachment uuid)returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.attachment_catalog;
begin
 perform private.lock_accounts(array[auth.uid()]);
 if not private.active_actor()or not private.can_read_conversation(p_company,p_conversation)then raise exception 'Audio unavailable';end if;
 select * into a from private.attachment_catalog where id=p_attachment and company_id=p_company and conversation_id=p_conversation and sender_id=auth.uid();
 if not found or a.media_kind<>'audio'or a.session_id::text is distinct from auth.jwt()->>'session_id'
  or not private.attachment_author_lock(a.sender_id,a.company_id,a.conversation_id,a.session_id,a.valid_until)then raise exception 'Audio unavailable';end if;
 select * into strict a from private.attachment_catalog where id=a.id for update;
 if a.state='reserved'then
  if not exists(select 1 from storage.objects where bucket_id='connect-private-attachments'and name=a.object_name and owner_id=a.sender_id::text)then raise exception 'Audio unavailable';end if;
  -- Existence queues work only. Metadata, client or upload ACK never certifies bytes.
  update private.attachment_catalog set state='uploaded'where id=a.id;
  insert into private.attachment_events(attachment_id,event)values(a.id,'uploaded');
 end if;
 return private.audio_catalog_find_own(p_company,p_conversation,a.client_upload_id);
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;

create function private.audio_status_scoped(p_company uuid,p_conversation uuid,p_client text)returns jsonb
language plpgsql security definer set search_path=''as $$
declare own jsonb;a private.attachment_catalog;j private.audio_inspection_jobs;phase text;
begin
 own:=private.audio_catalog_find_own(p_company,p_conversation,p_client);if own is null then return null;end if;
 select * into strict a from private.attachment_catalog where id=(own->>'id')::uuid;
 select * into j from private.audio_inspection_jobs where attachment_id=a.id;
 phase:=case when a.state in('ready','rejected')then a.state
  when a.session_id::text is distinct from auth.jwt()->>'session_id'or a.valid_until<=clock_timestamp()then 'expired'
  when a.state='reserved'then case when a.created_at+interval'5 minutes'<=clock_timestamp()then 'expired'else 'awaiting_upload'end
  when j.result is null and j.attempts>=3 and j.valid_until<=clock_timestamp()then 'inspection_failed'
  when j.result is null and j.valid_until>clock_timestamp()then 'inspecting'else 'queued'end;
 return own||jsonb_build_object('inspectionPhase',phase);
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;

create function private.audio_claim_scoped()returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.attachment_catalog;j private.audio_inspection_jobs;claimed boolean;
begin
 perform 1 from private.audio_inspectors where user_id=auth.uid()for update;
 if not private.audio_inspector_active()then raise exception 'Audio unavailable';end if;
 -- Lock the machine identity before assigning work: concurrent calls cannot issue
 -- two live leases to the same identity. A lost claim reply reuses the exact lease.
 select * into j from private.audio_inspection_jobs where inspector_id=auth.uid()and valid_until>clock_timestamp()and result is null;
 if found then
  if j.session_id::text is distinct from auth.jwt()->>'session_id'then raise exception 'Audio unavailable';end if;
  select * into strict a from private.attachment_catalog where id=j.attachment_id;
  if a.company_id is distinct from(select company_id from private.audio_inspectors where user_id=auth.uid())or a.state<>'uploaded'or not private.attachment_author_lock(a.sender_id,a.company_id,a.conversation_id,a.session_id,a.valid_until)then return null;end if;
 else
  claimed:=false;
  for a in select c.* from private.attachment_catalog c left join private.audio_inspection_jobs x on x.attachment_id=c.id
    where c.media_kind='audio'and c.state='uploaded'and c.valid_until>clock_timestamp()and c.company_id=(select company_id from private.audio_inspectors where user_id=auth.uid())
      and(x.attachment_id is null or(x.valid_until<=clock_timestamp()and x.attempts<3 and x.result is null))
    order by c.created_at,c.id limit 16
  loop
   if not private.attachment_author_lock(a.sender_id,a.company_id,a.conversation_id,a.session_id,a.valid_until)then continue;end if;
   select * into a from private.attachment_catalog where id=a.id and state='uploaded'for update skip locked;
   if not found then continue;end if;
   select * into j from private.audio_inspection_jobs where attachment_id=a.id for update;
   if found and(j.valid_until>clock_timestamp()or j.attempts>=3 or j.result is not null)then continue;end if;
   insert into private.audio_inspection_jobs(attachment_id,lease_id,inspector_id,session_id,valid_until,attempts)
     values(a.id,gen_random_uuid(),auth.uid(),(auth.jwt()->>'session_id')::uuid,least(clock_timestamp()+interval'30 seconds',to_timestamp((auth.jwt()->>'exp')::double precision),a.valid_until),1)
     on conflict(attachment_id)do update set lease_id=excluded.lease_id,inspector_id=excluded.inspector_id,session_id=excluded.session_id,valid_until=excluded.valid_until,attempts=private.audio_inspection_jobs.attempts+1,result=null
     returning * into j;
   claimed:=true;exit;
  end loop;
  if not claimed then return null;end if;
 end if;
 return jsonb_build_object('leaseId',j.lease_id,'validUntil',j.valid_until,'attachmentId',a.id,'companyId',a.company_id,'conversationId',a.conversation_id,'objectKey',a.object_name,'sha256',encode(a.expected_sha256,'hex'),'byteLength',a.expected_bytes);
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;

create function private.audio_finish_scoped(p_attachment uuid,p_lease uuid,p_digest text,p_bytes integer,p_pass boolean,p_duration integer,p_version text)returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.attachment_catalog;j private.audio_inspection_jobs;proof jsonb;passed boolean;
begin
 perform 1 from private.audio_inspectors where user_id=auth.uid()for update;
 if not private.audio_inspector_active()or p_lease is null or p_digest is null or p_digest!~'^[a-f0-9]{64}$'
  or p_bytes is null or p_bytes not between 1 and 1048576 or p_pass is null or p_version is null or p_version!~'^[A-Za-z0-9_.-]{1,64}$'then raise exception 'Audio unavailable';end if;
 select * into a from private.attachment_catalog where id=p_attachment and media_kind='audio';
 if not found or a.company_id is distinct from(select company_id from private.audio_inspectors where user_id=auth.uid())or not private.attachment_author_lock(a.sender_id,a.company_id,a.conversation_id,a.session_id,a.valid_until)then raise exception 'Audio unavailable';end if;
 select * into strict a from private.attachment_catalog where id=p_attachment for update;
 select * into j from private.audio_inspection_jobs where attachment_id=p_attachment for update;
 if not found or j.lease_id<>p_lease or j.inspector_id<>auth.uid()or j.session_id::text is distinct from auth.jwt()->>'session_id'or j.valid_until<=clock_timestamp()then raise exception 'Audio unavailable';end if;
 proof:=jsonb_build_object('sha256',p_digest,'byteLength',p_bytes,'pass',p_pass,'durationMs',p_duration,'version',p_version);
 if j.result is not null then
  if j.result<>proof then raise exception 'Audio unavailable';end if;
  return jsonb_build_object('state',a.state);
 end if;
 if a.state<>'uploaded'or not exists(select 1 from storage.objects where bucket_id='connect-private-attachments'and name=a.object_name and owner_id=a.sender_id::text)then raise exception 'Audio unavailable';end if;
 passed:=coalesce(p_pass and decode(p_digest,'hex')=a.expected_sha256 and p_bytes=a.expected_bytes and p_duration between 500 and 60500,false);
 update private.attachment_catalog set observed_sha256=decode(p_digest,'hex'),observed_bytes=p_bytes,
  state=case when passed then 'ready'else 'rejected'end,detected_type=case when passed then 'audio/mp4'end,
  duration_ms=case when passed then p_duration end,inspection_version=p_version where id=a.id;
 update private.audio_inspection_jobs set result=proof where attachment_id=a.id;
 insert into private.attachment_events(attachment_id,event)values(a.id,case when passed then 'ready'else 'rejected'end);
 return jsonb_build_object('state',case when passed then 'ready'else 'rejected'end);
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;

create function private.audio_storage_insert(p_bucket text,p_name text,p_owner text)returns boolean
language plpgsql security definer set search_path=''as $$begin
 return p_bucket='connect-private-attachments'and p_owner=auth.uid()::text and private.active_actor()
  and not exists(select 1 from private.audio_inspectors where user_id=auth.uid())
  and exists(select 1 from private.attachment_catalog a where a.object_name=p_name and a.media_kind='audio'and a.state='reserved'
   and a.sender_id=auth.uid()and a.session_id::text=auth.jwt()->>'session_id'and least(a.valid_until,a.created_at+interval'5 minutes')>clock_timestamp()
   and private.can_read_conversation(a.company_id,a.conversation_id));
 exception when others then return false;end$$;
create function private.audio_storage_ready(p_bucket text,p_name text)returns boolean
language plpgsql security definer set search_path=''as $$begin
 return p_bucket='connect-private-attachments'and storage.allow_only_operation('object.get_authenticated')
  and not exists(select 1 from private.audio_inspectors where user_id=auth.uid())
  and exists(select 1 from private.attachment_catalog a where a.object_name=p_name and a.media_kind='audio'and a.state='ready'and a.message_id is not null
   and private.can_read_conversation(a.company_id,a.conversation_id));
 exception when others then return false;end$$;
create function private.audio_storage_leased(p_bucket text,p_name text)returns boolean
language plpgsql security definer set search_path=''as $$begin
 return p_bucket='connect-private-attachments'and storage.allow_only_operation('object.get_authenticated')and private.audio_inspector_active()
  and exists(select 1 from private.audio_inspection_jobs j join private.attachment_catalog a on a.id=j.attachment_id
   where a.object_name=p_name and a.state='uploaded'and a.media_kind='audio'and a.valid_until>clock_timestamp()and a.company_id=(select company_id from private.audio_inspectors where user_id=auth.uid())
   and j.inspector_id=auth.uid()and j.session_id::text=auth.jwt()->>'session_id'and j.valid_until>clock_timestamp()and j.result is null
   and exists(select 1 from auth.sessions s where s.id=a.session_id and s.user_id=a.sender_id and(s.not_after is null or s.not_after>clock_timestamp()))
   and exists(select 1 from private.accounts x where x.user_id=a.sender_id and x.state='active')
   and exists(select 1 from private.company_controls c where c.company_id=a.company_id and c.state='active')
   and exists(select 1 from public.memberships m join public.conversations c on c.id=a.conversation_id and c.company_id=a.company_id
      where m.company_id=a.company_id and m.user_id=a.sender_id and m.state='active'and(m.role='staff'or(m.role='patient'and c.patient_id=a.sender_id))));
 exception when others then return false;end$$;

create function private.audio_read_scoped(p_company uuid,p_conversation uuid,p_attachment uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare descriptor jsonb;
begin
 descriptor:=private.audio_catalog_resolve_read(p_company,p_conversation,p_attachment);
 if not exists(select 1 from private.attachment_catalog a join public.messages m on m.company_id=a.company_id and m.conversation_id=a.conversation_id and m.id=a.message_id and m.sender_id=a.sender_id where a.id=p_attachment and a.company_id=p_company and a.conversation_id=p_conversation and a.state='ready'and m.kind='audio')then raise exception 'Audio unavailable';end if;
 return descriptor;
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;
create function public.resolve_connect_audio_storage_v1(p_company uuid,p_conversation uuid,p_attachment uuid)returns jsonb language sql security invoker set search_path=''as $$select private.audio_read_scoped(p_company,p_conversation,p_attachment)$$;
revoke all on function private.audio_read_scoped(uuid,uuid,uuid),public.resolve_connect_audio_storage_v1(uuid,uuid,uuid)from public,anon,authenticated,service_role;

-- Public wrappers are INVOKER; privileged code and tables remain private.
create function public.reserve_connect_audio_scoped_v1(p_company uuid,p_conversation uuid,p_client text,p_digest text,p_bytes integer)returns jsonb language sql security invoker set search_path=''as $$select private.audio_reserve_scoped(p_company,p_conversation,p_client,p_digest,p_bytes)$$;
create function public.confirm_connect_audio_scoped_v1(p_company uuid,p_conversation uuid,p_attachment uuid)returns jsonb language sql security invoker set search_path=''as $$select private.audio_confirm_scoped(p_company,p_conversation,p_attachment)$$;
create function public.status_connect_audio_scoped_v1(p_company uuid,p_conversation uuid,p_client text)returns jsonb language sql security invoker set search_path=''as $$select private.audio_status_scoped(p_company,p_conversation,p_client)$$;
create function public.claim_connect_audio_inspection_v1()returns jsonb language sql security invoker set search_path=''as $$select private.audio_claim_scoped()$$;
create function public.finish_connect_audio_inspection_v1(p_attachment uuid,p_lease uuid,p_digest text,p_bytes integer,p_pass boolean,p_duration integer,p_version text)returns jsonb language sql security invoker set search_path=''as $$select private.audio_finish_scoped(p_attachment,p_lease,p_digest,p_bytes,p_pass,p_duration,p_version)$$;

-- Fail closed if an old prototype endpoint was loaded with automatic grants.
revoke all on function private.attachment_reserve(uuid,uuid,text,text,bytea,integer),private.attachment_status(uuid,uuid),private.attachment_cancel(uuid,uuid),public.reserve_attachment(uuid,uuid,text,text,bytea,integer),public.my_attachment_status(uuid,uuid),public.cancel_attachment(uuid,uuid)from authenticated,anon,public;
-- A build script enumerates/revokes every function in THIS file, then emits a separate
-- local activation fixture granting only the intended RPCs/predicates. No implicit PUBLIC execute.
revoke all on function private.audio_inspector_guard() from public,anon,authenticated,service_role;
revoke all on function private.audio_inspector_active() from public,anon,authenticated,service_role;
revoke all on function private.audio_reserve_scoped(uuid,uuid,text,text,integer) from public,anon,authenticated,service_role;
revoke all on function private.audio_confirm_scoped(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.audio_status_scoped(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.audio_claim_scoped() from public,anon,authenticated,service_role;
revoke all on function private.audio_finish_scoped(uuid,uuid,text,integer,boolean,integer,text) from public,anon,authenticated,service_role;
revoke all on function private.audio_storage_insert(text,text,text) from public,anon,authenticated,service_role;
revoke all on function private.audio_storage_ready(text,text) from public,anon,authenticated,service_role;
revoke all on function private.audio_storage_leased(text,text) from public,anon,authenticated,service_role;
revoke all on function public.reserve_connect_audio_scoped_v1(uuid,uuid,text,text,integer) from public,anon,authenticated,service_role;
revoke all on function public.confirm_connect_audio_scoped_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.status_connect_audio_scoped_v1(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.claim_connect_audio_inspection_v1() from public,anon,authenticated,service_role;
revoke all on function public.finish_connect_audio_inspection_v1(uuid,uuid,text,integer,boolean,integer,text) from public,anon,authenticated,service_role;
commit;
