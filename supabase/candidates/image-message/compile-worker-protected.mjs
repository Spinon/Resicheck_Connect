import fs from'node:fs/promises';import{createHash}from'node:crypto';import assert from'node:assert/strict';
export const sha=s=>createHash('sha256').update(s).digest('hex');
const added=['image_inspector_identity_guard','image_inspector_active','image_claim','image_finish','image_storage_allow','claim_connect_image_inspection_v1','finish_connect_image_inspection_v1'];
export const snapshotSql=`select jsonb_build_object(
'functions',(select jsonb_agg(jsonb_build_array(n.nspname,p.proname,p.oid::regprocedure::text,p.proowner,p.proacl,p.proconfig,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'))order by p.oid::regprocedure::text)from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in('private','public','storage','auth')and p.prokind='f'and p.proname not in(${added.map(x=>"'"+x+"'").join(',')})),
'tables',(select jsonb_agg(jsonb_build_array(c.oid::regclass::text,c.relowner,c.relacl,c.relrowsecurity,c.relforcerowsecurity)order by c.oid::regclass::text)from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('private','public','storage','auth')and c.relkind='r'and c.relname not in('image_worker_settings','image_inspectors','image_inspection_jobs','image_lease_events')),
'policies',(select jsonb_agg(to_jsonb(x)order by schemaname,tablename,policyname)from pg_policies x where policyname not like'image_bucket_%'),
'constraints',(select jsonb_agg(jsonb_build_array(conrelid::regclass::text,conname,pg_get_constraintdef(oid))order by conrelid::regclass::text,conname)from pg_constraint where conrelid in(select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in('private','public','storage','auth')and c.relname not in('image_worker_settings','image_inspectors','image_inspection_jobs','image_lease_events'))),
'schema',(select jsonb_agg(jsonb_build_array(nspname,nspowner,nspacl)order by nspname)from pg_namespace where nspname in('private','public','storage','auth')),
'defaultAcl',(select jsonb_agg(to_jsonb(d)order by defaclrole,defaclnamespace,defaclobjtype)from pg_default_acl d),
'memberships',(select jsonb_agg(to_jsonb(m)order by roleid,member)from pg_auth_members m),
'roles',(select jsonb_agg(jsonb_build_array(rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolbypassrls)order by rolname)from pg_roles),
'triggers',(select jsonb_agg(jsonb_build_array(tgrelid::regclass::text,tgname,pg_get_triggerdef(oid))order by tgrelid::regclass::text,tgname)from pg_trigger where not tgisinternal and tgname not like'image_inspector_%')
)`;
export async function compileProtectedWorker(baseline){
 assert(baseline&&typeof baseline==='object'&&!Array.isArray(baseline));
 const source=await fs.readFile('supabase/candidates/image-message/worker-policies.LOCAL.sql','utf8');
 const split=source.indexOf('-- POLICY_ACTIVATION_BOUNDARY'),revoke=source.lastIndexOf('REVOKE ALL ON FUNCTION');assert(split>0&&revoke>split);
 const body=source.slice(0,split)+source.slice(revoke),policies=source.slice(split,revoke);
 const activation="BEGIN;SET LOCAL lock_timeout='3s';GRANT EXECUTE ON FUNCTION private.image_storage_allow(text,text,text,boolean)TO authenticated;\n"+policies+"COMMIT;\n";
 assert(!/\bgrant\b/i.test(body.replace(/--[^\n]*/g,'')));
 const pin=sha(JSON.stringify(baseline)),expected=JSON.stringify(baseline).replaceAll("'","''");
 const compare=`(${snapshotSql}) IS DISTINCT FROM '${expected}'::jsonb`;
 const pre=`BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='20s';SELECT pg_advisory_xact_lock(900001,520);
 DO $$BEGIN IF current_user<>'postgres'OR session_user<>'postgres'OR ${compare} OR EXISTS(SELECT 1 FROM private.image_settings WHERE enabled) OR to_regclass('private.image_worker_settings')IS NOT NULL OR (SELECT nspowner FROM pg_namespace WHERE nspname='private')IS DISTINCT FROM'connect_hmac_registration'::regrole OR has_schema_privilege('postgres','private','CREATE') OR NOT EXISTS(SELECT 1 FROM pg_auth_members WHERE roleid='connect_hmac_registration'::regrole AND member='postgres'::regrole AND admin_option AND NOT set_option AND NOT inherit_option)OR (SELECT relowner FROM pg_class WHERE oid='storage.objects'::regclass)IS DISTINCT FROM'postgres'::regrole THEN RAISE EXCEPTION 'Image protected baseline differs';END IF;END$$;
 GRANT connect_hmac_registration TO postgres WITH INHERIT false,SET true;
 SET LOCAL ROLE connect_hmac_registration;GRANT CREATE ON SCHEMA private TO postgres;GRANT TRIGGER ON private.accounts TO postgres;SET LOCAL ROLE postgres;
 `;
 const restore=`SET LOCAL ROLE connect_hmac_registration;REVOKE CREATE ON SCHEMA private FROM postgres;REVOKE TRIGGER ON private.accounts FROM postgres;SET LOCAL ROLE postgres;GRANT connect_hmac_registration TO postgres WITH INHERIT false,SET false;`;
 const post=`DO $$BEGIN IF ${compare} OR EXISTS(SELECT 1 FROM private.image_settings WHERE enabled)OR EXISTS(SELECT 1 FROM private.image_worker_settings WHERE enabled OR storage_enabled OR decoder_image IS NOT NULL)OR EXISTS(SELECT 1 FROM private.image_inspectors)OR EXISTS(SELECT 1 FROM private.image_inspection_jobs)OR EXISTS(SELECT 1 FROM private.image_lease_events)
 OR(SELECT count(*)FROM pg_class WHERE relnamespace='private'::regnamespace AND relname IN('image_worker_settings','image_inspectors','image_inspection_jobs','image_lease_events')AND relowner='postgres'::regrole AND relrowsecurity AND relforcerowsecurity)<>4
 OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE c.relnamespace='private'::regnamespace AND c.relname IN('image_worker_settings','image_inspectors','image_inspection_jobs','image_lease_events')AND(a.grantee<>c.relowner OR a.is_grantable))
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE n.nspname IN('private','public')AND p.proname IN(${added.map(x=>"'"+x+"'").join(',')})AND(a.grantee<>p.proowner OR a.is_grantable))
 OR EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('private','public')AND p.proname IN(${added.map(x=>"'"+x+"'").join(',')})AND(has_function_privilege('authenticated',p.oid,'EXECUTE')OR has_function_privilege('service_role',p.oid,'EXECUTE')))THEN RAISE EXCEPTION 'Image protected restoration differs';END IF;END$$;`;
 const sql=pre+body+'\n'+restore+post+'COMMIT;\n';
 const rollbackSources=[source,await fs.readFile('supabase/candidates/image-message/image-message.CANDIDATE.sql','utf8'),await fs.readFile('supabase/candidates/image-message/catalog.LOCAL.sql','utf8'),await fs.readFile('supabase/candidates/image-message/exact-inspector-scope.LOCAL.sql','utf8')];
 const signatures=[...new Set(rollbackSources.flatMap(text=>[...text.matchAll(/create(?: or replace)? function\s+((?:private|public)\.[a-z_0-9]+)\s*\(([^)]*)\)/gi)].map(m=>m[1].toLowerCase()+'('+m[2].split(',').filter(x=>x.trim()).map(x=>x.trim().replace(/\s+default[\s\S]*/i,'').split(/\s+/).slice(1).join(' ').toLowerCase()).join(',')+')')))].sort();
 assert(signatures.length===25);
 const rollback=`BEGIN;SET LOCAL lock_timeout='3s';SELECT pg_advisory_xact_lock(900001,520);

 DO $$BEGIN IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage'AND tablename='objects'AND policyname='image_bucket_select_fence')THEN
 ALTER POLICY image_bucket_select_fence ON storage.objects USING(bucket_id<>'connect-private-images');
 ALTER POLICY image_bucket_insert_fence ON storage.objects WITH CHECK(bucket_id<>'connect-private-images');
 ALTER POLICY image_bucket_select ON storage.objects USING(false);
 ALTER POLICY image_bucket_insert ON storage.objects WITH CHECK(false);
 END IF;END$$;
 UPDATE private.image_settings SET enabled=false WHERE singleton;
 UPDATE private.image_worker_settings SET enabled=false,storage_enabled=false WHERE singleton;
 UPDATE private.image_inspectors SET enabled=false;
 DO $$BEGIN IF to_regclass('private.image_inspection_scopes')IS NOT NULL THEN UPDATE private.image_inspection_scopes SET revoked_at=clock_timestamp()WHERE revoked_at IS NULL;END IF;END$$;
 UPDATE private.image_inspection_jobs SET valid_until=least(valid_until,clock_timestamp());
 DO $$DECLARE r record;BEGIN FOR r IN SELECT p.oid::regprocedure sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.oid IN(SELECT to_regprocedure(sig)::oid FROM unnest(ARRAY[${signatures.map(x=>"'"+x+"'").join(',')}])sig)LOOP EXECUTE 'REVOKE ALL ON FUNCTION '||r.sig||' FROM PUBLIC,anon,authenticated,service_role';IF to_regrole('connect_image_backend')IS NOT NULL THEN EXECUTE 'REVOKE ALL ON FUNCTION '||r.sig||' FROM connect_image_backend';END IF;END LOOP;IF to_regrole('connect_image_backend')IS NOT NULL THEN REVOKE USAGE ON SCHEMA private FROM connect_image_backend;END IF;END$$;
 COMMIT;\n`;
 return{sql,rollback,activation,metadata:{state:'protected-worker-extension-local-baseline-only-off',dependencyPin:pin,bodySha256:sha(body),policyActivationSha256:sha(activation),policiesInstalledByClosedInstaller:false,policyActivationHelperGrants:1,installSha256:sha(sql),rollbackSha256:sha(rollback),rollbackFunctionSignatures:signatures,remoteReady:false,remoteApplied:false,createsBucket:false,createsIdentity:false,operationalGrants:0,requires:['separately reviewed core/catalog installation and remote metadata preflight','Storage object owner/authority verified; this artifact fails otherwise','private bucket provisioning via official Storage API','separate decoder image verified and pinned','explicit least-privilege operational activation and connected proof']}};
}
