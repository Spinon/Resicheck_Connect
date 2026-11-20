-- LOCAL CANDIDATE ONLY. Not an installer for the managed Connect.
-- No operational grants; no image bucket, worker, Edge route or normal-client activation.
BEGIN;
SET LOCAL lock_timeout='3s';
ALTER TABLE public.messages DROP CONSTRAINT messages_kind_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_kind_check CHECK(kind IN('text','audio','image'));
ALTER TABLE public.messages DROP CONSTRAINT messages_kind_body_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_kind_body_check CHECK((kind='text' AND body IS NOT NULL)OR(kind IN('audio','image')AND body IS NULL));
CREATE TABLE private.image_settings(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false);
INSERT INTO private.image_settings VALUES(true,false);
CREATE TABLE private.image_metadata(
 attachment_id uuid PRIMARY KEY REFERENCES private.attachment_catalog(id), mode text NOT NULL CHECK(mode IN('original','optimized')),
 declared_type text NOT NULL CHECK(declared_type IN('image/png','image/jpeg')),profile text,
 width integer,height integer,inspection_version text,
 CHECK((mode='original'AND profile IS NULL)OR(mode='optimized'AND profile IS NOT NULL AND profile='candidate-document-3508-q90-v2')),
 CHECK((width IS NULL AND height IS NULL AND inspection_version IS NULL)OR(width IS NOT NULL AND height IS NOT NULL AND inspection_version IS NOT NULL AND width BETWEEN 1 AND 16384 AND height BETWEEN 1 AND 16384 AND width::bigint*height<=16000000 AND inspection_version='ffmpeg-9.0.2-image-single-v1'))
);
ALTER TABLE private.image_settings ENABLE ROW LEVEL SECURITY;ALTER TABLE private.image_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE private.image_metadata ENABLE ROW LEVEL SECURITY;ALTER TABLE private.image_metadata FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.image_settings,private.image_metadata FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.image_reserve(p_company uuid,p_conversation uuid,p_client text,p_digest text,p_bytes integer,p_mode text,p_type text,p_profile text)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb;m private.image_metadata;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.image_settings WHERE singleton AND enabled)OR p_digest IS NULL OR p_digest!~'^[a-f0-9]{64}$'OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 4194304 OR p_mode IS NULL OR p_mode NOT IN('original','optimized')OR p_type IS NULL OR p_type NOT IN('image/png','image/jpeg')
 OR(p_mode='original'AND p_profile IS NOT NULL)OR(p_mode='optimized'AND p_profile IS DISTINCT FROM'candidate-document-3508-q90-v2')THEN RAISE EXCEPTION 'Image unavailable';END IF;
 r:=private.attachment_reserve(p_company,p_conversation,p_client,'image',decode(p_digest,'hex'),p_bytes);
 INSERT INTO private.image_metadata(attachment_id,mode,declared_type,profile)VALUES((r->>'id')::uuid,p_mode,p_type,p_profile)ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT m FROM private.image_metadata WHERE attachment_id=(r->>'id')::uuid;
 IF m.mode<>p_mode OR m.declared_type<>p_type OR m.profile IS DISTINCT FROM p_profile THEN RAISE EXCEPTION 'Image unavailable';END IF;RETURN r;
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING errcode='P0001',message='Image unavailable';END$$;
-- TRUSTED SERVER ONLY, never grant this to a client. The real worker must hash
-- immutable downloaded bytes and decode them in its isolated process first.
CREATE FUNCTION private.image_record_inspection(p_attachment uuid,p_digest text,p_bytes integer,p_pass boolean,p_type text,p_width integer,p_height integer)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a private.attachment_catalog;m private.image_metadata;passed boolean;state text;
BEGIN
 SELECT * INTO STRICT a FROM private.attachment_catalog WHERE id=p_attachment AND media_kind='image';
 IF NOT private.attachment_author_lock(a.sender_id,a.company_id,a.conversation_id,a.session_id,a.valid_until)THEN RAISE EXCEPTION 'Image unavailable';END IF;
 SELECT * INTO STRICT a FROM private.attachment_catalog WHERE id=p_attachment FOR UPDATE;
 SELECT * INTO STRICT m FROM private.image_metadata WHERE attachment_id=a.id FOR UPDATE;
 IF p_digest IS NULL OR p_digest!~'^[a-f0-9]{64}$'OR p_bytes IS NULL OR p_bytes<>a.expected_bytes OR decode(p_digest,'hex')<>a.expected_sha256 OR p_bytes>4194304 THEN RAISE EXCEPTION 'Image unavailable';END IF;
 passed:=coalesce(p_pass AND p_type=m.declared_type AND p_type IN('image/png','image/jpeg')AND p_width BETWEEN 1 AND 16384 AND p_height BETWEEN 1 AND 16384 AND p_width::bigint*p_height<=16000000,false);
 IF a.state='ready' THEN
  IF NOT passed OR m.width IS DISTINCT FROM p_width OR m.height IS DISTINCT FROM p_height OR m.inspection_version IS DISTINCT FROM'ffmpeg-9.0.2-image-single-v1' THEN RAISE EXCEPTION 'Image unavailable';END IF;
  RETURN jsonb_build_object('state','ready');
 END IF;
 state:=private.attachment_inspect(a.id,decode(p_digest,'hex'),passed,p_type,NULL,'ffmpeg-9.0.2-image-single-v1');
 IF state='ready'THEN UPDATE private.image_metadata SET width=p_width,height=p_height,inspection_version='ffmpeg-9.0.2-image-single-v1'WHERE attachment_id=a.id;END IF;
 RETURN jsonb_build_object('state',state);
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING errcode='P0001',message='Image unavailable';END$$;

