import fs from'node:fs/promises';import assert from'node:assert/strict';import{createHash}from'node:crypto';
const root='supabase/candidates/image-message/',sha=s=>createHash('sha256').update(s).digest('hex');
/** Compile mandatory SQL authorization into existing entry points. No feature
 * toggle or caller-provided scope bypass. The old broad bodies remain historical
 * inputs only; the currently selected combined installer embeds these replacements. */
export async function compileExactImageScope(){
 const source=await fs.readFile(root+'worker-policies.LOCAL.sql','utf8'),ddl=await fs.readFile(root+'exact-inspector-scope.LOCAL.sql','utf8');
 const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'Exact scope source boundary missing/ambiguous');return s.replace(a,()=>b);};
 const fn=name=>{const start=source.indexOf('CREATE FUNCTION private.'+name+'('),end=source.indexOf('$;',source.indexOf('AS $',start)+5)+3;assert(start>=0&&end>start);return source.slice(start,end).replace('CREATE FUNCTION','CREATE OR REPLACE FUNCTION');};
 let claim=fn('image_claim');
 claim=once(claim,'pin text;until_at timestamptz;','pin text;until_at timestamptz;g private.image_inspection_scopes;');
 claim=once(claim," IF NOT private.image_inspector_active()THEN RAISE EXCEPTION 'Image unavailable';END IF;"," g:=private.image_authorized_scope(p_attachment);");
 claim=once(claim,"IF j.inspector_id<>i.user_id OR j.session_id::text IS DISTINCT FROM auth.jwt()->>'session_id'OR j.decoder_image<>pin","IF j.scope_id IS DISTINCT FROM g.id OR j.inspector_id<>i.user_id OR j.session_id::text IS DISTINCT FROM auth.jwt()->>'session_id'OR j.decoder_image<>pin");
 claim=once(claim,"a.valid_until,i.valid_until,to_timestamp","a.valid_until,i.valid_until,g.valid_until,to_timestamp");
 claim=once(claim,"INSERT INTO private.image_inspection_jobs VALUES(a.id,gen_random_uuid(),i.user_id,(auth.jwt()->>'session_id')::uuid,until_at,pin,1,NULL)",
  "INSERT INTO private.image_inspection_jobs(attachment_id,lease_id,inspector_id,session_id,valid_until,decoder_image,attempts,result,scope_id)VALUES(a.id,gen_random_uuid(),i.user_id,(auth.jwt()->>'session_id')::uuid,until_at,pin,1,NULL,g.id)");
 claim=once(claim,'attempts=private.image_inspection_jobs.attempts+1,result=NULL RETURNING','attempts=private.image_inspection_jobs.attempts+1,result=NULL,scope_id=excluded.scope_id RETURNING');
 claim=once(claim,"INSERT INTO private.image_lease_events(attachment_id,lease_id,event)VALUES(a.id,j.lease_id,'claimed')","INSERT INTO private.image_lease_events(attachment_id,lease_id,event,scope_id)VALUES(a.id,j.lease_id,'claimed',g.id)");
 let finish=fn('image_finish');
 finish=once(finish,'proof jsonb;r jsonb;','proof jsonb;r jsonb;g private.image_inspection_scopes;');
 finish=once(finish," IF NOT private.image_inspector_active()OR p_lease IS NULL OR p_pass IS NULL THEN"," g:=private.image_authorized_scope(p_attachment);\n IF p_lease IS NULL OR p_pass IS NULL THEN");
 finish=once(finish,'IF j.lease_id IS DISTINCT FROM p_lease','IF j.scope_id IS DISTINCT FROM g.id OR j.lease_id IS DISTINCT FROM p_lease');
 finish=once(finish,"INSERT INTO private.image_lease_events(attachment_id,lease_id,event,proof_sha256)VALUES(a.id,j.lease_id,'finished',sha256(convert_to(proof::text,'UTF8')))","INSERT INTO private.image_lease_events(attachment_id,lease_id,event,proof_sha256,scope_id)VALUES(a.id,j.lease_id,'finished',sha256(convert_to(proof::text,'UTF8')),g.id)");
 let storage=fn('image_storage_allow');
 storage=once(storage,'metadata_op boolean;get_op boolean;','metadata_op boolean;get_op boolean;g private.image_inspection_scopes;');
 storage=once(storage,"   SELECT * INTO STRICT j FROM private.image_inspection_jobs","   g:=private.image_authorized_scope(a.id);\n   SELECT * INTO STRICT j FROM private.image_inspection_jobs");
 storage=once(storage,'WHERE attachment_id=a.id AND inspector_id=auth.uid()','WHERE attachment_id=a.id AND scope_id=g.id AND inspector_id=auth.uid()');
 const body=ddl+'\n'+claim+'\n'+finish+'\n'+storage+'\n';
 assert(!/\bGRANT\b/i.test(body.replace(/--[^\n]*/g,'')));
 const guard="DO $$BEGIN IF current_user<>'postgres'OR EXISTS(SELECT 1 FROM private.image_settings WHERE enabled)OR EXISTS(SELECT 1 FROM private.image_worker_settings WHERE enabled OR storage_enabled)OR EXISTS(SELECT 1 FROM private.image_inspectors WHERE enabled)OR EXISTS(SELECT 1 FROM private.image_inspection_jobs)OR EXISTS(SELECT 1 FROM private.image_lease_events)OR to_regclass('private.image_inspection_scopes')IS NOT NULL THEN RAISE EXCEPTION 'Exact image scope preflight refused';END IF;END$$;\n";
 return{body,guard,metadata:{state:'exact-inspector-scope-closed-local-unapplied',sha256:sha(body),newPrivateTables:1,newPrivateFunctions:2,overrides:['private.image_claim(uuid)','private.image_finish(uuid,uuid,text,integer,boolean,text,integer,integer,text)','private.image_storage_allow(text,text,text,boolean)'],operationalGrants:0,enabled:false,remoteApplied:false}};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/compile-exact-inspector-scope.mjs')){
 const c=await compileExactImageScope();await fs.writeFile(root+'exact-inspector-scope.COMPILED.UNAPPLIED.sql',c.body);await fs.writeFile(root+'exact-inspector-scope-candidate.json',JSON.stringify(c.metadata,null,2)+'\n');console.log(JSON.stringify(c.metadata));
}

