begin;set local lock_timeout='3s';set local statement_timeout='25s';select pg_advisory_xact_lock(900001,560);
DO $$BEGIN IF current_user<>'postgres'OR session_user<>'postgres'OR has_schema_privilege('postgres','private','CREATE')OR EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid='connect_hmac_registration'::regrole AND(set_option OR inherit_option))OR EXISTS(SELECT 1 FROM auth.sessions WHERE user_id IN(SELECT user_id FROM private.audio_inspectors WHERE enabled))OR EXISTS(SELECT 1 FROM private.audio_inspection_jobs WHERE result IS NULL AND valid_until>clock_timestamp())OR encode(sha256(convert_to((select prosrc from pg_proc where oid='private.audio_attachment_v1_claim()'::regprocedure),'UTF8')),'hex')<>'c5c8758040ebe25f60a6f1f3f8c8f902b48b1b3c7da56e814e54d0e6c0ca19a2' OR encode(sha256(convert_to((select prosrc from pg_proc where oid='private.audio_reserve_scoped(uuid,uuid,text,text,integer)'::regprocedure),'UTF8')),'hex')<>'349d3120d841b73bd44bad6aba51c4ffc91eb3d316e704206c5661a5d9dd02ff' THEN RAISE EXCEPTION 'Stop/logout/audit old inspector before normal operation';END IF;END$$;
CREATE TEMP TABLE audio_normal_before ON COMMIT DROP AS SELECT (SELECT nspacl FROM pg_namespace WHERE nspname='private')schema_acl,(SELECT jsonb_agg(to_jsonb(m)ORDER BY member,grantor)FROM pg_auth_members m WHERE roleid='connect_hmac_registration'::regrole)members,(SELECT jsonb_agg(jsonb_build_object('oid',oid,'acl',proacl,'owner',proowner,'definer',prosecdef,'config',proconfig)ORDER BY oid)FROM pg_proc WHERE oid IN('private.audio_reserve_scoped(uuid,uuid,text,text,integer)'::regprocedure,'private.audio_attachment_v1_claim()'::regprocedure))function_acl;
GRANT connect_hmac_registration TO postgres WITH INHERIT FALSE,SET TRUE;SET LOCAL ROLE connect_hmac_registration;GRANT CREATE ON SCHEMA private TO postgres;SET LOCAL ROLE postgres;
ALTER TABLE private.audio_attachment_scopes DROP CONSTRAINT audio_attachment_scopes_check,ADD CONSTRAINT audio_attachment_scopes_check CHECK(expires_at>created_at AND(expires_at<=created_at+interval'7days'OR(NOT fixture_required AND expires_at='infinity'::timestamptz)));
CREATE OR REPLACE FUNCTION private.audio_attachment_v1_claim()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare a private.attachment_catalog;j private.audio_inspection_jobs;claimed boolean;next_company uuid;
begin
 -- Serialize the dedicated inspector; keep the company pinned while any lease is live.
 PERFORM 1 FROM private.audio_inspectors WHERE user_id=auth.uid()FOR UPDATE;
 IF auth.jwt()->>'role'IS DISTINCT FROM'authenticated'OR coalesce((auth.jwt()->>'exp')::numeric,0)<=extract(epoch FROM clock_timestamp())OR NOT EXISTS(SELECT 1 FROM private.audio_inspectors WHERE user_id=auth.uid()AND enabled AND valid_until>clock_timestamp())OR EXISTS(SELECT 1 FROM private.accounts WHERE user_id=auth.uid()AND state='active')OR EXISTS(SELECT 1 FROM public.memberships WHERE user_id=auth.uid())OR NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=(auth.jwt()->>'session_id')::uuid AND user_id=auth.uid()AND(not_after IS NULL OR not_after>clock_timestamp()))THEN RAISE EXCEPTION 'Audio unavailable';END IF;
 IF NOT EXISTS(SELECT 1 FROM private.audio_inspection_jobs WHERE inspector_id=auth.uid()AND valid_until>clock_timestamp()AND result IS NULL)THEN
  SELECT c.company_id INTO next_company FROM private.attachment_catalog c
  JOIN private.audio_attachment_scopes s ON s.company_id=c.company_id AND s.enabled AND NOT s.fixture_required AND s.created_at<=clock_timestamp()AND s.expires_at>clock_timestamp()
  JOIN private.company_controls cc ON cc.company_id=c.company_id AND cc.state='active'
  LEFT JOIN private.audio_inspection_jobs queued ON queued.attachment_id=c.id
  WHERE c.media_kind='audio'AND c.state='uploaded'AND c.valid_until>clock_timestamp()
  AND(queued.attachment_id IS NULL OR(queued.valid_until<=clock_timestamp()AND queued.attempts<3 AND queued.result IS NULL))
  ORDER BY c.created_at,c.id LIMIT 1;
  IF FOUND AND next_company IS DISTINCT FROM(SELECT company_id FROM private.audio_inspectors WHERE user_id=auth.uid())THEN UPDATE private.audio_inspectors SET company_id=next_company WHERE user_id=auth.uid();END IF;
 END IF;
 IF private.audio_attachment_mode_allowed((select company_id from private.audio_inspectors where user_id=auth.uid())) IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Audio unavailable'; END IF;
 IF private.audio_attachment_fixture_session((select company_id from private.audio_inspectors where user_id=auth.uid()),NULL,'inspector') IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Audio unavailable'; END IF;

 perform 1 from private.audio_inspectors where user_id=auth.uid()for update;
 if not private.audio_inspector_active()then raise exception 'Audio unavailable';end if;
 -- Lock the machine identity before assigning work: concurrent calls cannot issue
 -- two live leases to the same identity. A lost claim reply reuses the exact lease.
 select * into j from private.audio_inspection_jobs where inspector_id=auth.uid()and valid_until>clock_timestamp()and result is null;
 if found then
  if private.audio_attachment_fixture_session((select company_id from private.audio_inspectors where user_id=auth.uid()),j.attachment_id,'inspector')IS DISTINCT FROM TRUE then raise exception 'Audio unavailable';end if;
  if j.session_id::text is distinct from auth.jwt()->>'session_id'then raise exception 'Audio unavailable';end if;
  select * into strict a from private.attachment_catalog where id=j.attachment_id;
  if a.company_id is distinct from(select company_id from private.audio_inspectors where user_id=auth.uid())or a.state<>'uploaded'or not private.attachment_author_lock(a.sender_id,a.company_id,a.conversation_id,a.session_id,a.valid_until)then return null;end if;
 else
  claimed:=false;
  for a in select c.* from private.attachment_catalog c left join private.audio_inspection_jobs x on x.attachment_id=c.id
    where((select NOT fixture_required from private.audio_attachment_scopes where company_id=(select company_id from private.audio_inspectors where user_id=auth.uid()))OR c.id=(select attachment_id from private.audio_attachment_fixture where company_id=(select company_id from private.audio_inspectors where user_id=auth.uid())))and c.media_kind='audio'and c.state='uploaded'and c.valid_until>clock_timestamp()and c.company_id=(select company_id from private.audio_inspectors where user_id=auth.uid())
      and(x.attachment_id is null or(x.valid_until<=clock_timestamp()and x.attempts<3 and x.result is null))
    order by c.created_at,c.id limit 16
  loop
   if not private.attachment_author_lock(a.sender_id,a.company_id,a.conversation_id,a.session_id,a.valid_until)then continue;end if;
   select * into a from private.attachment_catalog where id=a.id and state='uploaded'for update skip locked;
   if not found then continue;end if;
   select * into j from private.audio_inspection_jobs where attachment_id=a.id for update;
   if found and(j.valid_until>clock_timestamp()or j.attempts>=3 or j.result is not null)then continue;end if;
   insert into private.audio_inspection_jobs(attachment_id,lease_id,inspector_id,session_id,valid_until,attempts)
     values(a.id,gen_random_uuid(),auth.uid(),(auth.jwt()->>'session_id')::uuid,least((select expires_at from private.audio_attachment_fixture where company_id=(select company_id from private.audio_inspectors where user_id=auth.uid())),(select expires_at from private.audio_attachment_scopes where company_id=(select company_id from private.audio_inspectors where user_id=auth.uid())),clock_timestamp()+interval'30 seconds',to_timestamp((auth.jwt()->>'exp')::double precision),a.valid_until),1)
     on conflict(attachment_id)do update set lease_id=excluded.lease_id,inspector_id=excluded.inspector_id,session_id=excluded.session_id,valid_until=excluded.valid_until,attempts=private.audio_inspection_jobs.attempts+1,result=null
     returning * into j;
   claimed:=true;exit;
  end loop;
  if not claimed then return null;end if;
 end if;
 return jsonb_build_object('leaseId',j.lease_id,'validUntil',j.valid_until,'attachmentId',a.id,'companyId',a.company_id,'conversationId',a.conversation_id,'objectKey',a.object_name,'sha256',encode(a.expected_sha256,'hex'),'byteLength',a.expected_bytes);
