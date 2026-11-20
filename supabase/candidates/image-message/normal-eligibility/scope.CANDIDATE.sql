-- LOCAL CANDIDATE, not a hosted installer. No Auth/session/grant/activation.
CREATE TABLE private.image_inspector_companies(
 inspector_id uuid NOT NULL REFERENCES private.image_inspectors(user_id),
 company_id uuid NOT NULL REFERENCES public.companies(id),
 enabled boolean NOT NULL DEFAULT false,
 valid_until timestamptz NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(inspector_id,company_id)
);
ALTER TABLE private.image_inspector_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.image_inspector_companies FORCE ROW LEVEL SECURITY;
REVOKE ALL ON private.image_inspector_companies FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION private.image_company_eligible(p_inspector uuid,p_company uuid)RETURNS boolean
 LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''AS $$
 SELECT EXISTS(
  SELECT 1 FROM private.image_inspector_companies e
  JOIN private.image_inspectors i ON i.user_id=e.inspector_id
  JOIN private.company_controls c ON c.company_id=e.company_id AND c.state='active'
  WHERE e.inspector_id=p_inspector AND e.company_id=p_company
   AND e.enabled AND e.revoked_at IS NULL AND e.valid_until>clock_timestamp()
   AND i.enabled AND i.valid_until>clock_timestamp()
 )AND NOT EXISTS(SELECT 1 FROM private.accounts a WHERE a.user_id=p_inspector AND a.state='active')
 AND NOT EXISTS(SELECT 1 FROM public.memberships m WHERE m.user_id=p_inspector)
 AND NOT EXISTS(SELECT 1 FROM private.audio_inspectors a WHERE a.user_id=p_inspector)
$$;
REVOKE ALL ON FUNCTION private.image_company_eligible(uuid,uuid)FROM PUBLIC,anon,authenticated,service_role;
