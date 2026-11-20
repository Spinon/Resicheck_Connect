-- LOCAL CANDIDATE, not a canonical migration. Foundation remains unchanged.
-- Requires the separately reviewed Storage policy proposal and a real inspection
-- worker before any online activation. No worker role/credential is provisioned.
begin;
set local lock_timeout='3s';set local statement_timeout='15s';
create table private.attachment_catalog (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null, conversation_id uuid not null,
  sender_id uuid not null references public.profiles(id),
  session_id uuid not null, valid_until timestamptz not null,
  client_upload_id text not null check(client_upload_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  media_kind text not null check(media_kind in ('audio','image','document')),
  expected_sha256 bytea not null check(octet_length(expected_sha256)=32),
  expected_bytes integer not null check(expected_bytes between 1 and 10485760),
  object_name text not null unique default ('q/'||gen_random_uuid()::text),
  state text not null default 'reserved' check(state in ('reserved','uploaded','ready','rejected')),
  observed_sha256 bytea check(octet_length(observed_sha256)=32), observed_bytes integer,
  detected_type text, duration_ms integer, inspection_version text,
  -- No publication entrypoint in this candidate: attachment-ready != message.
  message_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(company_id,conversation_id) references public.conversations(company_id,id),
  foreign key(company_id,conversation_id,message_id) references public.messages(company_id,conversation_id,id),
  unique(sender_id,company_id,conversation_id,client_upload_id),
  check(object_name ~ '^q/[0-9a-f-]{36}$'),
  check(message_id is null or state='ready'),
  check(state<>'ready' or (observed_sha256 is not null and observed_bytes is not null and observed_sha256=expected_sha256 and observed_bytes=expected_bytes
    and detected_type is not null and inspection_version is not null))
);
create index attachment_context on private.attachment_catalog(company_id,conversation_id,id);
create index attachment_message_reference on private.attachment_catalog(company_id,conversation_id,message_id) where message_id is not null;
create index attachment_pending on private.attachment_catalog(sender_id,state) where state in ('reserved','uploaded');
create table private.attachment_events (
  id bigint generated always as identity primary key,
  attachment_id uuid not null references private.attachment_catalog(id),
  event text not null check(event in ('reserved','uploaded','ready','rejected','authorization-renewed','cancelled')),
  occurred_at timestamptz not null default clock_timestamp()
);
create index attachment_events_target on private.attachment_events(attachment_id,id);
alter table private.attachment_catalog enable row level security;
alter table private.attachment_events enable row level security;
revoke all on private.attachment_catalog,private.attachment_events from public,anon,authenticated;
revoke all on sequence private.attachment_events_id_seq from public,anon,authenticated;

-- Immutable catalog authority is read by trusted server workers, not JWT metadata.
-- Locks order: account -> company -> original session -> memberships -> conversation
-- -> catalog. These locks serialize cooperating revocation and worker transitions.
create function private.attachment_author_lock(p_sender uuid,p_company uuid,p_conversation uuid,p_session uuid,p_until timestamptz)
returns boolean language plpgsql volatile security definer set search_path='' as $$
declare account_state text; company_state text; session_end timestamptz; patient uuid;
begin
  select state into account_state from private.accounts where user_id=p_sender for update;
  if account_state is distinct from 'active' then return false;end if;
  select state into company_state from private.company_controls where company_id=p_company for share;
  if company_state is distinct from 'active' then return false;end if;
  select not_after into session_end from auth.sessions where id=p_session and user_id=p_sender for share;
  if not found or p_until is null or p_until<=clock_timestamp() or (session_end is not null and session_end<=clock_timestamp()) then return false;end if;
  perform 1 from public.memberships where company_id=p_company and user_id=p_sender order by role for share;
  select patient_id into patient from public.conversations where company_id=p_company and id=p_conversation for share;
  if not found then return false;end if;
  return exists(select 1 from public.memberships where company_id=p_company and user_id=p_sender and state='active'
    and (role='staff' or (role='patient' and patient=p_sender)));
end $$;

create function private.attachment_reserve(p_company uuid,p_conversation uuid,p_client text,p_kind text,p_sha bytea,p_bytes integer)
returns jsonb language plpgsql volatile security definer set search_path='' as $$
declare row private.attachment_catalog; session uuid; until_time timestamptz; maximum integer;
begin
  if not private.active_actor() then raise exception 'Attachment unavailable';end if;
  maximum:=case p_kind when 'audio' then 1048576 when 'image' then 4194304 when 'document' then 10485760 else 0 end;
  if p_client is null or p_client !~ '^[A-Za-z0-9_-]{1,80}$' or p_sha is null or octet_length(p_sha)<>32
    or p_bytes is null or p_bytes<1 or p_bytes>maximum then raise exception 'Attachment unavailable';end if;
  session:=(auth.jwt()->>'session_id')::uuid;until_time:=to_timestamp((auth.jwt()->>'exp')::double precision);
  if not private.attachment_author_lock(auth.uid(),p_company,p_conversation,session,until_time) then raise exception 'Attachment unavailable';end if;
  select * into row from private.attachment_catalog where sender_id=auth.uid() and company_id=p_company
    and conversation_id=p_conversation and client_upload_id=p_client for update;
  if found then
    if row.expected_sha256<>p_sha or row.expected_bytes<>p_bytes or row.media_kind<>p_kind then raise exception 'Attachment unavailable';end if;
    if row.state in ('reserved','uploaded') then
      -- Refresh may extend the ORIGINAL live Auth session, never transfer a
      -- pending object to another session or change its byte/context intent.
      if row.session_id<>session then raise exception 'Attachment unavailable';end if;
      if until_time>row.valid_until then
        update private.attachment_catalog set valid_until=until_time where id=row.id returning * into row;
        insert into private.attachment_events(attachment_id,event) values(row.id,'authorization-renewed');
      end if;
    end if;
    return jsonb_build_object('id',row.id,'state',row.state);
  end if;
  -- Conservative LOCAL budgets, not an approved retention/product policy.
  if (select count(*) from private.attachment_catalog where sender_id=auth.uid())>=100
    or (select count(*) from private.attachment_catalog where sender_id=auth.uid() and state in ('reserved','uploaded'))>=16
    then raise exception 'Attachment unavailable';end if;
  insert into private.attachment_catalog(company_id,conversation_id,sender_id,session_id,valid_until,client_upload_id,media_kind,expected_sha256,expected_bytes)
    values(p_company,p_conversation,auth.uid(),session,until_time,p_client,p_kind,p_sha,p_bytes) returning * into row;
  insert into private.attachment_events(attachment_id,event) values(row.id,'reserved');
  return jsonb_build_object('id',row.id,'state',row.state);
exception when others then raise exception using errcode='P0001',message='Attachment unavailable';
end $$;

-- A new live session may cancel its own pending intent, but cannot upload/read
-- its old blob. Keep the tombstone/retry key; do not delete objects implicitly.
create function private.attachment_cancel(p_company uuid,p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path='' as $$
declare row private.attachment_catalog; session uuid; until_time timestamptz;
begin
  if not private.active_actor() then raise exception 'Attachment unavailable';end if;
  select * into row from private.attachment_catalog where id=p_id and company_id=p_company and sender_id=auth.uid();
  if not found then raise exception 'Attachment unavailable';end if;
  session:=(auth.jwt()->>'session_id')::uuid;until_time:=to_timestamp((auth.jwt()->>'exp')::double precision);
  if not private.attachment_author_lock(auth.uid(),row.company_id,row.conversation_id,session,until_time) then raise exception 'Attachment unavailable';end if;
  select * into row from private.attachment_catalog where id=p_id for update;
  if row.state='rejected' then return jsonb_build_object('id',row.id,'state',row.state);end if;
  if row.state not in ('reserved','uploaded') or row.message_id is not null then raise exception 'Attachment unavailable';end if;
  update private.attachment_catalog set state='rejected' where id=p_id;
  insert into private.attachment_events(attachment_id,event) values(p_id,'cancelled');
  return jsonb_build_object('id',row.id,'state','rejected');
exception when others then raise exception using errcode='P0001',message='Attachment unavailable';
end $$;

-- Trusted ingress ONLY: bytea is bounded synthetic input in the local harness.
-- Production must stream/read immutable actual object bytes with hard I/O limits;
-- client metadata and storage.objects.metadata never certify content.
create function private.attachment_record_blob(p_id uuid,p_content bytea) returns text
language plpgsql volatile security definer set search_path='' as $$
declare row private.attachment_catalog; actual bytea; size integer;
begin
  select * into row from private.attachment_catalog where id=p_id;
  if not found then raise exception 'Attachment unavailable';end if;
  if not private.attachment_author_lock(row.sender_id,row.company_id,row.conversation_id,row.session_id,row.valid_until) then raise exception 'Attachment unavailable';end if;
  select * into row from private.attachment_catalog where id=p_id for update;
  if not exists(select 1 from storage.objects where bucket_id='connect-private-attachments' and name=row.object_name) then raise exception 'Attachment unavailable';end if;
  if p_content is null or octet_length(p_content)>10485760 then raise exception 'Attachment unavailable';end if;
  actual:=sha256(p_content);size:=octet_length(p_content);
  if row.state<>'reserved' then
    if row.observed_sha256=actual and row.observed_bytes=size then return row.state;end if;
    raise exception 'Attachment unavailable';
  end if;
  update private.attachment_catalog set observed_sha256=actual,observed_bytes=size,
    state=case when actual=row.expected_sha256 and size=row.expected_bytes then 'uploaded' else 'rejected' end
    where id=p_id returning * into row;
  insert into private.attachment_events(attachment_id,event) values(p_id,row.state);
  return row.state;
exception when others then raise exception using errcode='P0001',message='Attachment unavailable';
end $$;

-- Trusted bounded inspection worker ONLY, no execute grant to client roles.
-- Result/digest must describe the same immutable bytes recorded by ingress.
create function private.attachment_inspect(p_id uuid,p_sha bytea,p_pass boolean,p_type text,p_duration integer,p_version text)
returns text language plpgsql volatile security definer set search_path='' as $$
declare row private.attachment_catalog; accepted boolean;
begin
  select * into row from private.attachment_catalog where id=p_id;
  if not found then raise exception 'Attachment unavailable';end if;
  if not private.attachment_author_lock(row.sender_id,row.company_id,row.conversation_id,row.session_id,row.valid_until) then raise exception 'Attachment unavailable';end if;
  select * into row from private.attachment_catalog where id=p_id for update;
  if row.state='ready' and p_pass is true and p_sha=row.observed_sha256 and p_type=row.detected_type
    and p_duration is not distinct from row.duration_ms and p_version=row.inspection_version then return row.state;end if;
  if row.state not in ('uploaded') then raise exception 'Attachment unavailable';end if;
  accepted:=coalesce(p_pass and p_sha=row.observed_sha256 and p_sha=row.expected_sha256 and p_version ~ '^[A-Za-z0-9_.-]{1,64}$'
    and case row.media_kind when 'audio' then p_type='audio/mp4' and p_duration between 500 and 60500
      when 'image' then p_type in ('image/jpeg','image/png') and p_duration is null
      when 'document' then p_type='application/pdf' and p_duration is null else false end,false);
  update private.attachment_catalog set state=case when accepted then 'ready' else 'rejected' end,
    detected_type=case when accepted then p_type end,duration_ms=case when accepted then p_duration end,
    inspection_version=case when accepted then p_version end where id=p_id returning * into row;
  insert into private.attachment_events(attachment_id,event) values(p_id,row.state);
  return row.state;
exception when others then raise exception using errcode='P0001',message='Attachment unavailable';
end $$;

create function private.attachment_status(p_company uuid,p_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',a.id,'state',a.state) from private.attachment_catalog a
 where a.company_id=p_company and a.id=p_id and a.sender_id=auth.uid()
 and private.can_read_conversation(a.company_id,a.conversation_id)
$$;
create function public.reserve_attachment(p_company uuid,p_conversation uuid,p_client text,p_kind text,p_sha bytea,p_bytes integer)
returns jsonb language sql security invoker set search_path='' as $$select private.attachment_reserve(p_company,p_conversation,p_client,p_kind,p_sha,p_bytes)$$;
create function public.my_attachment_status(p_company uuid,p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.attachment_status(p_company,p_id)$$;
create function public.cancel_attachment(p_company uuid,p_id uuid) returns jsonb
language sql security invoker set search_path='' as $$select private.attachment_cancel(p_company,p_id)$$;
revoke all on function private.attachment_author_lock(uuid,uuid,uuid,uuid,timestamptz),private.attachment_reserve(uuid,uuid,text,text,bytea,integer),private.attachment_record_blob(uuid,bytea),private.attachment_inspect(uuid,bytea,boolean,text,integer,text),private.attachment_status(uuid,uuid),public.reserve_attachment(uuid,uuid,text,text,bytea,integer),public.my_attachment_status(uuid,uuid) from public,anon,authenticated;
grant execute on function private.attachment_reserve(uuid,uuid,text,text,bytea,integer),private.attachment_status(uuid,uuid),public.reserve_attachment(uuid,uuid,text,text,bytea,integer),public.my_attachment_status(uuid,uuid) to authenticated;
revoke all on function private.attachment_cancel(uuid,uuid),public.cancel_attachment(uuid,uuid) from public,anon,authenticated;
grant execute on function private.attachment_cancel(uuid,uuid),public.cancel_attachment(uuid,uuid) to authenticated;
commit;
