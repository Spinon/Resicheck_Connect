BEGIN;SET LOCAL lock_timeout='3s';GRANT EXECUTE ON FUNCTION private.image_storage_allow(text,text,text,boolean)TO authenticated;
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
COMMIT;