exception when others then raise exception using errcode='P0001',message='Audio unavailable';end$function$;
CREATE OR REPLACE FUNCTION private.audio_reserve_scoped(p_company uuid, p_conversation uuid, p_client text, p_digest text, p_bytes integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare p private.audio_producer_permit;reserved jsonb;a private.attachment_catalog;
begin
 -- An ordinary authorized conversation creates its own service scope once.
 -- An existing disabled scope is never re-enabled by an app user.
 IF NOT EXISTS(SELECT 1 FROM private.audio_attachment_scopes WHERE company_id=p_company)THEN
  IF NOT private.active_actor()OR NOT private.can_read_conversation(p_company,p_conversation)OR NOT EXISTS(SELECT 1 FROM private.company_controls WHERE company_id=p_company AND state='active')THEN RAISE EXCEPTION 'Audio unavailable';END IF;
  INSERT INTO private.audio_attachment_scopes(company_id,enabled,expires_at,fixture_required)VALUES(p_company,true,'infinity'::timestamptz,false)ON CONFLICT(company_id)DO NOTHING;
 END IF;
 IF private.audio_uses_attachment_mode(p_company) THEN RETURN private.audio_attachment_v1_reserve(p_company,p_conversation,p_client,p_digest,p_bytes); END IF;

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
INSERT INTO private.audio_attachment_scopes(company_id,enabled,expires_at,fixture_required)SELECT company_id,true,'infinity'::timestamptz,false FROM private.company_controls WHERE state='active'ON CONFLICT(company_id)DO UPDATE SET enabled=true,fixture_required=false,expires_at='infinity'::timestamptz;
UPDATE private.audio_inspectors SET valid_until='infinity'::timestamptz WHERE enabled;
SET LOCAL ROLE connect_hmac_registration;REVOKE CREATE ON SCHEMA private FROM postgres;SET LOCAL ROLE postgres;GRANT connect_hmac_registration TO postgres WITH INHERIT FALSE,SET FALSE;
DO $$BEGIN IF has_schema_privilege('postgres','private','CREATE')OR EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid='connect_hmac_registration'::regrole AND(set_option OR inherit_option))OR encode(sha256(convert_to((select prosrc from pg_proc where oid='private.audio_attachment_v1_claim()'::regprocedure),'UTF8')),'hex')<>'7bb7e64cf8ab1d6005e111d66dac4404b2e90293ed85459d60a19ca2efc8cabc' OR encode(sha256(convert_to((select prosrc from pg_proc where oid='private.audio_reserve_scoped(uuid,uuid,text,text,integer)'::regprocedure),'UTF8')),'hex')<>'80fb6fa165b42b87cc9dda3d7f1ee8dd94489a09f831a56680169a6bbb6e9d47' OR (SELECT schema_acl FROM pg_temp.audio_normal_before)IS DISTINCT FROM(SELECT nspacl FROM pg_namespace WHERE nspname='private')OR(SELECT members FROM pg_temp.audio_normal_before)IS DISTINCT FROM(SELECT jsonb_agg(to_jsonb(m)ORDER BY member,grantor)FROM pg_auth_members m WHERE roleid='connect_hmac_registration'::regrole)OR(SELECT function_acl FROM pg_temp.audio_normal_before)IS DISTINCT FROM(SELECT jsonb_agg(jsonb_build_object('oid',oid,'acl',proacl,'owner',proowner,'definer',prosecdef,'config',proconfig)ORDER BY oid)FROM pg_proc WHERE oid IN('private.audio_reserve_scoped(uuid,uuid,text,text,integer)'::regprocedure,'private.audio_attachment_v1_claim()'::regprocedure))THEN RAISE EXCEPTION 'Normal audio privileges differ';END IF;END$$;
-- AUDIO_NORMAL_BEFORE_COMMIT
commit;
