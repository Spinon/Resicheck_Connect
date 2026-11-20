-- LOCAL SCHEMA FIXTURE ONLY. Function definitions, no Auth rows/tokens/recorded sessions.
-- Captured source was reviewed; this file does not assert current hosted availability.

-- Function audio_claim_scoped
CREATE OR REPLACE FUNCTION private.audio_claim_scoped()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p private.audio_one_task_permit;a private.attachment_catalog;j private.audio_inspection_jobs;
begin
 perform 1 from private.audio_pilot_scope where singleton for share;
 select*into p from private.audio_one_task_permit where singleton for update;
 if not found or not p.enabled or p.phase not in('armed','leased')or p.inspector_id<>auth.uid()or p.session_id::text is distinct from auth.jwt()->>'session_id'then raise exception 'Audio unavailable';end if;
 perform 1 from private.audio_inspectors where user_id=auth.uid()for update;
 if not private.audio_inspector_active()then raise exception 'Audio unavailable';end if;
 select*into a from private.attachment_catalog where id=p.attachment_id for update;
 if not found or a.company_id<>p.company_id or a.media_kind<>'audio'or a.state<>'uploaded'
  or a.expected_sha256<>p.expected_digest or a.expected_bytes<>p.expected_bytes
  or not private.attachment_author_lock(a.sender_id,a.company_id,a.conversation_id,a.session_id,a.valid_until)then raise exception 'Audio unavailable';end if;
 select*into j from private.audio_inspection_jobs where attachment_id=a.id for update;
 if p.phase='leased'then
  if not found or j.lease_id is distinct from p.lease_id or j.inspector_id<>p.inspector_id or j.session_id<>p.session_id or j.valid_until<=clock_timestamp()or j.result is not null then raise exception 'Audio unavailable';end if;
 else
  if found or exists(select 1 from private.audio_inspection_jobs where inspector_id=p.inspector_id and valid_until>clock_timestamp()and result is null)then raise exception 'Audio unavailable';end if;
  insert into private.audio_inspection_jobs(attachment_id,lease_id,inspector_id,session_id,valid_until,attempts)
   values(a.id,gen_random_uuid(),p.inspector_id,p.session_id,least(clock_timestamp()+interval'30 seconds',p.expires_at,(select expires_at from private.audio_pilot_scope where singleton),to_timestamp((auth.jwt()->>'exp')::double precision),a.valid_until),1)returning*into j;
  update private.audio_one_task_permit set phase='leased',lease_id=j.lease_id where singleton;
 end if;
 return jsonb_build_object('leaseId',j.lease_id,'validUntil',j.valid_until,'attachmentId',a.id,'companyId',a.company_id,'conversationId',a.conversation_id,'objectKey',a.object_name,'sha256',encode(a.expected_sha256,'hex'),'byteLength',a.expected_bytes);
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$function$;

