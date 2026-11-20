-- LOCAL EXTENSION of the historical attachment catalog. No runtime grants or deployment.
begin;
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
commit;
