// One new DCL/transaction regression in disposable PostgreSQL. Not a media proof.
import fs from'node:fs/promises';import assert from'node:assert/strict';import{startLocalPostgres}from'../../../tests/local-postgres-harness.mjs';import{buildNormalAccess}from'./normal-access.mjs';
const plan=JSON.parse(await fs.readFile('supabase/candidates/image-message/normal-service-integration-plan-current.json','utf8')),signatures=plan.proposedAccess.executeSignatures,co=plan.actorBindings.companyId,actor=plan.actorBindings.inspector,q=s=>"'"+s.replaceAll("'","''")+"'",db=await startLocalPostgres('image-normal-access-focused');let n=0;
const sql=async(s,error)=>(await db.sql('access-'+(++n),s,error)).output.trim(),asOwner=s=>'SET SESSION AUTHORIZATION postgres;'+s,parse=s=>JSON.parse(s.split(/\r?\n/).findLast(x=>x.startsWith('[')||x.startsWith('{'))),report={state:'running',realPostgres:true,realSupabase:false,fixture:'23 inert invoker functions; settings, policy and actor metadata only',remoteCalls:0,checks:[]};
try{
 await sql(`CREATE ROLE postgres LOGIN;CREATE ROLE authenticated NOLOGIN;CREATE ROLE anon NOLOGIN;CREATE ROLE service_role NOLOGIN;CREATE SCHEMA private AUTHORIZATION postgres;CREATE SCHEMA storage AUTHORIZATION postgres;GRANT CREATE ON SCHEMA public TO postgres;SET ROLE postgres;
 CREATE TABLE private.company_controls(company_id uuid PRIMARY KEY,state text);CREATE TABLE public.memberships(user_id uuid);CREATE TABLE private.accounts(user_id uuid,state text);CREATE TABLE private.audio_inspectors(user_id uuid);
 CREATE TABLE private.image_settings(singleton boolean PRIMARY KEY,enabled boolean,scope_pairs text[],scope_until timestamptz);
 CREATE TABLE private.image_worker_settings(singleton boolean PRIMARY KEY,enabled boolean,storage_enabled boolean,decoder_image text);
 CREATE TABLE private.image_inspectors(user_id uuid PRIMARY KEY,company_id uuid,enabled boolean,valid_until timestamptz);
 CREATE TABLE private.image_company_rollout(company_id uuid PRIMARY KEY,enabled boolean);
 CREATE TABLE private.image_inspector_companies(inspector_id uuid,company_id uuid,enabled boolean,valid_until timestamptz,revoked_at timestamptz,PRIMARY KEY(inspector_id,company_id));
 CREATE TABLE private.image_inspection_scopes(inspector_id uuid,company_id uuid,revoked_at timestamptz);
 CREATE TABLE storage.objects(bucket_id text,name text,owner_id text);ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
 CREATE FUNCTION private.image_company_eligible(uuid,uuid)RETURNS boolean LANGUAGE sql AS $$SELECT false$$;REVOKE ALL ON FUNCTION private.image_company_eligible(uuid,uuid)FROM PUBLIC;
 INSERT INTO private.company_controls VALUES(${q(co)},'active');INSERT INTO private.image_settings VALUES(true,false,'{}','-infinity');INSERT INTO private.image_worker_settings VALUES(true,false,false,null);INSERT INTO private.image_inspectors VALUES(${q(actor)},${q(co)},false,'2026-11-20T00:06:21.514Z');
 `+signatures.map(s=>'CREATE FUNCTION '+s+'RETURNS boolean LANGUAGE sql AS $$SELECT false$$;REVOKE ALL ON FUNCTION '+s+' FROM PUBLIC;').join('\n')+`
 CREATE POLICY image_bucket_select ON storage.objects FOR SELECT TO authenticated USING(false);
 CREATE POLICY image_bucket_select_fence ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated USING(bucket_id<>'connect-private-images');
 CREATE POLICY image_bucket_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(false);
 CREATE POLICY image_bucket_insert_fence ON storage.objects AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(bucket_id<>'connect-private-images');`);
 const functions=[];for(const signature of signatures){const f=parse(await sql(`SELECT jsonb_build_object('attributes',to_jsonb(p)-'prosrc','bodySha256',encode(sha256(convert_to(prosrc,'UTF8')),'hex'))FROM pg_proc p WHERE oid=${q(signature)}::regprocedure`));functions.push({...f,signature});}
 const policies=parse(await sql("SELECT jsonb_agg(to_jsonb(p))FROM pg_policies p WHERE schemaname='storage'"));
 const c=buildNormalAccess({functions,policies,companyId:co,inspectorId:actor,baseInspector:{enabled:false,user_id:actor,company_id:co,valid_until:'2026-11-20T00:06:21.514Z'},decoderImage:'sha256:'+'a'.repeat(64)});
 await sql(asOwner(c.active));
 const counts=()=>"SELECT jsonb_build_object('enabled',(SELECT enabled FROM private.image_settings),'grants',("+signatures.map(s=>`has_function_privilege('authenticated',${q(s)},'EXECUTE')::int`).join('+')+"),'rows',(SELECT count(*)FROM private.image_inspector_companies))";
 assert.deepEqual(parse(await sql(asOwner(counts()))),{enabled:true,grants:23,rows:1});
 await sql(asOwner(c.close));await sql(asOwner(c.close));assert.deepEqual(parse(await sql(asOwner(counts()))),{enabled:false,grants:2,rows:1});
 await sql(asOwner(c.full),'Rollback clients to compatible history');
 // Error injected inside the real activation transaction: every DCL/state change rolls back.
 await sql(asOwner(c.active.replace('COMMIT;','DO $$BEGIN RAISE EXCEPTION \'injected-before-commit\';END$$;COMMIT;')),'injected-before-commit');
 assert.deepEqual(parse(await sql(asOwner(counts()))),{enabled:false,grants:2,rows:1});
 await sql(asOwner(c.full.replace('BEGIN;','BEGIN;SET LOCAL connect_image.clients_compatible_with_v2=\'true\';')));assert.deepEqual(parse(await sql(asOwner(counts()))),{enabled:false,grants:0,rows:1});
 report.state='passed-real-postgres-normal-access-close-and-transaction-rollback';report.checks=['activation grants exactly 23 and enables only selected company/inspector','close and repeated close revoke 21; retain two history RPCs','four Storage policies restored exactly; other functions untouched by generation','failed transaction rolls back DCL and settings','full baseline ACL restore requires compatible-client acknowledgement','original inspector/assignment rows retained'];
}finally{await db.stop();report.clusterStopped=true;await fs.writeFile('supabase/candidates/image-message/normal-activation/normal-access-validation.json',JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report));
