BEGIN;SET LOCAL lock_timeout='3s';SELECT pg_advisory_xact_lock(900001,520);

 DO $$BEGIN IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage'AND tablename='objects'AND policyname='image_bucket_select_fence')THEN
 ALTER POLICY image_bucket_select_fence ON storage.objects USING(bucket_id<>'connect-private-images');
 ALTER POLICY image_bucket_insert_fence ON storage.objects WITH CHECK(bucket_id<>'connect-private-images');
 ALTER POLICY image_bucket_select ON storage.objects USING(false);
 ALTER POLICY image_bucket_insert ON storage.objects WITH CHECK(false);
 END IF;END$$;
 UPDATE private.image_settings SET enabled=false WHERE singleton;
 UPDATE private.image_worker_settings SET enabled=false,storage_enabled=false WHERE singleton;
 UPDATE private.image_inspectors SET enabled=false;
 UPDATE private.image_inspection_jobs SET valid_until=least(valid_until,clock_timestamp());
 DO $$DECLARE r record;BEGIN FOR r IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.oid IN(SELECT to_regprocedure(sig)::oid FROM unnest(ARRAY['private.image_catalog_authorize(uuid,uuid)','private.image_catalog_record_uploaded(uuid,uuid,uuid,bytea)','private.image_catalog_resolve_read(uuid,uuid,uuid)','private.image_catalog_resolve_upload(uuid,uuid,uuid)','private.image_catalog_status(uuid,uuid,text,text,integer,text,text,text)','private.image_claim(uuid)','private.image_finish(uuid,uuid,text,integer,boolean,text,integer,integer,text)','private.image_inspector_active()','private.image_inspector_identity_guard()','private.image_message_lookup(uuid,uuid,text,uuid)','private.image_message_resolve(uuid,uuid,uuid)','private.image_message_send(uuid,uuid,text,uuid)','private.image_record_inspection(uuid,text,integer,boolean,text,integer,integer)','private.image_reserve(uuid,uuid,text,text,integer,text,text,text)','private.image_storage_allow(text,text,text,boolean)','private.read_messages_projection_v3(uuid,uuid,bigint,bigint,integer)','public.claim_connect_image_inspection_v1(uuid)','public.finish_connect_image_inspection_v1(uuid,uuid,text,integer,boolean,text,integer,integer,text)','public.lookup_connect_image_message_v1(uuid,uuid,text,uuid)','public.read_connect_messages_v3(uuid,uuid,bigint,bigint,integer)','public.reserve_connect_image_v1(uuid,uuid,text,text,integer,text,text,text)','public.resolve_connect_image_message_v1(uuid,uuid,uuid)','public.send_connect_image_message_v1(uuid,uuid,text,uuid)'])sig)LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||r.sig||' FROM PUBLIC,anon,authenticated,service_role';END LOOP;END$$;
 COMMIT;
