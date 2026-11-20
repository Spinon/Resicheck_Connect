-- Closed image worker/policy extension. Requires image core + catalog; no bucket, identity or grant.
CREATE TABLE private.image_worker_settings(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false,storage_enabled boolean NOT NULL DEFAULT false,decoder_image text CHECK(decoder_image ~ '^sha256:[a-f0-9]{64}$'));
INSERT INTO private.image_worker_settings VALUES(true,false,false,NULL);
CREATE TABLE private.image_inspectors(user_id uuid PRIMARY KEY REFERENCES auth.users(id),company_id uuid NOT NULL REFERENCES public.companies(id),enabled boolean NOT NULL DEFAULT false,valid_until timestamptz NOT NULL);
CREATE TABLE private.image_inspection_jobs(attachment_id uuid PRIMARY KEY REFERENCES private.attachment_catalog(id),lease_id uuid NOT NULL UNIQUE,inspector_id uuid NOT NULL REFERENCES private.image_inspectors(user_id),session_id uuid NOT NULL,valid_until timestamptz NOT NULL,decoder_image text NOT NULL,attempts integer NOT NULL CHECK(attempts BETWEEN 1 AND 3),result jsonb);
CREATE TABLE private.image_lease_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),attachment_id uuid NOT NULL REFERENCES private.attachment_catalog(id),lease_id uuid NOT NULL,event text NOT NULL CHECK(event IN('claimed','finished')),proof_sha256 bytea,occurred_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE private.image_worker_settings ENABLE ROW LEVEL SECURITY;ALTER TABLE private.image_worker_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE private.image_inspectors ENABLE ROW LEVEL SECURITY;ALTER TABLE private.image_inspectors FORCE ROW LEVEL SECURITY;
ALTER TABLE private.image_inspection_jobs ENABLE ROW LEVEL SECURITY;ALTER TABLE private.image_inspection_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE private.image_lease_events ENABLE ROW LEVEL SECURITY;ALTER TABLE private.image_lease_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.image_worker_settings,private.image_inspectors,private.image_inspection_jobs,private.image_lease_events FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.image_inspector_identity_guard()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(new.user_id::text,57101));
 IF TG_TABLE_NAME='image_inspectors'THEN
  IF EXISTS(SELECT 1 FROM private.accounts WHERE user_id=new.user_id AND state='active')OR EXISTS(SELECT 1 FROM public.memberships WHERE user_id=new.user_id)OR EXISTS(SELECT 1 FROM private.audio_inspectors WHERE user_id=new.user_id)THEN RAISE EXCEPTION 'Image identity unavailable';END IF;
 ELSIF TG_TABLE_NAME='accounts'THEN
  IF new.state='active'AND EXISTS(SELECT 1 FROM private.image_inspectors WHERE user_id=new.user_id)THEN RAISE EXCEPTION 'Image identity unavailable';END IF;
 ELSIF EXISTS(SELECT 1 FROM private.image_inspectors WHERE user_id=new.user_id)THEN RAISE EXCEPTION 'Image identity unavailable';END IF;
 RETURN new;
END$$;
CREATE TRIGGER image_inspector_identity BEFORE INSERT OR UPDATE ON private.image_inspectors FOR EACH ROW EXECUTE FUNCTION private.image_inspector_identity_guard();
CREATE TRIGGER image_inspector_account BEFORE INSERT OR UPDATE ON private.accounts FOR EACH ROW EXECUTE FUNCTION private.image_inspector_identity_guard();
CREATE TRIGGER image_inspector_membership BEFORE INSERT OR UPDATE ON public.memberships FOR EACH ROW EXECUTE FUNCTION private.image_inspector_identity_guard();
CREATE FUNCTION private.image_inspector_active()RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''AS $$BEGIN
 RETURN auth.jwt()->>'role'='authenticated'AND(auth.jwt()->>'exp')::numeric>extract(epoch FROM clock_timestamp())
 AND EXISTS(SELECT 1 FROM private.image_worker_settings w JOIN private.image_settings x ON x.singleton AND x.enabled WHERE w.singleton AND w.enabled AND w.decoder_image IS NOT NULL)
 AND EXISTS(SELECT 1 FROM private.image_inspectors i JOIN auth.sessions s ON s.user_id=i.user_id JOIN private.company_controls c ON c.company_id=i.company_id AND c.state='active' WHERE i.user_id=auth.uid()AND i.enabled AND i.valid_until>clock_timestamp()AND s.id=(auth.jwt()->>'session_id')::uuid AND(s.not_after IS NULL OR s.not_after>clock_timestamp()))
 AND NOT EXISTS(SELECT 1 FROM private.accounts WHERE user_id=auth.uid()AND state='active')AND NOT EXISTS(SELECT 1 FROM public.memberships WHERE user_id=auth.uid())AND NOT EXISTS(SELECT 1 FROM private.audio_inspectors WHERE user_id=auth.uid());
