import fs from'node:fs/promises';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{snapshotSql}from'./compile-worker-protected.mjs';import{compileExactImageScope}from'./compile-exact-inspector-scope.mjs';import{compileImageMessage}from'./compile.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex'),q=s=>"'"+s.replaceAll("'","''")+"'";
const names=['authorize_connect_image_transfer_v1','status_connect_image_transfer_v1','resolve_connect_image_upload_v1','record_connect_image_upload_v1','read_connect_image_transfer_descriptor_v1','image_inspector_scope_guard','image_authorized_scope','image_catalog_authorize','image_catalog_record_uploaded','image_catalog_resolve_read','image_catalog_resolve_upload','image_catalog_status','image_claim','image_finish','image_inspector_active','image_inspector_identity_guard','image_message_lookup','image_message_resolve','image_message_send','image_record_inspection','image_reserve','image_storage_allow','read_messages_projection_v3','claim_connect_image_inspection_v1','finish_connect_image_inspection_v1','lookup_connect_image_message_v1','read_connect_messages_v3','reserve_connect_image_v1','resolve_connect_image_message_v1','send_connect_image_message_v1'];
const tables=['image_inspection_scopes','image_settings','image_metadata','image_message_receipts','image_worker_settings','image_inspectors','image_inspection_jobs','image_lease_events'],list=a=>a.map(q).join(',');
const managedMetadataSql=snapshotSql.replace(/p.proname not in\([^)]*\)/,"p.proname not in("+list(names)+")").replaceAll("c.relname not in('image_worker_settings','image_inspectors','image_inspection_jobs','image_lease_events')","c.relname not in("+list(tables)+")").replace("where policyname not like'image_bucket_%'","where policyname not like'image_bucket_%'and policyname<>'message_image_legacy_hide'").replace("from pg_constraint where conrelid in(","from pg_constraint where not(conrelid='public.messages'::regclass and conname in('messages_kind_check','messages_kind_body_check'))and conrelid in(").replace("encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')","case when n.nspname='private'and p.proname='read_messages_projection_v2' then null else encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')end").replace("'schema',","'providerPolicyGrants',current_setting('supautils.policy_grants',true),'schema',");
export const managedSnapshotSql="select jsonb_build_object('metadataSha256',encode(sha256(convert_to(("+managedMetadataSql+")::text,'UTF8')),'hex'))";
function inner(sql){const start=sql.indexOf('BEGIN;'),end=sql.lastIndexOf('COMMIT;');assert(start>=0&&end>start);return sql.slice(start+6,end);}
export async function compileCombinedClosed(snapshot,observed){
 assert(snapshot&&observed.project==='ibdlvlwdzmsrbqadrudb');const projection=observed.functions.find(f=>f.signature.startsWith('private.read_messages_projection_v2('));assert(projection?.owner==='postgres'&&projection.securityDefiner);
 const origin=projection.definition.replaceAll('\r',''),body=origin.split('$function$')[1];assert(typeof body==='string');const match='from public.messages m where m.company_id=p_company and m.conversation_id=p_conversation and';assert(body.split(match).length===2);
 const legacy=origin.replace(match,match+" m.kind in('text','audio')and"),v3=origin.replace('CREATE OR REPLACE FUNCTION private.read_messages_projection_v2','CREATE FUNCTION private.read_messages_projection_v3');
 const legacyHash=sha(legacy.split('$function$')[1]),beforeHash=sha(body);assert.equal(beforeHash,projection.bodySha256);
 const compiled=await compileImageMessage();let core=inner(compiled.sql),start=core.indexOf('create function private.read_messages_projection_v3('),end=core.indexOf('create function public.read_connect_messages_v3(',start);assert(start>0&&end>start);core=core.slice(0,start)+v3+';\n'+core.slice(end);
 const compatibility=legacy+";\nCREATE POLICY message_image_legacy_hide ON public.messages AS RESTRICTIVE FOR SELECT TO authenticated USING(kind<>'image');\n";
 const catalog=inner(await fs.readFile('supabase/candidates/image-message/catalog.LOCAL.sql','utf8')),worker=await fs.readFile('supabase/candidates/image-message/worker-policies.LOCAL.sql','utf8'),split=worker.indexOf('-- POLICY_ACTIVATION_BOUNDARY'),revoke=worker.lastIndexOf('REVOKE ALL ON FUNCTION');assert(split>0&&revoke>split);const exactScope=await compileExactImageScope(),workerBody=worker.slice(0,split)+worker.slice(revoke)+'\n'+exactScope.guard+exactScope.body;
 const userRpc=inner(await fs.readFile('supabase/candidates/image-message/user-rpc-catalog-CLOSED.LOCAL.sql','utf8'));
 const dependencyPins=observed.functions.map(f=>"("+q(f.signature)+","+q(f.bodySha256)+")").join(','),snapshotText=q(JSON.stringify(snapshot)),compare="("+managedSnapshotSql+") IS DISTINCT FROM "+snapshotText+"::jsonb";
 const account=observed.tables.find(t=>t.schema==='private'&&t.name==='accounts'),storage=observed.tables.find(t=>t.schema==='storage'&&t.name==='objects');assert(account?.owner==='connect_hmac_registration'&&storage?.owner==='supabase_storage_admin');
 const triggerGranted=account.acl.some(s=>s.startsWith('postgres=')&&s.split('/')[0].includes('t'));assert(triggerGranted,'observed managed TRIGGER privilege must already exist');
 const sql=`-- UNAPPLIED combined closed candidate, only for reviewed Connect baseline. No bucket, policy activation, operational grant or identity.
BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';SELECT pg_advisory_xact_lock(900001,521);
DO $$BEGIN IF current_user<>'postgres'OR session_user<>'postgres'OR ${compare}
 OR to_regclass('private.image_settings')IS NOT NULL OR to_regclass('private.image_worker_settings')IS NOT NULL
 OR NOT has_table_privilege('postgres','private.accounts','TRIGGER')OR NOT has_table_privilege('postgres','auth.users','REFERENCES')OR NOT has_table_privilege('postgres','public.profiles','REFERENCES')OR NOT has_table_privilege('postgres','public.companies','REFERENCES')OR NOT has_table_privilege('postgres','public.messages','REFERENCES')
 OR has_schema_privilege('postgres','private','CREATE')
 OR(SELECT pg_get_userbyid(relowner)FROM pg_class WHERE oid='storage.objects'::regclass)<>'supabase_storage_admin'
 OR EXISTS(SELECT 1 FROM(values ${dependencyPins})v(sig,digest)LEFT JOIN pg_proc p ON p.oid=to_regprocedure(v.sig)WHERE p.oid IS NULL OR p.proowner<>'postgres'::regrole OR encode(sha256(convert_to(replace(p.prosrc,chr(13),''),'UTF8')),'hex')<>v.digest)
 THEN RAISE EXCEPTION 'Combined image baseline differs';END IF;END$$;
CREATE TEMP TABLE image_shape_expected(kind text,body text,CONSTRAINT kind_shape CHECK(kind IN('text','audio','image')),CONSTRAINT body_shape CHECK((kind='text'AND body IS NOT NULL)OR(kind IN('audio','image')AND body IS NULL)))ON COMMIT DROP;
GRANT connect_hmac_registration TO postgres WITH INHERIT false,SET true;
SET LOCAL ROLE connect_hmac_registration;GRANT CREATE ON SCHEMA private TO postgres;SET LOCAL ROLE postgres;
${core}
${catalog}
${userRpc}
${compatibility}
${workerBody}
SET LOCAL ROLE connect_hmac_registration;REVOKE CREATE ON SCHEMA private FROM postgres;SET LOCAL ROLE postgres;
GRANT connect_hmac_registration TO postgres WITH INHERIT false,SET false;
DO $$BEGIN IF ${compare}
 OR(SELECT pg_get_constraintdef(oid)FROM pg_constraint WHERE conrelid='public.messages'::regclass AND conname='messages_kind_check')IS DISTINCT FROM(SELECT pg_get_constraintdef(oid)FROM pg_constraint WHERE conrelid='pg_temp.image_shape_expected'::regclass AND conname='kind_shape')
 OR(SELECT pg_get_constraintdef(oid)FROM pg_constraint WHERE conrelid='public.messages'::regclass AND conname='messages_kind_body_check')IS DISTINCT FROM(SELECT pg_get_constraintdef(oid)FROM pg_constraint WHERE conrelid='pg_temp.image_shape_expected'::regclass AND conname='body_shape')
 OR(SELECT count(*)FROM pg_constraint WHERE conrelid='public.messages'::regclass AND conname IN('messages_kind_check','messages_kind_body_check')AND convalidated)<>2
 OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.messages'::regclass AND polname='message_image_legacy_hide'AND polcmd='r'AND NOT polpermissive AND polroles=ARRAY['authenticated'::regrole::oid])
 OR EXISTS(SELECT 1 FROM private.image_settings WHERE enabled)
 OR EXISTS(SELECT 1 FROM private.image_worker_settings WHERE enabled OR storage_enabled OR decoder_image IS NOT NULL)
 OR EXISTS(SELECT 1 FROM private.image_inspectors)OR EXISTS(SELECT 1 FROM private.image_inspection_jobs)OR EXISTS(SELECT 1 FROM private.image_inspection_scopes)
 OR(SELECT count(*)FROM pg_class WHERE relnamespace='private'::regnamespace AND relname IN(${list(tables)})AND relowner='postgres'::regrole AND relrowsecurity AND relforcerowsecurity)<>8
 OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE c.relnamespace='private'::regnamespace AND c.relname IN(${list(tables)})AND(a.grantee<>c.relowner OR a.is_grantable))
 OR EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a WHERE p.pronamespace IN('private'::regnamespace,'public'::regnamespace)AND p.proname IN(${list(names)})AND(a.grantee<>p.proowner OR a.is_grantable))
 OR(SELECT encode(sha256(convert_to(replace(prosrc,chr(13),''),'UTF8')),'hex')FROM pg_proc WHERE oid='private.read_messages_projection_v2(uuid,uuid,bigint,bigint,integer)'::regprocedure)<>${q(legacyHash)}
 OR NOT has_table_privilege('postgres','private.accounts','TRIGGER')
 OR EXISTS(SELECT 1 FROM pg_policies WHERE policyname LIKE'image_bucket_%'AND schemaname='storage')
 THEN RAISE EXCEPTION 'Combined image postflight differs';END IF;END$$;
COMMIT;
`;
 assert(!/grant\s+execute|alter\s+table\s+storage|alter\s+role/i.test(sql));
 return{sql,metadata:{state:'combined-closed-unapplied-managed-baseline-candidate',sha256:sha(sql),baselineSha256:sha(JSON.stringify(snapshot)),dependencyPins:observed.functions.map(f=>({signature:f.signature,sha256:f.bodySha256})),originalProjectionSha256:beforeHash,legacyProjectionSha256:legacyHash,newPrivateTables:8,newFunctions:30,userCatalogRpc:true,userBackendSqlPoolRequired:false,exactServiceScopeRequired:true,operationalGrants:0,storagePoliciesInstalled:false,storageOwnerChanged:false,accountsTriggerPreserved:true,createsBucket:false,createsIdentity:false,enabled:false,remoteApplied:false,remoteReady:false}};
}