create table private.image_message_receipts(
 sender_id uuid not null references public.profiles(id),company_id uuid not null,conversation_id uuid not null,
 client_message_id text not null check(client_message_id~'^[A-Za-z0-9_-]{1,80}$'),
 attachment_id uuid not null unique references private.attachment_catalog(id),message_id uuid not null unique,
 primary key(sender_id,company_id,conversation_id,client_message_id),
 foreign key(company_id,conversation_id,message_id)references public.messages(company_id,conversation_id,id)
);
alter table private.image_message_receipts enable row level security;alter table private.image_message_receipts force row level security;
revoke all on private.image_message_receipts from public,anon,authenticated,service_role;
create function private.image_message_lookup(p_company uuid,p_conversation uuid,p_client text,p_attachment uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare m public.messages;r private.image_message_receipts;result jsonb;
begin
 perform private.lock_accounts(array[auth.uid()]);
 if not private.active_actor()or not private.can_read_conversation(p_company,p_conversation)or p_client is null or p_client!~'^[A-Za-z0-9_-]{1,80}$'or p_attachment is null then raise exception 'Image unavailable';end if;
 result:=jsonb_build_object('sender_id',auth.uid(),'company_id',p_company,'conversation_id',p_conversation,'client_message_id',p_client,'kind','image','attachment_id',p_attachment);
 select * into r from private.image_message_receipts where sender_id=auth.uid()and company_id=p_company and conversation_id=p_conversation and client_message_id=p_client;
 if not found then return result||jsonb_build_object('state','not_observed');end if;
 if r.attachment_id<>p_attachment then raise exception 'Image unavailable';end if;
 select * into strict m from public.messages where id=r.message_id and company_id=p_company and conversation_id=p_conversation and sender_id=auth.uid()and kind='image';
 return result||jsonb_build_object('state','accepted','receipt',jsonb_build_object('id',m.id,'sequence',m.sequence,'accepted_at',m.accepted_at));
exception when others then raise exception using errcode='P0001',message='Image unavailable';end$$;
create function private.image_message_send(p_company uuid,p_conversation uuid,p_client text,p_attachment uuid)returns jsonb
language plpgsql security definer set search_path=''as $$
declare c public.conversations;a private.attachment_catalog;m public.messages;seq bigint;role_name text;prior jsonb;
begin
 if not exists(select 1 from private.image_settings where singleton and enabled)then raise exception 'Image unavailable';end if;
 perform private.lock_accounts(array[auth.uid()]);
 if not private.active_actor()or not private.can_read_conversation(p_company,p_conversation)then raise exception 'Image unavailable';end if;
 select * into strict c from public.conversations where company_id=p_company and id=p_conversation for update;
 prior:=private.image_message_lookup(p_company,p_conversation,p_client,p_attachment);
 if prior->>'state'='accepted'then return prior;end if;
 select * into a from private.attachment_catalog where id=p_attachment and company_id=p_company and conversation_id=p_conversation and sender_id=auth.uid()for update;
 if not found or a.message_id is not null or a.media_kind<>'image'or a.state<>'ready'or (a.detected_type is null or a.detected_type not in('image/png','image/jpeg'))or a.duration_ms is not null or a.expected_bytes>4194304 or a.observed_bytes is distinct from a.expected_bytes or a.observed_sha256 is distinct from a.expected_sha256 then raise exception 'Image unavailable';end if;
 if a.session_id::text is distinct from auth.jwt()->>'session_id'or not private.attachment_author_lock(a.sender_id,a.company_id,a.conversation_id,a.session_id,a.valid_until)or not exists(select 1 from private.image_metadata x where x.attachment_id=a.id and x.width is not null and x.height is not null and x.inspection_version='ffmpeg-9.0.2-image-single-v1')then raise exception 'Image unavailable';end if;
 if private.has_role(p_company,'staff')then
  if c.patient_id=auth.uid()and private.has_role(p_company,'patient')then raise exception 'Image unavailable';end if;role_name:='staff';
 else role_name:='patient';end if;
 update public.conversations set last_sequence=last_sequence+1 where company_id=p_company and id=p_conversation returning last_sequence into seq;
 insert into public.messages(company_id,conversation_id,sender_id,sender_role,sequence,kind,body)values(p_company,p_conversation,auth.uid(),role_name,seq,'image',null)returning * into m;
 update private.attachment_catalog set message_id=m.id where id=a.id;
 insert into private.image_message_receipts values(auth.uid(),p_company,p_conversation,p_client,a.id,m.id);
 insert into private.audit_events(actor_id,company_id,action,target_id)values(auth.uid(),p_company,'message-accepted',m.id);
 return private.image_message_lookup(p_company,p_conversation,p_client,p_attachment);
exception when others then raise exception using errcode='P0001',message='Image unavailable';end$$;
revoke all on function private.image_message_lookup(uuid,uuid,text,uuid),private.image_message_send(uuid,uuid,text,uuid)from public,anon,authenticated;

create function private.read_messages_projection_v3(p_company uuid,p_conversation uuid,p_before bigint,p_after bigint,p_limit integer)returns jsonb
language plpgsql stable security definer set search_path=''as $$
declare result jsonb;
begin
 if not private.active_actor()or not private.can_read_conversation(p_company,p_conversation)or p_limit is null or p_limit not between 1 and 100 or(p_before is not null and p_before<1)or(p_after is not null and p_after<0)or(p_before is not null and p_after is not null)then raise exception 'Message action unavailable';end if;
 with page as materialized(select m.*,case when exists(select 1 from private.message_removals_all g where g.message_id=m.id and g.company_id=p_company and g.conversation_id=p_conversation)then'all'when exists(select 1 from private.message_removals_self s where s.user_id=auth.uid()and s.message_id=m.id and s.company_id=p_company and s.conversation_id=p_conversation)then'self'else null end removed_scope
 from public.messages m where m.company_id=p_company and m.conversation_id=p_conversation and(p_before is null or m.sequence<p_before)and(p_after is null or m.sequence>p_after)
 order by case when p_after is not null then m.sequence end asc,case when p_after is null then m.sequence end desc limit p_limit)
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'company_id',company_id,'conversation_id',conversation_id,'sender_id',sender_id,'sender_role',sender_role,'sequence',sequence,
 'accepted_at',to_char(accepted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'kind',case when removed_scope is null then kind else'text'end,'body',case when removed_scope is null then body else'Mensagem removida'end,'important',case when removed_scope is null then important else false end,'removed_scope',removed_scope)
 order by case when p_after is not null then sequence end asc,case when p_after is null then sequence end desc),'[]'::jsonb)into result from page;
 return result;
