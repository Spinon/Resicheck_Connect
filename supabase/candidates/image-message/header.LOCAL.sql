-- LOCAL CANDIDATE ONLY. Not an installer for the managed Connect.
-- No operational grants; no image bucket, worker, Edge route or normal-client activation.
BEGIN;
SET LOCAL lock_timeout='3s';
ALTER TABLE public.messages DROP CONSTRAINT messages_kind_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_kind_check CHECK(kind IN('text','audio','image'));
ALTER TABLE public.messages DROP CONSTRAINT messages_kind_body_check;
ALTER TABLE public.messages ADD CONSTRAINT messages_kind_body_check CHECK((kind='text' AND body IS NOT NULL)OR(kind IN('audio','image')AND body IS NULL));
CREATE TABLE private.image_settings(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false);
INSERT INTO private.image_settings VALUES(true,false);
CREATE TABLE private.image_metadata(
 attachment_id uuid PRIMARY KEY REFERENCES private.attachment_catalog(id), mode text NOT NULL CHECK(mode IN('original','optimized')),
 declared_type text NOT NULL CHECK(declared_type IN('image/png','image/jpeg')),profile text,
 width integer,height integer,inspection_version text,
 CHECK((mode='original'AND profile IS NULL)OR(mode='optimized'AND profile IS NOT NULL AND profile='candidate-document-3508-q90-v2')),
 CHECK((width IS NULL AND height IS NULL AND inspection_version IS NULL)OR(width IS NOT NULL AND height IS NOT NULL AND inspection_version IS NOT NULL AND width BETWEEN 1 AND 16384 AND height BETWEEN 1 AND 16384 AND width::bigint*height<=16000000 AND inspection_version='ffmpeg-9.0.2-image-single-v1'))
);
ALTER TABLE private.image_settings ENABLE ROW LEVEL SECURITY;ALTER TABLE private.image_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE private.image_metadata ENABLE ROW LEVEL SECURITY;ALTER TABLE private.image_metadata FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.image_settings,private.image_metadata FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.image_reserve(p_company uuid,p_conversation uuid,p_client text,p_digest text,p_bytes integer,p_mode text,p_type text,p_profile text)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r jsonb;m private.image_metadata;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.image_settings WHERE singleton AND enabled)OR p_digest IS NULL OR p_digest!~'^[a-f0-9]{64}$'OR p_bytes IS NULL OR p_bytes NOT BETWEEN 1 AND 4194304 OR p_mode IS NULL OR p_mode NOT IN('original','optimized')OR p_type IS NULL OR p_type NOT IN('image/png','image/jpeg')
 OR(p_mode='original'AND p_profile IS NOT NULL)OR(p_mode='optimized'AND p_profile IS DISTINCT FROM'candidate-document-3508-q90-v2')THEN RAISE EXCEPTION 'Image unavailable';END IF;
 r:=private.attachment_reserve(p_company,p_conversation,p_client,'image',decode(p_digest,'hex'),p_bytes);
 INSERT INTO private.image_metadata(attachment_id,mode,declared_type,profile)VALUES((r->>'id')::uuid,p_mode,p_type,p_profile)ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT m FROM private.image_metadata WHERE attachment_id=(r->>'id')::uuid;
 IF m.mode<>p_mode OR m.declared_type<>p_type OR m.profile IS DISTINCT FROM p_profile THEN RAISE EXCEPTION 'Image unavailable';END IF;RETURN r;
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING errcode='P0001',message='Image unavailable';END$$;
-- TRUSTED SERVER ONLY, never grant this to a client. The real worker must hash
-- immutable downloaded bytes and decode them in its isolated process first.
CREATE FUNCTION private.image_record_inspection(p_attachment uuid,p_digest text,p_bytes integer,p_pass boolean,p_type text,p_width integer,p_height integer)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a private.attachment_catalog;m private.image_metadata;passed boolean;state text;
BEGIN
 SELECT * INTO STRICT a FROM private.attachment_catalog WHERE id=p_attachment AND media_kind='image';
 IF NOT private.attachment_author_lock(a.sender_id,a.company_id,a.conversation_id,a.session_id,a.valid_until)THEN RAISE EXCEPTION 'Image unavailable';END IF;
 SELECT * INTO STRICT a FROM private.attachment_catalog WHERE id=p_attachment FOR UPDATE;
 SELECT * INTO STRICT m FROM private.image_metadata WHERE attachment_id=a.id FOR UPDATE;
 IF p_digest IS NULL OR p_digest!~'^[a-f0-9]{64}$'OR p_bytes IS NULL OR p_bytes<>a.expected_bytes OR decode(p_digest,'hex')<>a.expected_sha256 OR p_bytes>4194304 THEN RAISE EXCEPTION 'Image unavailable';END IF;
 passed:=coalesce(p_pass AND p_type=m.declared_type AND p_type IN('image/png','image/jpeg')AND p_width BETWEEN 1 AND 16384 AND p_height BETWEEN 1 AND 16384 AND p_width::bigint*p_height<=16000000,false);
 IF a.state='ready' THEN
  IF NOT passed OR m.width IS DISTINCT FROM p_width OR m.height IS DISTINCT FROM p_height OR m.inspection_version IS DISTINCT FROM'ffmpeg-9.0.2-image-single-v1' THEN RAISE EXCEPTION 'Image unavailable';END IF;
  RETURN jsonb_build_object('state','ready');
 END IF;
 state:=private.attachment_inspect(a.id,decode(p_digest,'hex'),passed,p_type,NULL,'ffmpeg-9.0.2-image-single-v1');
 IF state='ready'THEN UPDATE private.image_metadata SET width=p_width,height=p_height,inspection_version='ffmpeg-9.0.2-image-single-v1'WHERE attachment_id=a.id;END IF;
 RETURN jsonb_build_object('state',state);
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION USING errcode='P0001',message='Image unavailable';END$$;
