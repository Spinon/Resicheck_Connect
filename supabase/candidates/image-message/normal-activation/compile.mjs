// Offline composition. Recorded catalog/DDL only; no connector or Auth calls.
import fs from'node:fs/promises';import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{compileCompanyEligibility}from'../normal-eligibility/compile.mjs';
const base='supabase/candidates/image-message/',sha=s=>createHash('sha256').update(s).digest('hex'),q=s=>"'"+s.replaceAll("'","''")+"'";
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'Source anchor missing/ambiguous');return s.replace(a,()=>b);};
function functions(sql){const out=new Map(),rx=/CREATE OR REPLACE FUNCTION private\.(\w+)\([\s\S]*?AS (\$[a-zA-Z_]*\$)([\s\S]*?)\2;/g;for(const m of sql.matchAll(rx)){assert(!out.has(m[1]));out.set(m[1],{name:m[1],sql:m[0],body:m[3],delimiter:m[2],header:m[0].slice(0,m[0].indexOf('AS '+m[2]))});}return out;}
const withBody=(f,body)=>({...f,body,sql:f.header+'AS '+f.delimiter+body+f.delimiter+';'});
const temporal=co=>`EXISTS(SELECT 1 FROM private.image_settings rollout WHERE rollout.singleton AND rollout.enabled AND clock_timestamp()<rollout.scope_until AND (${co}::text||':'||auth.uid()::text)=ANY(rollout.scope_pairs))`;
const normal=co=>`EXISTS(SELECT 1 FROM private.image_company_rollout rollout JOIN private.company_controls control ON control.company_id=rollout.company_id AND control.state='active' WHERE rollout.company_id=${co} AND rollout.enabled)`;
const preamble="BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';SELECT pg_advisory_xact_lock(900001,521);\n";
const closed=`EXISTS(SELECT 1 FROM private.image_settings WHERE enabled OR cardinality(scope_pairs)<>0 OR scope_until<>'-infinity'::timestamptz)OR EXISTS(SELECT 1 FROM private.image_worker_settings WHERE enabled OR storage_enabled)OR EXISTS(SELECT 1 FROM private.image_inspectors WHERE enabled)OR EXISTS(SELECT 1 FROM private.image_inspection_scopes WHERE revoked_at IS NULL AND valid_until>clock_timestamp())OR EXISTS(SELECT 1 FROM private.image_inspection_jobs WHERE result IS NULL AND valid_until>clock_timestamp())`;
const pins=entries=>entries.map(f=>`(to_regprocedure(${q(f.signature)})IS NULL OR(SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex')FROM pg_proc WHERE oid=to_regprocedure(${q(f.signature)}))IS DISTINCT FROM ${q(sha(f.body))} OR(SELECT to_jsonb(p)-'prosrc' FROM pg_proc p WHERE oid=to_regprocedure(${q(f.signature)}))IS DISTINCT FROM ${q(JSON.stringify(f.attributes))}::jsonb)`).join(' OR ');
export async function compose(){
 const raw=await fs.readFile(base+'normal-rollout-managed.READONLY.json','utf8'),catalog=JSON.parse(raw);
 const installed=JSON.parse(await fs.readFile(base+'normal-rollout-managed-installed-current.json','utf8'));
 const request=JSON.parse(await fs.readFile(base+'normal-rollout-managed-closed.REQUEST.UNAPPLIED.json','utf8'));
 assert.equal(sha(request.query),installed.querySha256,'Recorded installed DDL bytes differ');
 const current=functions(request.query);assert.equal(current.size,8);
 for(const f of installed.postflight.functions){const name=f.signature.match(/private\.(\w+)/)[1];assert.equal(sha(current.get(name).body),f.bodySha256);}
 const eligibility=await compileCompanyEligibility(),old=functions(eligibility.rollback),eligible=functions(eligibility.sql);assert.equal(old.size,6);assert.equal(eligible.size,6);
 for(const f of old.values())if(!current.has(f.name))current.set(f.name,f);assert.equal(current.size,12);
 for(const f of current.values()){
  const recorded=catalog.functionInvariants.find(x=>x.signature.startsWith('private.'+f.name+'('));assert(recorded);
  const after=installed.postflight.functions.find(x=>x.signature===recorded.signature);
  assert.equal(sha(f.body),after?.bodySha256??recorded.bodySha256,'Unproved current source '+f.name);
  f.signature=recorded.signature;f.attributes=recorded.attributes;
 }
 const changed=new Map();
 for(const f of current.values()){
  let body=f.body;
  if(f.name==='image_catalog_authorize')body=once(body,temporal('p_company'),normal('p_company'));
  // History authorization must survive image feature OFF. Preserve every other
  // actor/conversation/pagination/tombstone check; image bytes still use authorizer.
  else if(f.name==='read_messages_projection_v3')body=once(body,temporal('p_company')+'or not private.active_actor()','private.active_actor()');
  else if(f.name==='image_storage_allow'){
   body=once(body,temporal('a.company_id'),normal('a.company_id'));
   body=once(body,'a.company_id=(SELECT company_id FROM private.image_inspectors WHERE user_id=auth.uid())','private.image_company_eligible(auth.uid(),a.company_id)');
  }else if(f.name==='image_inspector_active'){
   assert.equal(once(body,'WHERE '+temporal('i.company_id')+'AND i.user_id=auth.uid()AND','WHERE i.user_id=auth.uid()AND'),old.get(f.name).body,'Preserve current inspector checks');
   body=eligible.get(f.name).body;
  }else if(eligible.has(f.name))body=eligible.get(f.name).body;
  if(body!==f.body)changed.set(f.name,withBody(f,body));
 }
 assert.equal(changed.size,8);for(const f of changed.values())assert(!f.body.includes('scope_pairs')&&!f.body.includes('scope_until'));
 let assignment=await fs.readFile(base+'normal-eligibility/scope.CANDIDATE.sql','utf8');
 assignment=once(assignment,'AND i.enabled AND i.valid_until>clock_timestamp()','AND '+normal('e.company_id')+' AND i.enabled AND i.valid_until>clock_timestamp()');
 // Owner-specific policies on NEW private tables only: no BYPASSRLS assumption.
 assignment=once(assignment,'ALTER TABLE private.image_inspector_companies FORCE ROW LEVEL SECURITY;',"ALTER TABLE private.image_inspector_companies FORCE ROW LEVEL SECURITY;\nCREATE POLICY image_company_assignment_owner ON private.image_inspector_companies TO postgres USING(true)WITH CHECK(true);");
 const company=`CREATE TABLE private.image_company_rollout(company_id uuid PRIMARY KEY REFERENCES public.companies(id),enabled boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT clock_timestamp());
ALTER TABLE private.image_company_rollout ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.image_company_rollout FORCE ROW LEVEL SECURITY;
CREATE POLICY image_company_rollout_owner ON private.image_company_rollout TO postgres USING(true)WITH CHECK(true);
REVOKE ALL ON private.image_company_rollout FROM PUBLIC,anon,authenticated,service_role;
`;
 const before=[...current.values()],after=before.map(f=>changed.get(f.name)??f);
 const access=JSON.parse(await fs.readFile(base+'normal-rollout-readiness.READONLY.json','utf8')).access;assert.equal(access.length,23);assert(access.every(x=>!x.authenticated&&!x.anon&&!x.serviceRole));
 const policies=catalog.policies.filter(x=>x.schemaname==='storage'&&x.tablename==='objects'&&['image_bucket_select_fence','image_bucket_select','image_bucket_insert_fence','image_bucket_insert'].includes(x.policyname));assert.equal(policies.length,4);
 const accessPins=access.flatMap(x=>['authenticated','anon','service_role'].map(role=>`has_function_privilege(${q(role)},${q(x.signature)},'EXECUTE')IS DISTINCT FROM false`)).join(' OR ');
 const policyPins=`(SELECT jsonb_agg(to_jsonb(p)ORDER BY p.policyname)FROM pg_policies p WHERE p.schemaname='storage'AND p.tablename='objects'AND p.policyname=ANY(ARRAY[${policies.map(p=>q(p.policyname)).join(',')}]))IS DISTINCT FROM ${q(JSON.stringify([...policies].sort((a,b)=>a.policyname.localeCompare(b.policyname))))}::jsonb`;
 const guard=(tag,extra)=>`DO $${tag}$BEGIN IF current_user<>'postgres'OR ${closed} OR ${accessPins} OR ${policyPins} OR ${extra} THEN RAISE EXCEPTION 'Normal image activation baseline differs';END IF;END $${tag}$;\n`;
 const capability="DO $normal_capability$BEGIN IF NOT has_schema_privilege(current_user,'private','CREATE')THEN RAISE EXCEPTION 'Reviewed schema maintenance capability required; no elevation in this script';END IF;END $normal_capability$;\n";
 const newClosed=" OR EXISTS(SELECT 1 FROM private.image_company_rollout WHERE enabled)OR EXISTS(SELECT 1 FROM private.image_inspector_companies WHERE enabled)OR EXISTS(SELECT 1 FROM pg_class c WHERE c.oid IN('private.image_company_rollout'::regclass,'private.image_inspector_companies'::regclass)AND(NOT c.relrowsecurity OR NOT c.relforcerowsecurity OR pg_get_userbyid(c.relowner)<>'postgres'))OR(SELECT prosecdef FROM pg_proc WHERE oid='private.image_company_eligible(uuid,uuid)'::regprocedure)OR has_function_privilege('authenticated','private.image_company_eligible(uuid,uuid)','EXECUTE')";
 const forward=preamble+guard('normal_before',pins(before)+" OR to_regclass('private.image_company_rollout')IS NOT NULL OR to_regclass('private.image_inspector_companies')IS NOT NULL OR to_regprocedure('private.image_company_eligible(uuid,uuid)')IS NOT NULL")+capability+company+assignment+'\n'+[...changed.values()].map(f=>f.sql).join('\n')+'\n'+guard('normal_after',pins(after)+newClosed)+'COMMIT;\n';
 const rollback=preamble+guard('normal_restore_before','(('+pins(after)+')AND('+pins(before)+'))')+capability+
 '-- Close NEW assignments only; retain all rows, original media and audit.\nUPDATE private.image_company_rollout SET enabled=false;\nUPDATE private.image_inspector_companies SET enabled=false,revoked_at=coalesce(revoked_at,clock_timestamp());\n'+[...changed.keys()].map(name=>current.get(name).sql).join('\n')+'\n'+guard('normal_restore_after',pins(before)+newClosed)+'COMMIT;\n';
 assert(!/\bGRANT\b|SET\s+(?:LOCAL\s+)?ROLE|scope_until\s*=\s*'infinity'/i.test(forward.replace(/--[^\n]*/g,'')));assert(!/\bDELETE\s+FROM|\bDROP\s+(?:TABLE|FUNCTION|COLUMN)/i.test(rollback));
 return{forward,rollback,before,after,metadata:{state:'offline-composed-pinned-closed-no-operational-access',projectId:'ibdlvlwdzmsrbqadrudb',recordedCatalogSha256:sha(raw),installedMigrationSha256:sha(request.query),reviewedDefinitions:12,changedDefinitions:8,newSecurityDefiners:0,newPrivateTables:2,newPrivateInvokerHelpers:1,operationalGrants:0,storagePolicyChanges:0,defaultEnabled:false,remoteApplied:false,executorCapability:'Approved postgres CREATE-private maintenance must be provided by separately reviewed official transaction; no role/elevation generated.',rollbackKeepsClosedNewStructures:true,policyBaselineSha256:sha(JSON.stringify(policies)),recordedAccess:access,definitions:before.map(f=>({signature:f.signature,beforeSha256:sha(f.body),afterSha256:sha((changed.get(f.name)??f).body),attributesSha256:sha(JSON.stringify(f.attributes))})),forwardSha256:sha(forward),rollbackSha256:sha(rollback)}};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/normal-activation/compile.mjs')){
 assert.deepEqual(process.argv.slice(2),['--prepare-only']);const c=await compose(),dir=base+'normal-activation/';
 await fs.writeFile(dir+'install.CLOSED.UNAPPLIED.sql',c.forward);await fs.writeFile(dir+'rollback.CLOSED.UNAPPLIED.sql',c.rollback);await fs.writeFile(dir+'metadata.PREPARED.json',JSON.stringify(c.metadata,null,2)+'\n');console.log(JSON.stringify({state:c.metadata.state,reviewedDefinitions:12,changedDefinitions:8,forwardSha256:c.metadata.forwardSha256,rollbackSha256:c.metadata.rollbackSha256,remoteCalls:0}));
}
