-- LOCAL CLOSED-STRUCTURE REHEARSAL ONLY. NOT AUTHORIZED TO APPLY.
begin;
set local lock_timeout='3s';set local statement_timeout='25s';set local search_path=pg_catalog;
select pg_advisory_xact_lock(900001,560);
do $$begin
 if current_user<>'postgres' or session_user<>'postgres' or has_schema_privilege('postgres','private','CREATE')or to_regclass('private.attachment_catalog')is not null or ((select count(*)from supabase_migrations.schema_migrations)<>8 or exists(select 1 from supabase_migrations.schema_migrations where name is null or (version,name)not in(('20261106200713','connect_foundation'),('20261109001359','connect_pending_registration_homolog'),('20261109010823','connect_membership_read_homolog'),('20261110124705','connect_messenger_inbox_recent_search_unread_maintenance'),('20261110163040','connect_seen_messages_exact_read_maintenance'),('20261110174417','connect_own_send_receipt_lookup_maintenance'),('20261110190849','connect_company_registry_structure_maintenance'),('20261110205536','connect_message_delivery_visual_receipts_maintenance')))) then raise exception 'Audio structure initial state refused';end if;
 if exists(select 1 from pg_auth_members where roleid='connect_hmac_registration'::regrole and(set_option or inherit_option))then raise exception 'Audio structure role boundary refused';end if;
end$$;
create temporary table audio_before on commit drop as select
 (select jsonb_agg(to_jsonb(n)order by oid)from pg_namespace n where nspname in('private','public','storage'))schemas,
 (select jsonb_agg(to_jsonb(m)order by oid)from pg_auth_members m where roleid='connect_hmac_registration'::regrole)membership,
 (select jsonb_agg(to_jsonb(p)order by oid)from pg_policy p)policies,
 (select jsonb_agg(to_jsonb(a)order by oid)from pg_default_acl a)defaults;
create temporary table audio_receipts_before on commit drop as select jsonb_build_object('functions',(select jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl,pg_get_functiondef(p.oid))order by p.oid)from pg_proc p where p.pronamespace in('private'::regnamespace,'public'::regnamespace)and p.proname in('connect_mark_own_messages_received','mark_connect_messages_received_v1','connect_mark_own_messages_visualized','mark_connect_messages_visualized_v1','connect_lookup_own_message_status','lookup_connect_own_message_status_v1')),'tables',(select jsonb_agg(jsonb_build_array(c.oid,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity)order by c.oid)from pg_class c where c.oid in('private.message_delivery_receipts'::regclass,'private.message_visual_receipts'::regclass)),'constraints',(select jsonb_agg(jsonb_build_array(oid,pg_get_constraintdef(oid))order by oid)from pg_constraint where conrelid in('private.message_delivery_receipts'::regclass,'private.message_visual_receipts'::regclass)),'columns',(select jsonb_agg(jsonb_build_array(attrelid,attnum,attname,atttypid,attnotnull)order by attrelid,attnum)from pg_attribute where attrelid in('private.message_delivery_receipts'::regclass,'private.message_visual_receipts'::regclass)and attnum>0 and not attisdropped));
grant connect_hmac_registration to postgres with inherit false,set true;
set local role connect_hmac_registration;
grant create on schema private to postgres;
set local role postgres;
-- SOURCE supabase/candidates/attachment-catalog/catalog.CANDIDATE.sql SHA256 9492c4b4f9f8a941c0369eeb81ddb08c03aca90c82237b78746b357b2747371e
-- LOCAL CANDIDATE, not a canonical migration. Foundation remains unchanged.
-- Requires the separately reviewed Storage policy proposal and a real inspection
-- worker before any online activation. No worker role/credential is provisioned.

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

-- SOURCE supabase/candidates/audio-catalog-repository/repository.CANDIDATE.sql SHA256 f9f9794838959372ee7aa5062cb7d4d5312675f58c7f39e8eacf04e973cce046
-- LOCAL EXTENSION of the historical attachment catalog. No runtime grants or deployment.

