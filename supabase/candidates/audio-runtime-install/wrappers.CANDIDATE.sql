create function public.send_connect_audio_message_v1(p_company uuid,p_conversation uuid,p_client text,p_attachment uuid)returns jsonb
language sql security invoker set search_path=''as $$select private.audio_message_send(p_company,p_conversation,p_client,p_attachment)$$;
create function public.lookup_connect_audio_message_v1(p_company uuid,p_conversation uuid,p_client text,p_attachment uuid)returns jsonb
language sql security invoker set search_path=''as $$select private.audio_message_lookup(p_company,p_conversation,p_client,p_attachment)$$;
revoke all on function public.send_connect_audio_message_v1(uuid,uuid,text,uuid),public.lookup_connect_audio_message_v1(uuid,uuid,text,uuid)from public,anon,authenticated,service_role;
