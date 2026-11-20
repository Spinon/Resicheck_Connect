
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