EXCEPTION WHEN OTHERS THEN RETURN false;END$$;
CREATE FUNCTION private.image_claim(p_attachment uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$
DECLARE a private.attachment_catalog;j private.image_inspection_jobs;i private.image_inspectors;pin text;until_at timestamptz;
BEGIN
 SELECT * INTO STRICT i FROM private.image_inspectors WHERE user_id=auth.uid()FOR UPDATE;
 IF NOT private.image_inspector_active()THEN RAISE EXCEPTION 'Image unavailable';END IF;
 SELECT decoder_image INTO STRICT pin FROM private.image_worker_settings WHERE singleton;
 IF EXISTS(SELECT 1 FROM private.image_inspection_jobs WHERE inspector_id=i.user_id AND result IS NULL AND valid_until>clock_timestamp()AND attachment_id<>p_attachment)THEN RAISE EXCEPTION 'Image unavailable';END IF;
 SELECT * INTO STRICT a FROM private.attachment_catalog WHERE id=p_attachment AND media_kind='image'AND company_id=i.company_id;
 IF NOT private.attachment_author_lock(a.sender_id,a.company_id,a.conversation_id,a.session_id,a.valid_until)THEN RAISE EXCEPTION 'Image unavailable';END IF;
 SELECT * INTO STRICT a FROM private.attachment_catalog WHERE id=p_attachment AND state='uploaded'AND observed_sha256=expected_sha256 AND observed_bytes=expected_bytes FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='connect-private-images'AND name=a.object_name AND owner_id=a.sender_id::text)THEN RAISE EXCEPTION 'Image unavailable';END IF;
 SELECT * INTO j FROM private.image_inspection_jobs WHERE attachment_id=a.id FOR UPDATE;
 IF FOUND AND j.result IS NOT NULL THEN RAISE EXCEPTION 'Image unavailable';END IF;
 IF j.valid_until>clock_timestamp()THEN
  IF j.inspector_id<>i.user_id OR j.session_id::text IS DISTINCT FROM auth.jwt()->>'session_id'OR j.decoder_image<>pin THEN RAISE EXCEPTION 'Image unavailable';END IF;
 ELSE
  IF j.attempts>=3 THEN RAISE EXCEPTION 'Image unavailable';END IF;
  until_at:=least(clock_timestamp()+interval'30 seconds',a.valid_until,i.valid_until,to_timestamp((auth.jwt()->>'exp')::double precision));
  INSERT INTO private.image_inspection_jobs VALUES(a.id,gen_random_uuid(),i.user_id,(auth.jwt()->>'session_id')::uuid,until_at,pin,1,NULL)
  ON CONFLICT(attachment_id)DO UPDATE SET lease_id=excluded.lease_id,inspector_id=excluded.inspector_id,session_id=excluded.session_id,valid_until=excluded.valid_until,decoder_image=excluded.decoder_image,attempts=private.image_inspection_jobs.attempts+1,result=NULL RETURNING * INTO j;
  INSERT INTO private.image_lease_events(attachment_id,lease_id,event)VALUES(a.id,j.lease_id,'claimed');
 END IF;
 RETURN jsonb_build_object('attachmentId',a.id,'leaseId',j.lease_id,'validUntil',j.valid_until,'companyId',a.company_id,'conversationId',a.conversation_id,'objectKey',a.object_name,'sha256',encode(a.expected_sha256,'hex'),'byteLength',a.expected_bytes,'decoderImage',j.decoder_image);
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING errcode='P0001',message='Image unavailable';END$$;
CREATE FUNCTION private.image_finish(p_attachment uuid,p_lease uuid,p_digest text,p_bytes integer,p_pass boolean,p_type text,p_width integer,p_height integer,p_decoder text)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$
DECLARE a private.attachment_catalog;j private.image_inspection_jobs;proof jsonb;r jsonb;
BEGIN
 PERFORM 1 FROM private.image_inspectors WHERE user_id=auth.uid()FOR UPDATE;
 IF NOT private.image_inspector_active()OR p_lease IS NULL OR p_pass IS NULL THEN RAISE EXCEPTION 'Image unavailable';END IF;
 SELECT * INTO STRICT a FROM private.attachment_catalog WHERE id=p_attachment AND media_kind='image'AND company_id=(SELECT company_id FROM private.image_inspectors WHERE user_id=auth.uid());
 IF NOT private.attachment_author_lock(a.sender_id,a.company_id,a.conversation_id,a.session_id,a.valid_until)THEN RAISE EXCEPTION 'Image unavailable';END IF;
 SELECT * INTO STRICT a FROM private.attachment_catalog WHERE id=p_attachment FOR UPDATE;
 SELECT * INTO STRICT j FROM private.image_inspection_jobs WHERE attachment_id=a.id FOR UPDATE;
 IF j.lease_id IS DISTINCT FROM p_lease OR j.inspector_id<>auth.uid()OR j.session_id::text IS DISTINCT FROM auth.jwt()->>'session_id'OR j.valid_until<=clock_timestamp()OR j.decoder_image IS DISTINCT FROM p_decoder OR p_decoder IS DISTINCT FROM(SELECT decoder_image FROM private.image_worker_settings WHERE singleton)THEN RAISE EXCEPTION 'Image unavailable';END IF;
 proof:=jsonb_build_object('sha256',p_digest,'byteLength',p_bytes,'pass',p_pass,'mime',p_type,'width',p_width,'height',p_height,'decoderImage',p_decoder);
 IF j.result IS NOT NULL THEN
  IF j.result<>proof THEN RAISE EXCEPTION 'Image unavailable';END IF;
  RETURN jsonb_build_object('state',a.state);
 END IF;
 IF a.state<>'uploaded'OR NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='connect-private-images'AND name=a.object_name AND owner_id=a.sender_id::text)THEN RAISE EXCEPTION 'Image unavailable';END IF;
 r:=private.image_record_inspection(a.id,p_digest,p_bytes,p_pass,p_type,p_width,p_height);
 UPDATE private.image_inspection_jobs SET result=proof WHERE attachment_id=a.id;
 INSERT INTO private.image_lease_events(attachment_id,lease_id,event,proof_sha256)VALUES(a.id,j.lease_id,'finished',sha256(convert_to(proof::text,'UTF8')));
 RETURN r;
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING errcode='P0001',message='Image unavailable';END$$;
CREATE FUNCTION public.claim_connect_image_inspection_v1(p_attachment uuid)RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''AS $$SELECT private.image_claim(p_attachment)$$;
CREATE FUNCTION public.finish_connect_image_inspection_v1(p_attachment uuid,p_lease uuid,p_digest text,p_bytes integer,p_pass boolean,p_type text,p_width integer,p_height integer,p_decoder text)RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''AS $$SELECT private.image_finish(p_attachment,p_lease,p_digest,p_bytes,p_pass,p_type,p_width,p_height,p_decoder)$$;
CREATE FUNCTION private.image_storage_allow(p_bucket text,p_name text,p_owner text,p_write boolean)RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''AS $$
DECLARE a private.attachment_catalog;j private.image_inspection_jobs;metadata_op boolean;get_op boolean;
BEGIN
 IF p_bucket IS DISTINCT FROM'connect-private-images'OR NOT EXISTS(SELECT 1 FROM private.image_worker_settings WHERE singleton AND storage_enabled)THEN RETURN false;END IF;
 SELECT * INTO STRICT a FROM private.attachment_catalog WHERE object_name=p_name AND media_kind='image'AND expected_bytes BETWEEN 1 AND 4194304;
 IF p_write THEN
  RETURN storage.allow_only_operation('object.upload')AND p_owner=auth.uid()::text AND a.sender_id=auth.uid()AND a.session_id::text=auth.jwt()->>'session_id'AND a.state='reserved'AND private.active_actor()AND private.can_read_conversation(a.company_id,a.conversation_id)AND private.attachment_author_lock(a.sender_id,a.company_id,a.conversation_id,a.session_id,a.valid_until)AND EXISTS(SELECT 1 FROM private.image_settings WHERE singleton AND enabled);
 END IF;
 metadata_op:=storage.allow_only_operation('object.get_authenticated_info')OR storage.allow_only_operation('object.head_authenticated_info');
 get_op:=storage.allow_only_operation('object.get_authenticated');
 IF a.message_id IS NULL AND a.state IN('reserved','uploaded')AND a.sender_id=auth.uid()AND a.session_id::text=auth.jwt()->>'session_id'AND(metadata_op OR get_op)THEN
  RETURN private.active_actor()AND private.can_read_conversation(a.company_id,a.conversation_id)AND private.attachment_author_lock(a.sender_id,a.company_id,a.conversation_id,a.session_id,a.valid_until)AND EXISTS(SELECT 1 FROM private.image_settings WHERE singleton AND enabled);
 END IF;
 IF storage.allow_only_operation('s3.object.get')OR storage.allow_only_operation('s3.object.info')THEN
  IF a.state='uploaded'AND private.image_inspector_active()AND a.company_id=(SELECT company_id FROM private.image_inspectors WHERE user_id=auth.uid())THEN
   SELECT * INTO STRICT j FROM private.image_inspection_jobs WHERE attachment_id=a.id AND inspector_id=auth.uid()AND session_id::text=auth.jwt()->>'session_id'AND valid_until>clock_timestamp()AND result IS NULL AND decoder_image=(SELECT decoder_image FROM private.image_worker_settings WHERE singleton);
   RETURN private.attachment_author_lock(a.sender_id,a.company_id,a.conversation_id,a.session_id,a.valid_until);
  ELSIF a.state='ready'AND a.message_id IS NOT NULL THEN
   PERFORM private.image_message_resolve(a.company_id,a.conversation_id,a.message_id);RETURN true;
  END IF;
 END IF;
 RETURN false;
