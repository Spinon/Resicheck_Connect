CREATE OR REPLACE FUNCTION private.image_claim(p_attachment uuid)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$
DECLARE a private.attachment_catalog;j private.image_inspection_jobs;i private.image_inspectors;pin text;until_at timestamptz;g private.image_inspection_scopes;
BEGIN
 SELECT * INTO STRICT i FROM private.image_inspectors WHERE user_id=auth.uid()FOR UPDATE;
 g:=private.image_authorized_scope(p_attachment);
 SELECT decoder_image INTO STRICT pin FROM private.image_worker_settings WHERE singleton;
 IF EXISTS(SELECT 1 FROM private.image_inspection_jobs WHERE inspector_id=i.user_id AND result IS NULL AND valid_until>clock_timestamp()AND attachment_id<>p_attachment)THEN RAISE EXCEPTION 'Image unavailable';END IF;
 SELECT * INTO STRICT a FROM private.attachment_catalog WHERE id=p_attachment AND media_kind='image'AND company_id=i.company_id;
 IF NOT private.attachment_author_lock(a.sender_id,a.company_id,a.conversation_id,a.session_id,a.valid_until)THEN RAISE EXCEPTION 'Image unavailable';END IF;
 SELECT * INTO STRICT a FROM private.attachment_catalog WHERE id=p_attachment AND state='uploaded'AND observed_sha256=expected_sha256 AND observed_bytes=expected_bytes FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='connect-private-images'AND name=a.object_name AND owner_id=a.sender_id::text)THEN RAISE EXCEPTION 'Image unavailable';END IF;
 SELECT * INTO j FROM private.image_inspection_jobs WHERE attachment_id=a.id FOR UPDATE;
 IF FOUND AND j.result IS NOT NULL THEN RAISE EXCEPTION 'Image unavailable';END IF;
 IF j.valid_until>clock_timestamp()THEN
  IF j.scope_id IS DISTINCT FROM g.id OR j.inspector_id<>i.user_id OR j.session_id::text IS DISTINCT FROM auth.jwt()->>'session_id'OR j.decoder_image<>pin THEN RAISE EXCEPTION 'Image unavailable';END IF;
 ELSE
  IF j.attempts>=3 THEN RAISE EXCEPTION 'Image unavailable';END IF;
  until_at:=least(clock_timestamp()+interval'30 seconds',a.valid_until,i.valid_until,g.valid_until,to_timestamp((auth.jwt()->>'exp')::double precision));
  INSERT INTO private.image_inspection_jobs(attachment_id,lease_id,inspector_id,session_id,valid_until,decoder_image,attempts,result,scope_id)VALUES(a.id,gen_random_uuid(),i.user_id,(auth.jwt()->>'session_id')::uuid,until_at,pin,1,NULL,g.id)
  ON CONFLICT(attachment_id)DO UPDATE SET lease_id=excluded.lease_id,inspector_id=excluded.inspector_id,session_id=excluded.session_id,valid_until=excluded.valid_until,decoder_image=excluded.decoder_image,attempts=private.image_inspection_jobs.attempts+1,result=NULL,scope_id=excluded.scope_id RETURNING * INTO j;
  INSERT INTO private.image_lease_events(attachment_id,lease_id,event,scope_id)VALUES(a.id,j.lease_id,'claimed',g.id);
 END IF;
 RETURN jsonb_build_object('attachmentId',a.id,'leaseId',j.lease_id,'validUntil',j.valid_until,'companyId',a.company_id,'conversationId',a.conversation_id,'objectKey',a.object_name,'sha256',encode(a.expected_sha256,'hex'),'byteLength',a.expected_bytes,'decoderImage',j.decoder_image);
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING errcode='P0001',message='Image unavailable';END$$;
