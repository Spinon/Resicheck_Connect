-- NEW LOCAL CANDIDATE. Not authorized for remote execution.
begin;set local lock_timeout='3s';set local statement_timeout='20s';
select pg_advisory_xact_lock(900001,560);
do $$begin if current_user<>'postgres'or session_user<>'postgres'or (select count(*)from supabase_migrations.schema_migrations)<>9 or exists(select 1 from supabase_migrations.schema_migrations where name is null or(version,name)not in(('20261106200713','connect_foundation'),('20261109001359','connect_pending_registration_homolog'),('20261109010823','connect_membership_read_homolog'),('20261110124705','connect_messenger_inbox_recent_search_unread_maintenance'),('20261110163040','connect_seen_messages_exact_read_maintenance'),('20261110174417','connect_own_send_receipt_lookup_maintenance'),('20261110190849','connect_company_registry_structure_maintenance'),('20261110205536','connect_message_delivery_visual_receipts_maintenance'),('20261111013950','connect_audio_scoped_closed_structure'))) or to_regclass('private.audio_pilot_scope')is not null or has_schema_privilege('postgres','private','CREATE')or exists(select 1 from pg_auth_members where roleid='connect_hmac_registration'::regrole and(set_option or inherit_option))or exists(select 1 from(values('private.audio_message_send(uuid,uuid,text,uuid)','894d3fb154c5180a4aededdac67f1d92a3733ac7ca3045b2d618995a8ff33f6f'),('private.audio_message_lookup(uuid,uuid,text,uuid)','eac353f4c948f72d2780e284c66decc5a7993c10bb3e690ddc60db3364f536f8'),('private.audio_message_resolve(uuid,uuid,uuid)','b0e44289da4176e1852f6f27fa9be304764fd3a390510936079077019ad00aa2'),('private.audio_reserve_scoped(uuid,uuid,text,text,integer)','1a636a4e2fcbefd188d0a688148cf229738c7a18f1c6f4fcc8f99b16a314e9f6'),('private.audio_confirm_scoped(uuid,uuid,uuid)','45d6a4fd3837c083fa15d0c82904cdc6ffd9cc0c858b773e5d90ba7c009c4856'),('private.audio_status_scoped(uuid,uuid,text)','4d87e7170a617c580affbbbcd2105387ae929799376df256edf07af3947299ac'),('private.audio_read_scoped(uuid,uuid,uuid)','f03fe15a58701f7cc48637892568231eb1f615d3dc620bfee8ce8a2725c2b989'),('private.audio_storage_insert(text,text,text)','62f7ee4ee9737ecc31bd96d630e249bea0938ae063914fe5c775c784ca0fe1e7'),('private.audio_storage_ready(text,text)','3f87f1421ef5b958ec46d817c2b87d9d7c17c300147b7e1f26798b27df284d9e'),('private.audio_storage_leased(text,text)','f28ef122f00c085d3ecc0ad17254a34594f1be8745c1618ca9ee2a9dc680bfd3'),('private.audio_inspector_active()','26ecb3560e495652e660592a29f791cfc949de200be2561222426b9b2a3f3810'),('private.audio_claim_scoped()','447fd7bbed4b191f810e94fe700b2897804ce5a4082b29dfbbba5f6dbbd57bca'))v(sig,digest)left join pg_proc p on p.oid=to_regprocedure(v.sig)where p.oid is null or p.proowner<>'postgres'::regrole or not p.prosecdef or p.proconfig is distinct from ARRAY['search_path=""']::text[]or encode(sha256(convert_to(replace(p.prosrc,chr(13),''),'UTF8')),'hex')<>v.digest) then raise exception 'Audio pilot initial state differs';end if;end$$;
create temporary table audio_pilot_before on commit drop as select(select jsonb_agg(to_jsonb(n)order by oid)from pg_namespace n where nspname in('private','public','storage'))schemas,(select jsonb_agg(to_jsonb(m)order by oid)from pg_auth_members m where roleid='connect_hmac_registration'::regrole)membership,(select jsonb_agg(to_jsonb(p)order by oid)from pg_policy p)policies,(select jsonb_agg(to_jsonb(d)order by oid)from pg_default_acl d)defaults,(select coalesce(jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl,pg_get_functiondef(p.oid))order by p.oid),'[]'::jsonb)from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private')and p.oid<>coalesce(to_regprocedure('private.audio_pilot_allowed(uuid)')::oid,0)and not(p.oid=any(array[to_regprocedure('private.audio_message_send(uuid,uuid,text,uuid)')::oid,to_regprocedure('private.audio_message_lookup(uuid,uuid,text,uuid)')::oid,to_regprocedure('private.audio_message_resolve(uuid,uuid,uuid)')::oid,to_regprocedure('private.audio_reserve_scoped(uuid,uuid,text,text,integer)')::oid,to_regprocedure('private.audio_confirm_scoped(uuid,uuid,uuid)')::oid,to_regprocedure('private.audio_status_scoped(uuid,uuid,text)')::oid,to_regprocedure('private.audio_read_scoped(uuid,uuid,uuid)')::oid,to_regprocedure('private.audio_storage_insert(text,text,text)')::oid,to_regprocedure('private.audio_storage_ready(text,text)')::oid,to_regprocedure('private.audio_storage_leased(text,text)')::oid,to_regprocedure('private.audio_inspector_active()')::oid,to_regprocedure('private.audio_claim_scoped()')::oid])))functions;
grant connect_hmac_registration to postgres with inherit false,set true;set local role connect_hmac_registration;grant create on schema private to postgres;set local role postgres;
create table private.audio_pilot_scope(
 singleton boolean primary key default true check(singleton),
 company_id uuid not null references public.companies(id)check(company_id='678e7072-b9d9-489f-8f4a-827ebc3fc340'::uuid),
 enabled boolean not null default false,created_at timestamptz not null,expires_at timestamptz not null,
 check(expires_at>created_at and expires_at<=created_at+interval'7 days')
);
alter table private.audio_pilot_scope enable row level security;
revoke all on private.audio_pilot_scope from public,anon,authenticated,service_role;
create function private.audio_pilot_allowed(p_company uuid)returns boolean
language plpgsql volatile security definer set search_path=''as $$
declare scope private.audio_pilot_scope;
begin
 select*into scope from private.audio_pilot_scope where singleton for share;
 return coalesce(found and scope.enabled and scope.company_id=p_company
  and scope.company_id='678e7072-b9d9-489f-8f4a-827ebc3fc340'::uuid
  and scope.created_at<=clock_timestamp()and scope.expires_at>clock_timestamp(),false);