create function private.audio_catalog_reserve(p_company uuid,p_conversation uuid,p_client text,p_digest text,p_size integer)returns jsonb
language plpgsql security definer set search_path=''as $$
declare previous uuid;reserved jsonb;a private.attachment_catalog;
begin
 if not private.active_actor()or p_digest is null or p_digest!~'^[a-f0-9]{64}$'then raise exception 'Audio unavailable';end if;
 perform private.lock_accounts(array[auth.uid()]);
 select id into previous from private.attachment_catalog where company_id=p_company and conversation_id=p_conversation and sender_id=auth.uid()and client_upload_id=p_client;
 reserved:=private.attachment_reserve(p_company,p_conversation,p_client,'audio',decode(p_digest,'hex'),p_size);
 select * into strict a from private.attachment_catalog where id=(reserved->>'id')::uuid and sender_id=auth.uid()and company_id=p_company and conversation_id=p_conversation;
 return jsonb_build_object('created',previous is null,'row',jsonb_build_object('id',a.id,'companyId',a.company_id,'conversationId',a.conversation_id,'userId',a.sender_id,'clientUploadId',a.client_upload_id,'sha256',encode(a.expected_sha256,'hex'),'byteLength',a.expected_bytes,'state',case when a.state in('reserved','uploaded')then 'quarantined'else a.state end));
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;
create function private.audio_catalog_find_own(p_company uuid,p_conversation uuid,p_client text)returns jsonb
language plpgsql security definer set search_path=''as $$
declare result jsonb;
begin
 perform private.lock_accounts(array[auth.uid()]);
 if not private.active_actor()or not private.can_read_conversation(p_company,p_conversation)or p_client is null or p_client!~'^[A-Za-z0-9_-]{1,80}$'then raise exception 'Audio unavailable';end if;
 select jsonb_build_object('id',a.id,'companyId',a.company_id,'conversationId',a.conversation_id,'userId',a.sender_id,'clientUploadId',a.client_upload_id,'sha256',encode(a.expected_sha256,'hex'),'byteLength',a.expected_bytes,'state',case when a.state in('reserved','uploaded')then 'quarantined'else a.state end)into result from private.attachment_catalog a where a.company_id=p_company and a.conversation_id=p_conversation and a.sender_id=auth.uid()and a.client_upload_id=p_client and a.media_kind='audio';
 return result;
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;
create function private.audio_catalog_resolve_read(p_company uuid,p_conversation uuid,p_attachment uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare a private.attachment_catalog;
begin
 perform private.lock_accounts(array[auth.uid()]);
 if not private.active_actor()or not private.can_read_conversation(p_company,p_conversation)then raise exception 'Audio unavailable';end if;
 select * into a from private.attachment_catalog where id=p_attachment and company_id=p_company and conversation_id=p_conversation and media_kind='audio'and state='ready'and detected_type='audio/mp4'and expected_bytes<=1048576 and observed_bytes=expected_bytes and observed_sha256=expected_sha256
 and(sender_id=auth.uid()or exists(select 1 from public.messages m where m.company_id=p_company and m.conversation_id=p_conversation and m.id=attachment_catalog.message_id and m.sender_id=attachment_catalog.sender_id and m.kind='audio'));
 if not found then raise exception 'Audio unavailable';end if;
 -- Internal descriptor only; must never be returned as the client receipt or a public URL.
 return jsonb_build_object('attachmentId',a.id,'companyId',a.company_id,'conversationId',a.conversation_id,'objectKey',a.object_name,'sha256',encode(a.expected_sha256,'hex'),'byteLength',a.expected_bytes);
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;
revoke all on function private.audio_catalog_reserve(uuid,uuid,text,text,integer),private.audio_catalog_find_own(uuid,uuid,text),private.audio_catalog_resolve_read(uuid,uuid,uuid)from public,anon,authenticated;

-- SOURCE supabase/candidates/audio-message/message.CANDIDATE.sql SHA256 fecab4e453f92de1ba4d708eb64bf1ee8d9387e87fd6ea7795e8f5d1415fd54c
-- LOCAL ONLY. No grants to runtime/client roles. Requires historical catalog and repository candidates.

alter table public.messages drop constraint messages_kind_check;
alter table public.messages add constraint messages_kind_check check(kind in('text','audio'));
alter table public.messages alter column body drop not null;
alter table public.messages add constraint messages_kind_body_check check((kind='text'and body is not null)or(kind='audio'and body is null));
create unique index attachment_one_message on private.attachment_catalog(message_id)where message_id is not null;
create table private.audio_message_receipts(
 sender_id uuid not null references public.profiles(id),company_id uuid not null,conversation_id uuid not null,
 client_message_id text not null check(client_message_id~'^[A-Za-z0-9_-]{1,80}$'),
 attachment_id uuid not null unique references private.attachment_catalog(id),message_id uuid not null unique,
 primary key(sender_id,company_id,conversation_id,client_message_id),
 foreign key(company_id,conversation_id,message_id)references public.messages(company_id,conversation_id,id)
);
alter table private.audio_message_receipts enable row level security;
revoke all on private.audio_message_receipts from public,anon,authenticated;
create function private.audio_message_lookup(p_company uuid,p_conversation uuid,p_client text,p_attachment uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare m public.messages;r private.audio_message_receipts;result jsonb;
begin
 perform private.lock_accounts(array[auth.uid()]);
 if not private.active_actor()or not private.can_read_conversation(p_company,p_conversation)or p_client is null or p_client!~'^[A-Za-z0-9_-]{1,80}$'or p_attachment is null then raise exception 'Audio unavailable';end if;
 result:=jsonb_build_object('sender_id',auth.uid(),'company_id',p_company,'conversation_id',p_conversation,'client_message_id',p_client,'kind','audio','attachment_id',p_attachment);
 select * into r from private.audio_message_receipts where sender_id=auth.uid()and company_id=p_company and conversation_id=p_conversation and client_message_id=p_client;
 if not found then return result||jsonb_build_object('state','not_observed');end if;
 if r.attachment_id<>p_attachment then raise exception 'Audio unavailable';end if;
 select * into strict m from public.messages where id=r.message_id and company_id=p_company and conversation_id=p_conversation and sender_id=auth.uid()and kind='audio';
 return result||jsonb_build_object('state','accepted','receipt',jsonb_build_object('id',m.id,'sequence',m.sequence,'accepted_at',m.accepted_at));
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;
create function private.audio_message_send(p_company uuid,p_conversation uuid,p_client text,p_attachment uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare c public.conversations;a private.attachment_catalog;m public.messages;seq bigint;role_name text;prior jsonb;
begin
 perform private.lock_accounts(array[auth.uid()]);
 if not private.active_actor()or not private.can_read_conversation(p_company,p_conversation)then raise exception 'Audio unavailable';end if;
 select * into strict c from public.conversations where company_id=p_company and id=p_conversation for update;
 prior:=private.audio_message_lookup(p_company,p_conversation,p_client,p_attachment);
 if prior->>'state'='accepted'then return prior;end if;
 select * into a from private.attachment_catalog where id=p_attachment and company_id=p_company and conversation_id=p_conversation and sender_id=auth.uid()for update;
 if not found or a.message_id is not null or a.media_kind<>'audio'or a.state<>'ready'or a.detected_type is distinct from 'audio/mp4'or a.duration_ms is null or a.duration_ms not between 500 and 60500 or a.expected_bytes>1048576 or a.observed_bytes is distinct from a.expected_bytes or a.observed_sha256 is distinct from a.expected_sha256 then raise exception 'Audio unavailable';end if;
 if private.has_role(p_company,'staff')then
  if c.patient_id=auth.uid()and private.has_role(p_company,'patient')then raise exception 'Audio unavailable';end if;role_name:='staff';
 else role_name:='patient';end if;
 update public.conversations set last_sequence=last_sequence+1 where company_id=p_company and id=p_conversation returning last_sequence into seq;
 insert into public.messages(company_id,conversation_id,sender_id,sender_role,sequence,kind,body)values(p_company,p_conversation,auth.uid(),role_name,seq,'audio',null)returning * into m;
 update private.attachment_catalog set message_id=m.id where id=a.id;
 insert into private.audio_message_receipts values(auth.uid(),p_company,p_conversation,p_client,a.id,m.id);
 insert into private.audit_events(actor_id,company_id,action,target_id)values(auth.uid(),p_company,'message-accepted',m.id);
 return private.audio_message_lookup(p_company,p_conversation,p_client,p_attachment);
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;
revoke all on function private.audio_message_lookup(uuid,uuid,text,uuid),private.audio_message_send(uuid,uuid,text,uuid)from public,anon,authenticated;

-- SOURCE supabase/candidates/audio-inbox/summary.CANDIDATE.sql SHA256 afe1435722289b89a033a76e336a0de8b2217d1a82549b5644048c82fd9ef6ba
-- LOCAL ONLY. Replace two private projections; preserve their existing ACLs, signatures and access checks.

create or replace function private.membership_directory_inbox_recent(p_company uuid,p_after_at timestamptz,p_after_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.membership_directory_actor();
 if not private.has_role(p_company,'staff') or (p_after_id is null and p_after_at is not null)
 then raise exception using errcode='P0001',message='Operação indisponível';end if;
 with summaries as materialized(
  select c.company_id,c.id conversation_id,c.patient_id,p.display_name,m.accepted_at,
    case when m.id is null then null else jsonb_build_object('id',m.id,'sequence',m.sequence,'accepted_at',to_char(m.accepted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
     'sender_role',m.sender_role,'preview',left(regexp_replace(case when m.kind='audio'then 'Áudio'else m.body end,'[[:space:]]+',' ','g'),240),'truncated',char_length(regexp_replace(case when m.kind='audio'then 'Áudio'else m.body end,'[[:space:]]+',' ','g'))>240) end last_message
  from public.conversations c join public.profiles p on p.id=c.patient_id
  left join lateral(select m.id,m.sequence,m.accepted_at,m.sender_role,m.kind,m.body from public.messages m
    where m.company_id=c.company_id and m.conversation_id=c.id order by m.sequence desc limit 1)m on true
  where c.company_id=p_company and private.can_read_conversation(c.company_id,c.id)
 ),candidates as materialized(
  select * from summaries where p_after_id is null
   or (p_after_at is null and accepted_at is null and conversation_id<p_after_id)
   or (p_after_at is not null and (accepted_at is null or accepted_at<p_after_at or (accepted_at=p_after_at and conversation_id<p_after_id)))
  order by accepted_at desc nulls last,conversation_id desc limit 11
 ),page as materialized(select * from candidates order by accepted_at desc nulls last,conversation_id desc limit 10)
 select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('company_id',company_id,'conversation_id',conversation_id,'patient_id',patient_id,'display_name',display_name,'last_message',last_message) order by accepted_at desc nulls last,conversation_id desc)from page),'[]'::jsonb),
 'has_more',(select count(*)>10 from candidates),'next_cursor',case when (select count(*)>10 from candidates)then (select jsonb_build_object('conversation_id',conversation_id,'accepted_at',case when accepted_at is null then null else to_char(accepted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')end)from page order by accepted_at asc nulls first,conversation_id asc limit 1)else null end)into result;
 return result;
end$$;
create or replace function private.membership_directory_inbox_search(p_company uuid,p_query text,p_after_at timestamptz,p_after_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;query_key text;
begin
 perform private.membership_directory_actor();
 if not private.has_role(p_company,'staff') or (p_after_id is null and p_after_at is not null)
 then raise exception using errcode='P0001',message='Operação indisponível';end if;
 if p_query is null or char_length(p_query)>80 or char_length(btrim(p_query))<2 or p_query ~ '[\x00-\x1f\x7f]' then raise exception using errcode='P0001',message='Operação indisponível';end if;
 query_key:=private.company_search_key(btrim(p_query));
 if char_length(query_key)<2 then raise exception using errcode='P0001',message='Operação indisponível';end if;
 with summaries as materialized(
  select c.company_id,c.id conversation_id,c.patient_id,p.display_name,m.accepted_at,
    case when m.id is null then null else jsonb_build_object('id',m.id,'sequence',m.sequence,'accepted_at',to_char(m.accepted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
     'sender_role',m.sender_role,'preview',left(regexp_replace(case when m.kind='audio'then 'Áudio'else m.body end,'[[:space:]]+',' ','g'),240),'truncated',char_length(regexp_replace(case when m.kind='audio'then 'Áudio'else m.body end,'[[:space:]]+',' ','g'))>240) end last_message
  from public.conversations c join public.profiles p on p.id=c.patient_id
  left join lateral(select m.id,m.sequence,m.accepted_at,m.sender_role,m.kind,m.body from public.messages m
    where m.company_id=c.company_id and m.conversation_id=c.id order by m.sequence desc limit 1)m on true
  where c.company_id=p_company and private.can_read_conversation(c.company_id,c.id) and strpos(private.company_search_key(p.display_name),query_key)>0
 ),candidates as materialized(
  select * from summaries where p_after_id is null
   or (p_after_at is null and accepted_at is null and conversation_id<p_after_id)
   or (p_after_at is not null and (accepted_at is null or accepted_at<p_after_at or (accepted_at=p_after_at and conversation_id<p_after_id)))
  order by accepted_at desc nulls last,conversation_id desc limit 11
 ),page as materialized(select * from candidates order by accepted_at desc nulls last,conversation_id desc limit 10)
 select jsonb_build_object('items',coalesce((select jsonb_agg(jsonb_build_object('company_id',company_id,'conversation_id',conversation_id,'patient_id',patient_id,'display_name',display_name,'last_message',last_message) order by accepted_at desc nulls last,conversation_id desc)from page),'[]'::jsonb),
 'has_more',(select count(*)>10 from candidates),'next_cursor',case when (select count(*)>10 from candidates)then (select jsonb_build_object('conversation_id',conversation_id,'accepted_at',case when accepted_at is null then null else to_char(accepted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"')end)from page order by accepted_at asc nulls first,conversation_id asc limit 1)else null end)into result;
 return result;
end$$;

-- SOURCE supabase/candidates/audio-message-resolver/resolve.CANDIDATE.sql SHA256 8078d2373f4a3dd38756400dd5969f9dae0679072c7b9e9258566339e680e09f
-- LOCAL ONLY. No runtime grants, no public URL or storage path in DTO.

create function private.audio_message_resolve(p_company uuid,p_conversation uuid,p_message uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare a uuid;descriptor jsonb;
begin
 perform private.lock_accounts(array[auth.uid()]);
 if not private.active_actor()or not private.can_read_conversation(p_company,p_conversation)then raise exception 'Audio unavailable';end if;
 select c.id into a from private.attachment_catalog c join public.messages m on m.company_id=c.company_id and m.conversation_id=c.conversation_id and m.id=c.message_id and m.sender_id=c.sender_id where m.company_id=p_company and m.conversation_id=p_conversation and m.id=p_message and m.kind='audio'and c.media_kind='audio';
 if not found then raise exception 'Audio unavailable';end if;
 descriptor:=private.audio_catalog_resolve_read(p_company,p_conversation,a);
 return(descriptor-'objectKey')||jsonb_build_object('messageId',p_message);
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;
create function public.resolve_connect_audio_message_v1(p_company uuid,p_conversation uuid,p_message uuid)returns jsonb
language sql security invoker set search_path=''as $$select private.audio_message_resolve(p_company,p_conversation,p_message)$$;
revoke all on function private.audio_message_resolve(uuid,uuid,uuid),public.resolve_connect_audio_message_v1(uuid,uuid,uuid)from public,anon,authenticated;

-- LOCAL ONLY. Four worker-facing private helpers; no runtime grants.
create function private.audio_catalog_authorize(p_company uuid,p_conversation uuid)returns jsonb
language plpgsql security definer set search_path=''as $$begin
 perform private.lock_accounts(array[auth.uid()]);
 if not private.active_actor()or not private.can_read_conversation(p_company,p_conversation)then raise exception 'Audio unavailable';end if;
 return jsonb_build_object('userId',auth.uid());
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;
create function private.audio_catalog_resolve_upload(p_company uuid,p_conversation uuid,p_attachment uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare a private.attachment_catalog;
begin
 perform private.audio_catalog_authorize(p_company,p_conversation);
 select * into a from private.attachment_catalog where id=p_attachment and company_id=p_company and conversation_id=p_conversation and sender_id=auth.uid()and media_kind='audio';
 if not found or a.state not in('reserved','uploaded')or a.expected_bytes>1048576 or a.session_id::text is distinct from(auth.jwt()->>'session_id')then raise exception 'Audio unavailable';end if;
 if not private.attachment_author_lock(a.sender_id,a.company_id,a.conversation_id,a.session_id,a.valid_until)then raise exception 'Audio unavailable';end if;
 return jsonb_build_object('attachmentId',a.id,'companyId',a.company_id,'conversationId',a.conversation_id,'objectKey',a.object_name,'sha256',encode(a.expected_sha256,'hex'),'byteLength',a.expected_bytes);
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;
create function private.audio_catalog_record_uploaded(p_company uuid,p_conversation uuid,p_attachment uuid,p_content bytea)returns text
language plpgsql security definer set search_path=''as $$begin
 perform private.audio_catalog_resolve_upload(p_company,p_conversation,p_attachment);
 if p_content is null or octet_length(p_content)>1048576 then raise exception 'Audio unavailable';end if;
 return private.attachment_record_blob(p_attachment,p_content);
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;
create function private.audio_catalog_finish_inspection(p_company uuid,p_conversation uuid,p_attachment uuid,p_digest text,p_pass boolean,p_type text,p_duration integer,p_version text)returns jsonb
language plpgsql security definer set search_path=''as $$
declare a private.attachment_catalog;
begin
 perform private.audio_catalog_resolve_upload(p_company,p_conversation,p_attachment);
 if p_digest is null or p_digest!~'^[a-f0-9]{64}$'then raise exception 'Audio unavailable';end if;
 perform private.attachment_inspect(p_attachment,decode(p_digest,'hex'),p_pass,p_type,p_duration,p_version);
 select * into strict a from private.attachment_catalog where id=p_attachment and sender_id=auth.uid()and company_id=p_company and conversation_id=p_conversation;
 return private.audio_catalog_find_own(p_company,p_conversation,a.client_upload_id);
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;
revoke all on function private.audio_catalog_authorize(uuid,uuid),private.audio_catalog_resolve_upload(uuid,uuid,uuid),private.audio_catalog_record_uploaded(uuid,uuid,uuid,bytea),private.audio_catalog_finish_inspection(uuid,uuid,uuid,text,boolean,text,integer,text)from public,anon,authenticated;

create function public.send_connect_audio_message_v1(p_company uuid,p_conversation uuid,p_client text,p_attachment uuid)returns jsonb
language sql security invoker set search_path=''as $$select private.audio_message_send(p_company,p_conversation,p_client,p_attachment)$$;
create function public.lookup_connect_audio_message_v1(p_company uuid,p_conversation uuid,p_client text,p_attachment uuid)returns jsonb
language sql security invoker set search_path=''as $$select private.audio_message_lookup(p_company,p_conversation,p_client,p_attachment)$$;
revoke all on function public.send_connect_audio_message_v1(uuid,uuid,text,uuid),public.lookup_connect_audio_message_v1(uuid,uuid,text,uuid)from public,anon,authenticated,service_role;

-- LOCAL CANDIDATE ONLY. Requires closed audio catalog/message candidates and a Storage fixture.
-- Not a managed migration; no bucket, Auth identity, secret, network service or DB role is created.
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

-- AUDIO_RESTORE_BOUNDARY
revoke all on function private.audio_catalog_authorize(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.audio_catalog_resolve_upload(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.audio_catalog_record_uploaded(uuid,uuid,uuid,bytea) from public,anon,authenticated,service_role;
revoke all on function private.audio_catalog_finish_inspection(uuid,uuid,uuid,text,boolean,text,integer,text) from public,anon,authenticated,service_role;
revoke all on function private.attachment_author_lock(uuid,uuid,uuid,uuid,timestamptz) from public,anon,authenticated,service_role;
revoke all on function private.attachment_reserve(uuid,uuid,text,text,bytea,integer) from public,anon,authenticated,service_role;
revoke all on function private.attachment_cancel(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.attachment_record_blob(uuid,bytea) from public,anon,authenticated,service_role;
revoke all on function private.attachment_inspect(uuid,bytea,boolean,text,integer,text) from public,anon,authenticated,service_role;
revoke all on function private.attachment_status(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.reserve_attachment(uuid,uuid,text,text,bytea,integer) from public,anon,authenticated,service_role;
revoke all on function public.my_attachment_status(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.cancel_attachment(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.audio_catalog_reserve(uuid,uuid,text,text,integer) from public,anon,authenticated,service_role;
revoke all on function private.audio_catalog_find_own(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function private.audio_catalog_resolve_read(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.audio_message_lookup(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function private.audio_message_send(uuid,uuid,text,uuid) from public,anon,authenticated,service_role;
revoke all on function private.audio_message_resolve(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.resolve_connect_audio_message_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on private.attachment_catalog,private.attachment_events,private.audio_message_receipts from public,anon,authenticated,service_role;
revoke all on sequence private.attachment_events_id_seq from public,anon,authenticated,service_role;
set local role connect_hmac_registration;
revoke create on schema private from postgres;
set local role postgres;
grant connect_hmac_registration to postgres with inherit false,set false;
do $$declare b record;begin
 select * into strict b from pg_temp.audio_before;
 if has_schema_privilege('postgres','private','CREATE')or b.schemas is distinct from(select jsonb_agg(to_jsonb(n)order by oid)from pg_namespace n where nspname in('private','public','storage'))or b.membership is distinct from(select jsonb_agg(to_jsonb(m)order by oid)from pg_auth_members m where roleid='connect_hmac_registration'::regrole)or b.policies is distinct from(select jsonb_agg(to_jsonb(p)order by oid)from pg_policy p)or b.defaults is distinct from(select jsonb_agg(to_jsonb(a)order by oid)from pg_default_acl a)then raise exception 'Audio structure restoration failed';end if;
end$$;
do $receipt$begin if (select jsonb_build_object from pg_temp.audio_receipts_before)is distinct from(select jsonb_build_object('functions',(select jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl,pg_get_functiondef(p.oid))order by p.oid)from pg_proc p where p.pronamespace in('private'::regnamespace,'public'::regnamespace)and p.proname in('connect_mark_own_messages_received','mark_connect_messages_received_v1','connect_mark_own_messages_visualized','mark_connect_messages_visualized_v1','connect_lookup_own_message_status','lookup_connect_own_message_status_v1')),'tables',(select jsonb_agg(jsonb_build_array(c.oid,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity)order by c.oid)from pg_class c where c.oid in('private.message_delivery_receipts'::regclass,'private.message_visual_receipts'::regclass)),'constraints',(select jsonb_agg(jsonb_build_array(oid,pg_get_constraintdef(oid))order by oid)from pg_constraint where conrelid in('private.message_delivery_receipts'::regclass,'private.message_visual_receipts'::regclass)),'columns',(select jsonb_agg(jsonb_build_array(attrelid,attnum,attname,atttypid,attnotnull)order by attrelid,attnum)from pg_attribute where attrelid in('private.message_delivery_receipts'::regclass,'private.message_visual_receipts'::regclass)and attnum>0 and not attisdropped)))then raise exception 'Audio receipt preservation failed';end if;end$receipt$;
commit;