EXCEPTION WHEN OTHERS THEN RETURN false;END$$;
-- POLICY_ACTIVATION_BOUNDARY
-- Apply only in the separate transaction that grants the predicate.
-- Other buckets short-circuit before invoking an ungranted image function.
CREATE POLICY image_bucket_role_select ON storage.objects AS RESTRICTIVE FOR SELECT TO PUBLIC USING(current_user='authenticated'OR bucket_id<>'connect-private-images');
CREATE POLICY image_bucket_role_insert ON storage.objects AS RESTRICTIVE FOR INSERT TO PUBLIC WITH CHECK(current_user='authenticated'OR bucket_id<>'connect-private-images');
CREATE POLICY image_bucket_select_fence ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(CASE WHEN bucket_id='connect-private-images'THEN private.image_storage_allow(bucket_id,name,owner_id,false)ELSE true END);
CREATE POLICY image_bucket_select ON storage.objects FOR SELECT TO authenticated USING(CASE WHEN bucket_id='connect-private-images'THEN private.image_storage_allow(bucket_id,name,owner_id,false)ELSE false END);
CREATE POLICY image_bucket_insert_fence ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(CASE WHEN bucket_id='connect-private-images'THEN private.image_storage_allow(bucket_id,name,owner_id,true)ELSE true END);
CREATE POLICY image_bucket_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(CASE WHEN bucket_id='connect-private-images'THEN private.image_storage_allow(bucket_id,name,owner_id,true)ELSE false END);
CREATE POLICY image_bucket_update_fence ON storage.objects AS RESTRICTIVE FOR UPDATE TO PUBLIC USING(bucket_id<>'connect-private-images')WITH CHECK(bucket_id<>'connect-private-images');
CREATE POLICY image_bucket_delete_fence ON storage.objects AS RESTRICTIVE FOR DELETE TO PUBLIC USING(bucket_id<>'connect-private-images');
REVOKE ALL ON FUNCTION private.image_inspector_identity_guard(),private.image_inspector_active(),private.image_claim(uuid),private.image_finish(uuid,uuid,text,integer,boolean,text,integer,integer,text),public.claim_connect_image_inspection_v1(uuid),public.finish_connect_image_inspection_v1(uuid,uuid,text,integer,boolean,text,integer,integer,text),private.image_storage_allow(text,text,text,boolean) FROM PUBLIC,anon,authenticated,service_role;