-- Function audio_confirm_scoped
CREATE OR REPLACE FUNCTION private.audio_confirm_scoped(p_company uuid, p_conversation uuid, p_attachment uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p private.audio_producer_permit;a private.attachment_catalog;
begin
 perform 1 from private.audio_pilot_scope where singleton for share;
 select*into p from private.audio_producer_permit where singleton for update;
 if not found or not private.audio_producer_allowed(p_company)then raise exception 'Audio unavailable';end if;
 if p.conversation_id is distinct from p_conversation or p.attachment_id is distinct from p_attachment or p.phase not in('reserved','confirmed')then raise exception 'Audio unavailable';end if;
 if not private.audio_producer_allowed(p_company)then raise exception 'Audio unavailable';end if;
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
 update private.audio_producer_permit set phase='confirmed'where singleton;
 return private.audio_catalog_find_own(p_company,p_conversation,a.client_upload_id);
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$function$;

-- Function audio_finish_scoped
CREATE OR REPLACE FUNCTION private.audio_finish_scoped(p_attachment uuid, p_lease uuid, p_digest text, p_bytes integer, p_pass boolean, p_duration integer, p_version text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p private.audio_one_task_permit;a private.attachment_catalog;j private.audio_inspection_jobs;proof jsonb;passed boolean;
begin
 perform 1 from private.audio_pilot_scope where singleton for share;
 select*into p from private.audio_one_task_permit where singleton for update;
 if not found or not p.enabled or p.phase not in('leased','finished')or p.attachment_id is distinct from p_attachment or p.lease_id is distinct from p_lease or p.inspector_id is distinct from auth.uid()or p.session_id::text is distinct from auth.jwt()->>'session_id'or p.expires_at<=clock_timestamp()then raise exception 'Audio unavailable';end if;
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
 update private.audio_one_task_permit set phase='finished'where singleton;
 return jsonb_build_object('state',case when passed then 'ready'else 'rejected'end);
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$function$;

-- Function audio_pilot_allowed
CREATE OR REPLACE FUNCTION private.audio_pilot_allowed(p_company uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare scope private.audio_pilot_scope;p private.audio_one_task_permit;
begin
 select*into scope from private.audio_pilot_scope where singleton for share;
 if not coalesce(scope.enabled and scope.company_id=p_company and scope.company_id='678e7072-b9d9-489f-8f4a-827ebc3fc340'and scope.created_at<=clock_timestamp()and scope.expires_at>clock_timestamp(),false)then return false;end if;
 select*into p from private.audio_one_task_permit where singleton for share;
 if not found then return true;end if;
 -- Permit row is retained. Expiry/revocation closes access instead of restoring general reads/uploads.
 return coalesce(p.enabled and p.phase in('armed','leased','finished')and p.company_id=p_company
  and p.inspector_id=auth.uid()and p.session_id=(auth.jwt()->>'session_id')::uuid
  and p.created_at<=clock_timestamp()and p.expires_at>clock_timestamp()
  and auth.jwt()->>'role'='authenticated'and(auth.jwt()->>'exp')::numeric>extract(epoch from clock_timestamp())
  and exists(select 1 from auth.sessions s where s.id=p.session_id and s.user_id=p.inspector_id and(s.not_after is null or s.not_after>clock_timestamp())),false);
exception when others then return false;end$function$;

-- Function audio_reserve_scoped
CREATE OR REPLACE FUNCTION private.audio_reserve_scoped(p_company uuid, p_conversation uuid, p_client text, p_digest text, p_bytes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p private.audio_producer_permit;reserved jsonb;a private.attachment_catalog;
begin
 perform 1 from private.audio_pilot_scope where singleton for share;
 select*into p from private.audio_producer_permit where singleton for update;
 if not found or not private.audio_producer_allowed(p_company)then raise exception 'Audio unavailable';end if;
 if p.conversation_id is distinct from p_conversation or p.client_id is distinct from p_client or p.expected_digest is distinct from p_digest or p.expected_bytes is distinct from p_bytes then raise exception 'Audio unavailable';end if;
 if not private.audio_producer_allowed(p_company)then raise exception 'Audio unavailable';end if;
 if exists(select 1 from private.audio_inspectors where user_id=auth.uid())then raise exception 'Audio unavailable';end if;
 -- Pilot-wide hard cap, including rejected/expired rows until a reviewed retention operation.
 perform pg_catalog.pg_advisory_xact_lock(2147483000,1);
 if not exists(select 1 from private.attachment_catalog where company_id=p_company and conversation_id=p_conversation and sender_id=auth.uid()and client_upload_id=p_client)
   and(select count(*)from private.attachment_catalog)>=256 then raise exception 'Audio unavailable';end if;
 if p.phase='armed'and exists(select 1 from private.attachment_catalog where company_id=p_company and conversation_id=p_conversation and sender_id=auth.uid()and client_upload_id=p_client)then raise exception 'Audio unavailable';end if;
 reserved:=private.audio_catalog_reserve(p_company,p_conversation,p_client,p_digest,p_bytes);
 select * into strict a from private.attachment_catalog where id=(reserved->'row'->>'id')::uuid;
 if a.session_id is distinct from p.session_id or encode(a.expected_sha256,'hex')<>p.expected_digest or a.expected_bytes<>p.expected_bytes or a.valid_until<=clock_timestamp()or(p.attachment_id is not null and p.attachment_id<>a.id)then raise exception 'Audio unavailable';end if;
 update private.audio_producer_permit set attachment_id=a.id,phase=case when phase='armed'then'reserved'else phase end where singleton;
 return reserved||jsonb_build_object('upload',case when a.state='reserved'then jsonb_build_object('bucket','connect-private-attachments','objectKey',a.object_name,'validUntil',least(a.valid_until,a.created_at+interval'5 minutes'))else null end);
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$function$;

-- Function audio_storage_insert
CREATE OR REPLACE FUNCTION private.audio_storage_insert(p_bucket text, p_name text, p_owner text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$begin
 return p_bucket='connect-private-attachments'and p_owner=auth.uid()::text and private.active_actor()
  and not exists(select 1 from private.audio_inspectors where user_id=auth.uid())
  and exists(select 1 from private.attachment_catalog a where a.object_name=p_name and a.media_kind='audio'and private.audio_producer_allowed(a.company_id)and exists(select 1 from private.audio_producer_permit p where p.singleton and p.phase='reserved'and p.attachment_id=a.id and p.conversation_id=a.conversation_id and p.client_id=a.client_upload_id and p.expected_digest=encode(a.expected_sha256,'hex')and p.expected_bytes=a.expected_bytes)and a.state='reserved'
   and a.sender_id=auth.uid()and a.session_id::text=auth.jwt()->>'session_id'and least(a.valid_until,a.created_at+interval'5 minutes')>clock_timestamp()
   and private.can_read_conversation(a.company_id,a.conversation_id));
 exception when others then return false;end$function$;

-- Function audio_storage_leased
CREATE OR REPLACE FUNCTION private.audio_storage_leased(p_bucket text, p_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$begin
 return p_bucket='connect-private-attachments'and storage.allow_only_operation('s3.object.get')and private.audio_inspector_active()
  and exists(select 1 from private.audio_inspection_jobs j join private.attachment_catalog a on a.id=j.attachment_id
   where a.object_name=p_name and a.state='uploaded'and a.media_kind='audio'and exists(select 1 from private.audio_one_task_permit p where p.singleton and p.enabled and p.phase='leased'and p.attachment_id=a.id and p.inspector_id=auth.uid()and p.session_id=(auth.jwt()->>'session_id')::uuid and p.expires_at>clock_timestamp())and private.audio_pilot_allowed(a.company_id)and a.valid_until>clock_timestamp()and a.company_id=(select company_id from private.audio_inspectors where user_id=auth.uid())
   and j.inspector_id=auth.uid()and j.session_id::text=auth.jwt()->>'session_id'and j.valid_until>clock_timestamp()and j.result is null
   and exists(select 1 from auth.sessions s where s.id=a.session_id and s.user_id=a.sender_id and(s.not_after is null or s.not_after>clock_timestamp()))
   and exists(select 1 from private.accounts x where x.user_id=a.sender_id and x.state='active')
   and exists(select 1 from private.company_controls c where c.company_id=a.company_id and c.state='active')
   and exists(select 1 from public.memberships m join public.conversations c on c.id=a.conversation_id and c.company_id=a.company_id
      where m.company_id=a.company_id and m.user_id=a.sender_id and m.state='active'and(m.role='staff'or(m.role='patient'and c.patient_id=a.sender_id))));
 exception when others then return false;end$function$;