exception when others then raise exception using errcode='P0001',message='Message action unavailable';end$$;

create function public.read_connect_messages_v3(p_company uuid,p_conversation uuid,p_before bigint default null,p_after bigint default null,p_limit integer default 25)returns jsonb language sql stable security invoker set search_path=''as $$select private.read_messages_projection_v3(p_company,p_conversation,p_before,p_after,p_limit)$$;
revoke all on function private.read_messages_projection_v3(uuid,uuid,bigint,bigint,integer),public.read_connect_messages_v3(uuid,uuid,bigint,bigint,integer)from public,anon,authenticated,service_role;

CREATE FUNCTION private.image_message_resolve(p_company uuid,p_conversation uuid,p_message uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a private.attachment_catalog;m private.image_metadata;
BEGIN
 PERFORM private.lock_accounts(ARRAY[auth.uid()]);
 IF NOT private.active_actor()OR NOT private.can_read_conversation(p_company,p_conversation)OR private.message_is_removed(p_company,p_conversation,p_message)THEN RAISE EXCEPTION 'Image unavailable';END IF;
 SELECT a0.* INTO STRICT a FROM private.attachment_catalog a0 JOIN public.messages msg ON msg.id=a0.message_id AND msg.company_id=a0.company_id AND msg.conversation_id=a0.conversation_id AND msg.sender_id=a0.sender_id JOIN private.image_message_receipts r ON r.message_id=msg.id AND r.attachment_id=a0.id
 WHERE msg.id=p_message AND msg.company_id=p_company AND msg.conversation_id=p_conversation AND msg.kind='image'AND a0.media_kind='image'AND a0.state='ready'AND a0.expected_bytes<=4194304 AND a0.observed_sha256=a0.expected_sha256 AND a0.observed_bytes=a0.expected_bytes;
 SELECT * INTO STRICT m FROM private.image_metadata WHERE attachment_id=a.id AND width IS NOT NULL AND height IS NOT NULL AND inspection_version='ffmpeg-9.0.2-image-single-v1';
 RETURN jsonb_build_object('companyId',p_company,'conversationId',p_conversation,'messageId',p_message,'attachmentId',a.id,'sha256',encode(a.expected_sha256,'hex'),'byteLength',a.expected_bytes,'mime',a.detected_type,'width',m.width,'height',m.height,'mode',m.mode);
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING errcode='P0001',message='Image unavailable';END$$;
CREATE FUNCTION public.reserve_connect_image_v1(p_company uuid,p_conversation uuid,p_client text,p_digest text,p_bytes integer,p_mode text,p_type text,p_profile text)RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''AS $$SELECT private.image_reserve(p_company,p_conversation,p_client,p_digest,p_bytes,p_mode,p_type,p_profile)$$;
CREATE FUNCTION public.send_connect_image_message_v1(p_company uuid,p_conversation uuid,p_client text,p_attachment uuid)RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''AS $$SELECT private.image_message_send(p_company,p_conversation,p_client,p_attachment)$$;
CREATE FUNCTION public.lookup_connect_image_message_v1(p_company uuid,p_conversation uuid,p_client text,p_attachment uuid)RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''AS $$SELECT private.image_message_lookup(p_company,p_conversation,p_client,p_attachment)$$;
CREATE FUNCTION public.resolve_connect_image_message_v1(p_company uuid,p_conversation uuid,p_message uuid)RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''AS $$SELECT private.image_message_resolve(p_company,p_conversation,p_message)$$;
REVOKE ALL ON FUNCTION private.image_reserve(uuid,uuid,text,text,integer,text,text,text),private.image_record_inspection(uuid,text,integer,boolean,text,integer,integer),private.image_message_lookup(uuid,uuid,text,uuid),private.image_message_send(uuid,uuid,text,uuid),private.image_message_resolve(uuid,uuid,uuid),public.reserve_connect_image_v1(uuid,uuid,text,text,integer,text,text,text),public.send_connect_image_message_v1(uuid,uuid,text,uuid),public.lookup_connect_image_message_v1(uuid,uuid,text,uuid),public.resolve_connect_image_message_v1(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
