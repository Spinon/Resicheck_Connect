-- LOCAL CLOSED extension; user-only catalog RPCs. No inspection/publication bypass, grants, pool or Auth changes.
BEGIN;
CREATE FUNCTION public.authorize_connect_image_transfer_v1(p_company uuid,p_conversation uuid)RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''AS $$SELECT private.image_catalog_authorize(p_company,p_conversation)$$;
REVOKE ALL ON FUNCTION public.authorize_connect_image_transfer_v1(uuid,uuid)FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.status_connect_image_transfer_v1(p_company uuid,p_conversation uuid,p_client text,p_digest text,p_bytes integer,p_mode text,p_type text,p_profile text)RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''AS $$SELECT private.image_catalog_status(p_company,p_conversation,p_client,p_digest,p_bytes,p_mode,p_type,p_profile)$$;
REVOKE ALL ON FUNCTION public.status_connect_image_transfer_v1(uuid,uuid,text,text,integer,text,text,text)FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.resolve_connect_image_upload_v1(p_company uuid,p_conversation uuid,p_attachment uuid)RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''AS $$SELECT private.image_catalog_resolve_upload(p_company,p_conversation,p_attachment)$$;
REVOKE ALL ON FUNCTION public.resolve_connect_image_upload_v1(uuid,uuid,uuid)FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.record_connect_image_upload_v1(p_company uuid,p_conversation uuid,p_attachment uuid,p_content bytea)RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''AS $$SELECT private.image_catalog_record_uploaded(p_company,p_conversation,p_attachment,p_content)$$;
REVOKE ALL ON FUNCTION public.record_connect_image_upload_v1(uuid,uuid,uuid,bytea)FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION public.read_connect_image_transfer_descriptor_v1(p_company uuid,p_conversation uuid,p_message uuid)RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''AS $$SELECT private.image_catalog_resolve_read(p_company,p_conversation,p_message)$$;
REVOKE ALL ON FUNCTION public.read_connect_image_transfer_descriptor_v1(uuid,uuid,uuid)FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
