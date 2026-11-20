-- Mandatory exact scope for the image-only service identity. Closed metadata;
-- no Auth user, grant, bucket, flag or operational session is created here.
CREATE TABLE private.image_inspection_scopes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 inspector_id uuid NOT NULL REFERENCES private.image_inspectors(user_id),
 company_id uuid NOT NULL REFERENCES public.companies(id),
 attachment_id uuid NOT NULL REFERENCES private.attachment_catalog(id),
 session_id uuid NOT NULL,
 sha256 bytea NOT NULL CHECK(octet_length(sha256)=32),
 byte_length integer NOT NULL CHECK(byte_length BETWEEN 16 AND 4194304),
 decoder_image text NOT NULL CHECK(decoder_image~'^sha256:[a-f0-9]{64}$'),
 valid_from timestamptz NOT NULL,
 valid_until timestamptz NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 issued_by name NOT NULL DEFAULT current_user,
 revoked_at timestamptz,
 CHECK(valid_until>valid_from AND valid_until<=valid_from+interval'10 minutes'),
 CHECK(revoked_at IS NULL OR revoked_at>=issued_at)
);
CREATE UNIQUE INDEX image_scope_one_unrevoked_per_inspector ON private.image_inspection_scopes(inspector_id)WHERE revoked_at IS NULL;
ALTER TABLE private.image_inspection_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.image_inspection_scopes FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.image_inspection_scopes FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE private.image_inspection_jobs ADD COLUMN scope_id uuid NOT NULL REFERENCES private.image_inspection_scopes(id);
ALTER TABLE private.image_lease_events ADD COLUMN scope_id uuid NOT NULL REFERENCES private.image_inspection_scopes(id);
CREATE FUNCTION private.image_inspector_scope_guard()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''AS $$
BEGIN
 IF TG_OP='DELETE'THEN RAISE EXCEPTION 'Image scope unavailable';END IF;
 IF TG_OP='UPDATE'THEN
  IF(to_jsonb(new)-'revoked_at')IS DISTINCT FROM(to_jsonb(old)-'revoked_at')THEN RAISE EXCEPTION 'Image scope unavailable';END IF;
  IF old.revoked_at IS NOT NULL THEN
   IF new.revoked_at IS DISTINCT FROM old.revoked_at THEN RAISE EXCEPTION 'Image scope unavailable';END IF;
   RETURN old;
  END IF;
  IF new.revoked_at IS NULL THEN RETURN old;END IF;
  new.revoked_at:=clock_timestamp();RETURN new;
 END IF;
 new.issued_at:=clock_timestamp();new.issued_by:=current_user;
 IF new.revoked_at IS NOT NULL OR NOT EXISTS(
  SELECT 1 FROM private.image_inspectors i JOIN private.attachment_catalog a ON a.id=new.attachment_id AND a.company_id=i.company_id
  JOIN auth.sessions s ON s.id=new.session_id AND s.user_id=i.user_id
  WHERE i.user_id=new.inspector_id AND i.company_id=new.company_id AND a.media_kind='image'
   AND a.expected_sha256=new.sha256 AND a.expected_bytes=new.byte_length
   AND(s.not_after IS NULL OR s.not_after>clock_timestamp())
 )THEN RAISE EXCEPTION 'Image scope unavailable';END IF;
 RETURN new;
END$$;
CREATE TRIGGER image_inspector_scope_immutable BEFORE INSERT OR UPDATE OR DELETE ON private.image_inspection_scopes FOR EACH ROW EXECUTE FUNCTION private.image_inspector_scope_guard();
CREATE FUNCTION private.image_authorized_scope(p_attachment uuid)RETURNS private.image_inspection_scopes LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=''AS $$
DECLARE g private.image_inspection_scopes;
BEGIN
 IF NOT private.image_inspector_active()THEN RAISE EXCEPTION 'Image unavailable';END IF;
 SELECT x.* INTO STRICT g FROM private.image_inspection_scopes x
 JOIN private.image_inspectors i ON i.user_id=x.inspector_id AND i.company_id=x.company_id
 JOIN private.attachment_catalog a ON a.id=x.attachment_id AND a.company_id=x.company_id AND a.media_kind='image'
 JOIN private.image_worker_settings w ON w.singleton AND w.decoder_image=x.decoder_image
 WHERE x.inspector_id=auth.uid()AND x.session_id::text IS NOT DISTINCT FROM auth.jwt()->>'session_id'
  AND x.attachment_id=p_attachment AND x.revoked_at IS NULL AND clock_timestamp()>=x.valid_from AND clock_timestamp()<x.valid_until
  AND a.expected_sha256=x.sha256 AND a.expected_bytes=x.byte_length
 FOR SHARE OF x;
 RETURN g;
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING errcode='P0001',message='Image unavailable';END$$;
REVOKE ALL ON FUNCTION private.image_inspector_scope_guard(),private.image_authorized_scope(uuid)FROM PUBLIC,anon,authenticated,service_role;