exception when others then return false;end$$;
revoke all on function private.audio_pilot_allowed(uuid)from public,anon,authenticated,service_role;
create or replace function private.audio_message_send(p_company uuid,p_conversation uuid,p_client text,p_attachment uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare c public.conversations;a private.attachment_catalog;m public.messages;seq bigint;role_name text;prior jsonb;
begin
 if not private.audio_pilot_allowed(p_company)then raise exception 'Audio unavailable';end if;
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
create or replace function private.audio_message_lookup(p_company uuid,p_conversation uuid,p_client text,p_attachment uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare m public.messages;r private.audio_message_receipts;result jsonb;
begin
 if not private.audio_pilot_allowed(p_company)then raise exception 'Audio unavailable';end if;
 perform private.lock_accounts(array[auth.uid()]);
 if not private.active_actor()or not private.can_read_conversation(p_company,p_conversation)or p_client is null or p_client!~'^[A-Za-z0-9_-]{1,80}$'or p_attachment is null then raise exception 'Audio unavailable';end if;
 result:=jsonb_build_object('sender_id',auth.uid(),'company_id',p_company,'conversation_id',p_conversation,'client_message_id',p_client,'kind','audio','attachment_id',p_attachment);
 select * into r from private.audio_message_receipts where sender_id=auth.uid()and company_id=p_company and conversation_id=p_conversation and client_message_id=p_client;
 if not found then return result||jsonb_build_object('state','not_observed');end if;
 if r.attachment_id<>p_attachment then raise exception 'Audio unavailable';end if;
 select * into strict m from public.messages where id=r.message_id and company_id=p_company and conversation_id=p_conversation and sender_id=auth.uid()and kind='audio';
 return result||jsonb_build_object('state','accepted','receipt',jsonb_build_object('id',m.id,'sequence',m.sequence,'accepted_at',m.accepted_at));
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;
create or replace function private.audio_message_resolve(p_company uuid,p_conversation uuid,p_message uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare a uuid;descriptor jsonb;
begin
 if not private.audio_pilot_allowed(p_company)then raise exception 'Audio unavailable';end if;
 perform private.lock_accounts(array[auth.uid()]);
 if not private.active_actor()or not private.can_read_conversation(p_company,p_conversation)then raise exception 'Audio unavailable';end if;
 select c.id into a from private.attachment_catalog c join public.messages m on m.company_id=c.company_id and m.conversation_id=c.conversation_id and m.id=c.message_id and m.sender_id=c.sender_id where m.company_id=p_company and m.conversation_id=p_conversation and m.id=p_message and m.kind='audio'and c.media_kind='audio';
 if not found then raise exception 'Audio unavailable';end if;
 descriptor:=private.audio_catalog_resolve_read(p_company,p_conversation,a);
 return(descriptor-'objectKey')||jsonb_build_object('messageId',p_message);
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;
create or replace function private.audio_reserve_scoped(p_company uuid,p_conversation uuid,p_client text,p_digest text,p_bytes integer)returns jsonb
language plpgsql security definer set search_path='' as $$
declare reserved jsonb;a private.attachment_catalog;
begin
 if not private.audio_pilot_allowed(p_company)then raise exception 'Audio unavailable';end if;
 if exists(select 1 from private.audio_inspectors where user_id=auth.uid())then raise exception 'Audio unavailable';end if;
 -- Pilot-wide hard cap, including rejected/expired rows until a reviewed retention operation.
 perform pg_catalog.pg_advisory_xact_lock(2147483000,1);
 if not exists(select 1 from private.attachment_catalog where company_id=p_company and conversation_id=p_conversation and sender_id=auth.uid()and client_upload_id=p_client)
   and(select count(*)from private.attachment_catalog)>=256 then raise exception 'Audio unavailable';end if;
 reserved:=private.audio_catalog_reserve(p_company,p_conversation,p_client,p_digest,p_bytes);
 select * into strict a from private.attachment_catalog where id=(reserved->'row'->>'id')::uuid;
 return reserved||jsonb_build_object('upload',case when a.state='reserved'then jsonb_build_object('bucket','connect-private-attachments','objectKey',a.object_name,'validUntil',least(a.valid_until,a.created_at+interval'5 minutes'))else null end);
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;
create or replace function private.audio_confirm_scoped(p_company uuid,p_conversation uuid,p_attachment uuid)returns jsonb
language plpgsql security definer set search_path='' as $$
declare a private.attachment_catalog;
begin
 if not private.audio_pilot_allowed(p_company)then raise exception 'Audio unavailable';end if;
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
create or replace function private.audio_status_scoped(p_company uuid,p_conversation uuid,p_client text)returns jsonb
language plpgsql security definer set search_path=''as $$
declare own jsonb;a private.attachment_catalog;j private.audio_inspection_jobs;phase text;
begin
 if not private.audio_pilot_allowed(p_company)then raise exception 'Audio unavailable';end if;
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
create or replace function private.audio_read_scoped(p_company uuid,p_conversation uuid,p_attachment uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare descriptor jsonb;
begin
 if not private.audio_pilot_allowed(p_company)then raise exception 'Audio unavailable';end if;
 descriptor:=private.audio_catalog_resolve_read(p_company,p_conversation,p_attachment);
 if not exists(select 1 from private.attachment_catalog a join public.messages m on m.company_id=a.company_id and m.conversation_id=a.conversation_id and m.id=a.message_id and m.sender_id=a.sender_id where a.id=p_attachment and a.company_id=p_company and a.conversation_id=p_conversation and a.state='ready'and m.kind='audio')then raise exception 'Audio unavailable';end if;
 return descriptor;
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;
create or replace function private.audio_storage_insert(p_bucket text,p_name text,p_owner text)returns boolean
language plpgsql security definer set search_path=''as $$begin
 return p_bucket='connect-private-attachments'and p_owner=auth.uid()::text and private.active_actor()
  and not exists(select 1 from private.audio_inspectors where user_id=auth.uid())
  and exists(select 1 from private.attachment_catalog a where a.object_name=p_name and a.media_kind='audio'and private.audio_pilot_allowed(a.company_id)and a.state='reserved'
   and a.sender_id=auth.uid()and a.session_id::text=auth.jwt()->>'session_id'and least(a.valid_until,a.created_at+interval'5 minutes')>clock_timestamp()
   and private.can_read_conversation(a.company_id,a.conversation_id));
 exception when others then return false;end$$;
create or replace function private.audio_storage_ready(p_bucket text,p_name text)returns boolean
language plpgsql security definer set search_path=''as $$begin
 return p_bucket='connect-private-attachments'and storage.allow_only_operation('object.get_authenticated')
  and not exists(select 1 from private.audio_inspectors where user_id=auth.uid())
  and exists(select 1 from private.attachment_catalog a where a.object_name=p_name and a.media_kind='audio'and private.audio_pilot_allowed(a.company_id)and a.state='ready'and a.message_id is not null
   and private.can_read_conversation(a.company_id,a.conversation_id));
 exception when others then return false;end$$;
create or replace function private.audio_storage_leased(p_bucket text,p_name text)returns boolean
language plpgsql security definer set search_path=''as $$begin
 return p_bucket='connect-private-attachments'and storage.allow_only_operation('object.get_authenticated')and private.audio_inspector_active()
  and exists(select 1 from private.audio_inspection_jobs j join private.attachment_catalog a on a.id=j.attachment_id
   where a.object_name=p_name and a.state='uploaded'and a.media_kind='audio'and private.audio_pilot_allowed(a.company_id)and a.valid_until>clock_timestamp()and a.company_id=(select company_id from private.audio_inspectors where user_id=auth.uid())
   and j.inspector_id=auth.uid()and j.session_id::text=auth.jwt()->>'session_id'and j.valid_until>clock_timestamp()and j.result is null
   and exists(select 1 from auth.sessions s where s.id=a.session_id and s.user_id=a.sender_id and(s.not_after is null or s.not_after>clock_timestamp()))
   and exists(select 1 from private.accounts x where x.user_id=a.sender_id and x.state='active')
   and exists(select 1 from private.company_controls c where c.company_id=a.company_id and c.state='active')
   and exists(select 1 from public.memberships m join public.conversations c on c.id=a.conversation_id and c.company_id=a.company_id
      where m.company_id=a.company_id and m.user_id=a.sender_id and m.state='active'and(m.role='staff'or(m.role='patient'and c.patient_id=a.sender_id))));
 exception when others then return false;end$$;
create or replace function private.audio_inspector_active()returns boolean
language plpgsql volatile security definer set search_path='' as $$begin
 return (auth.jwt()->>'role')='authenticated'
  and (auth.jwt()->>'exp')::numeric>extract(epoch from clock_timestamp())
  and exists(select 1 from private.audio_inspectors i join auth.sessions s on s.user_id=i.user_id
    where private.audio_pilot_allowed(i.company_id)and i.user_id=auth.uid() and i.enabled and i.valid_until>clock_timestamp()and exists(select 1 from private.company_controls c where c.company_id=i.company_id and c.state='active')
    and s.id=(auth.jwt()->>'session_id')::uuid and(s.not_after is null or s.not_after>clock_timestamp())
    and not exists(select 1 from private.accounts a where a.user_id=i.user_id and a.state='active')
    and not exists(select 1 from public.memberships m where m.user_id=i.user_id));
 exception when others then return false;
end$$;
create or replace function private.audio_claim_scoped()returns jsonb
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
     values(a.id,gen_random_uuid(),auth.uid(),(auth.jwt()->>'session_id')::uuid,least((select expires_at from private.audio_pilot_scope where singleton),clock_timestamp()+interval'30 seconds',to_timestamp((auth.jwt()->>'exp')::double precision),a.valid_until),1)
     on conflict(attachment_id)do update set lease_id=excluded.lease_id,inspector_id=excluded.inspector_id,session_id=excluded.session_id,valid_until=excluded.valid_until,attempts=private.audio_inspection_jobs.attempts+1,result=null
     returning * into j;
   claimed:=true;exit;
  end loop;
  if not claimed then return null;end if;
 end if;
 return jsonb_build_object('leaseId',j.lease_id,'validUntil',j.valid_until,'attachmentId',a.id,'companyId',a.company_id,'conversationId',a.conversation_id,'objectKey',a.object_name,'sha256',encode(a.expected_sha256,'hex'),'byteLength',a.expected_bytes);
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$$;
-- PILOT_RESTORE_BOUNDARY
set local role connect_hmac_registration;revoke create on schema private from postgres;set local role postgres;grant connect_hmac_registration to postgres with inherit false,set false;
do $$declare b record;begin select*into strict b from pg_temp.audio_pilot_before;if has_schema_privilege('postgres','private','CREATE')or b.schemas is distinct from(select jsonb_agg(to_jsonb(n)order by oid)from pg_namespace n where nspname in('private','public','storage'))or b.membership is distinct from(select jsonb_agg(to_jsonb(m)order by oid)from pg_auth_members m where roleid='connect_hmac_registration'::regrole)or b.policies is distinct from(select jsonb_agg(to_jsonb(p)order by oid)from pg_policy p)or b.defaults is distinct from(select jsonb_agg(to_jsonb(d)order by oid)from pg_default_acl d)or b.functions is distinct from(select coalesce(jsonb_agg(jsonb_build_array(p.oid,p.proowner,p.proacl,pg_get_functiondef(p.oid))order by p.oid),'[]'::jsonb)from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('public','private')and p.oid<>coalesce(to_regprocedure('private.audio_pilot_allowed(uuid)')::oid,0)and not(p.oid=any(array[to_regprocedure('private.audio_message_send(uuid,uuid,text,uuid)')::oid,to_regprocedure('private.audio_message_lookup(uuid,uuid,text,uuid)')::oid,to_regprocedure('private.audio_message_resolve(uuid,uuid,uuid)')::oid,to_regprocedure('private.audio_reserve_scoped(uuid,uuid,text,text,integer)')::oid,to_regprocedure('private.audio_confirm_scoped(uuid,uuid,uuid)')::oid,to_regprocedure('private.audio_status_scoped(uuid,uuid,text)')::oid,to_regprocedure('private.audio_read_scoped(uuid,uuid,uuid)')::oid,to_regprocedure('private.audio_storage_insert(text,text,text)')::oid,to_regprocedure('private.audio_storage_ready(text,text)')::oid,to_regprocedure('private.audio_storage_leased(text,text)')::oid,to_regprocedure('private.audio_inspector_active()')::oid,to_regprocedure('private.audio_claim_scoped()')::oid])))or exists(select 1 from(values('private.audio_message_send(uuid,uuid,text,uuid)','6f01d852e149fb32fa48bcebc95a97970c9fe417874f6e472b416319cfd6ba38'),('private.audio_message_lookup(uuid,uuid,text,uuid)','df4c9a733dc23880140d8fc1c037efb435910b0a6148ef67a85bf4c233b61bd9'),('private.audio_message_resolve(uuid,uuid,uuid)','dbec44e213818f8087996178a44a711595dfd1f78e7ce7ec0c5f2b5258e052ac'),('private.audio_reserve_scoped(uuid,uuid,text,text,integer)','01ceb0ae7eb422034ac641bbb0ce4a36b81ca80789767369b21d79a3d122749a'),('private.audio_confirm_scoped(uuid,uuid,uuid)','cb8b8ff87b95a994a920fd90e4b39b8a9c303520cf28113146cc8b8bb37133a5'),('private.audio_status_scoped(uuid,uuid,text)','a0500402b94567e4880c7ad8281753b69cac0e49f0988a6535937f488054d8d6'),('private.audio_read_scoped(uuid,uuid,uuid)','b967f9f6eb464e5eb6e1829f7c6bcd4b9b99f5d457306b04991dea455e346335'),('private.audio_storage_insert(text,text,text)','06ae4e20fb8e36ba91b5f36d1ab51a53c7a002c230538ecd3ebd59b622f836bb'),('private.audio_storage_ready(text,text)','69ad1463fe191db4a67089bc97ccbf9d49ae8336d2d63888be4a85416c82c46f'),('private.audio_storage_leased(text,text)','743ab76c695f3ba610c1f968944e2ba99240ef11b86c141a1ee2bbbc698b3ac1'),('private.audio_inspector_active()','632c6e866c534448dc60ee30610623b608c76e72b288d59475cb626be9513c14'),('private.audio_claim_scoped()','ad1b7f6d1e2f1c4b65c8ce9461d512c2aa1da34f7cda5bae5e45b176773d06c0'))v(sig,digest)left join pg_proc p on p.oid=to_regprocedure(v.sig)where p.oid is null or p.proowner<>'postgres'::regrole or not p.prosecdef or p.proconfig is distinct from ARRAY['search_path=""']::text[]or encode(sha256(convert_to(replace(p.prosrc,chr(13),''),'UTF8')),'hex')<>v.digest) then raise exception 'Audio pilot restoration differs';end if;
if exists(select 1 from private.audio_pilot_scope)or not exists(select 1 from pg_class where oid='private.audio_pilot_scope'::regclass and relowner='postgres'::regrole and relrowsecurity and not relforcerowsecurity)or exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a where p.oid='private.audio_pilot_allowed(uuid)'::regprocedure and(a.grantee<>p.proowner or p.proowner<>'postgres'::regrole or not p.prosecdef or p.proconfig is distinct from ARRAY['search_path=""']::text[]))or exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a where c.oid='private.audio_pilot_scope'::regclass and a.grantee<>c.relowner)then raise exception 'Audio pilot closed boundary differs';end if;end$$;
commit;
