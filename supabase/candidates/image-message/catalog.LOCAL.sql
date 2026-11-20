-- LOCAL EXTENSION ONLY. Requires image-message.CANDIDATE.sql. Not a managed installer.
-- Private backend helpers only; no grants, role creation, bucket or activation.
BEGIN;
CREATE FUNCTION private.image_catalog_authorize(p_company uuid,p_conversation uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$BEGIN
 PERFORM private.lock_accounts(ARRAY[auth.uid()]);
 IF NOT private.active_actor()OR NOT private.can_read_conversation(p_company,p_conversation)THEN RAISE EXCEPTION 'Image unavailable';END IF;
 RETURN jsonb_build_object('userId',auth.uid());
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING errcode='P0001',message='Image unavailable';END$$;
CREATE FUNCTION private.image_catalog_status(p_company uuid,p_conversation uuid,p_client text,p_digest text,p_bytes integer,p_mode text,p_type text,p_profile text)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$
DECLARE a private.attachment_catalog;m private.image_metadata;
BEGIN
 PERFORM private.image_catalog_authorize(p_company,p_conversation);
 SELECT * INTO STRICT a FROM private.attachment_catalog WHERE company_id=p_company AND conversation_id=p_conversation AND sender_id=auth.uid()AND client_upload_id=p_client AND media_kind='image';
 SELECT * INTO STRICT m FROM private.image_metadata WHERE attachment_id=a.id;
 IF a.session_id::text IS DISTINCT FROM auth.jwt()->>'session_id'OR p_digest IS NULL OR p_digest!~'^[a-f0-9]{64}$'OR encode(a.expected_sha256,'hex')<>p_digest OR a.expected_bytes IS DISTINCT FROM p_bytes OR p_bytes NOT BETWEEN 1 AND 4194304 OR m.mode IS DISTINCT FROM p_mode OR m.declared_type IS DISTINCT FROM p_type OR m.profile IS DISTINCT FROM p_profile THEN RAISE EXCEPTION 'Image unavailable';END IF;
 RETURN jsonb_build_object('companyId',p_company,'conversationId',p_conversation,'senderId',a.sender_id,'clientUploadId',a.client_upload_id,'sha256',p_digest,'byteLength',a.expected_bytes,'attachmentId',a.id,'state',CASE WHEN a.state IN('reserved','uploaded')THEN'quarantined'ELSE a.state END);
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING errcode='P0001',message='Image unavailable';END$$;
CREATE FUNCTION private.image_catalog_resolve_upload(p_company uuid,p_conversation uuid,p_attachment uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$
DECLARE a private.attachment_catalog;m private.image_metadata;
BEGIN
 PERFORM private.image_catalog_authorize(p_company,p_conversation);
 IF NOT EXISTS(SELECT 1 FROM private.image_settings WHERE singleton AND enabled)THEN RAISE EXCEPTION 'Image unavailable';END IF;
 SELECT * INTO STRICT a FROM private.attachment_catalog WHERE id=p_attachment AND company_id=p_company AND conversation_id=p_conversation AND sender_id=auth.uid()AND media_kind='image'AND state IN('reserved','uploaded')AND expected_bytes BETWEEN 1 AND 4194304;
 IF a.session_id::text IS DISTINCT FROM auth.jwt()->>'session_id'OR NOT private.attachment_author_lock(a.sender_id,a.company_id,a.conversation_id,a.session_id,a.valid_until)THEN RAISE EXCEPTION 'Image unavailable';END IF;
 SELECT * INTO STRICT m FROM private.image_metadata WHERE attachment_id=a.id;
 RETURN jsonb_build_object('attachmentId',a.id,'companyId',a.company_id,'conversationId',a.conversation_id,'objectKey',a.object_name,'sha256',encode(a.expected_sha256,'hex'),'byteLength',a.expected_bytes,'mime',m.declared_type);
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING errcode='P0001',message='Image unavailable';END$$;
CREATE FUNCTION private.image_catalog_record_uploaded(p_company uuid,p_conversation uuid,p_attachment uuid,p_content bytea)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$
DECLARE a private.attachment_catalog;m private.image_metadata;actual bytea;size integer;
BEGIN
 PERFORM private.image_catalog_resolve_upload(p_company,p_conversation,p_attachment);
 SELECT * INTO STRICT a FROM private.attachment_catalog WHERE id=p_attachment FOR UPDATE;
 IF p_content IS NULL OR octet_length(p_content)NOT BETWEEN 1 AND 4194304 OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='connect-private-images'AND name=a.object_name AND owner_id=a.sender_id::text)THEN RAISE EXCEPTION 'Image unavailable';END IF;
 actual:=sha256(p_content);size:=octet_length(p_content);
 IF actual<>a.expected_sha256 OR size<>a.expected_bytes THEN RAISE EXCEPTION 'Image unavailable';END IF;
 IF a.state='reserved'THEN
  UPDATE private.attachment_catalog SET observed_sha256=actual,observed_bytes=size,state='uploaded'WHERE id=a.id;
  INSERT INTO private.attachment_events(attachment_id,event)VALUES(a.id,'uploaded');
 ELSIF a.state<>'uploaded'OR a.observed_sha256 IS DISTINCT FROM actual OR a.observed_bytes IS DISTINCT FROM size THEN RAISE EXCEPTION 'Image unavailable';END IF;
 SELECT * INTO STRICT m FROM private.image_metadata WHERE attachment_id=a.id;
 RETURN private.image_catalog_status(p_company,p_conversation,a.client_upload_id,encode(a.expected_sha256,'hex'),a.expected_bytes,m.mode,m.declared_type,m.profile);
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING errcode='P0001',message='Image unavailable';END$$;
CREATE FUNCTION private.image_catalog_resolve_read(p_company uuid,p_conversation uuid,p_message uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$
DECLARE d jsonb;key text;
BEGIN
 d:=private.image_message_resolve(p_company,p_conversation,p_message);
 SELECT object_name INTO STRICT key FROM private.attachment_catalog WHERE id=(d->>'attachmentId')::uuid AND company_id=p_company AND conversation_id=p_conversation AND media_kind='image'AND state='ready';
 RETURN d||jsonb_build_object('objectKey',key);
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING errcode='P0001',message='Image unavailable';END$$;
REVOKE ALL ON FUNCTION private.image_catalog_authorize(uuid,uuid),private.image_catalog_status(uuid,uuid,text,text,integer,text,text,text),private.image_catalog_resolve_upload(uuid,uuid,uuid),private.image_catalog_record_uploaded(uuid,uuid,uuid,bytea),private.image_catalog_resolve_read(uuid,uuid,uuid)FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
