import fs from'node:fs/promises';import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{compileExactImageScope}from'../compile-exact-inspector-scope.mjs';
import{compileNormalImageQueue}from'../compile-normal-queue.mjs';
const sha=s=>createHash('sha256').update(s).digest('hex');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,'Eligibility source boundary missing/ambiguous');return s.replace(a,()=>b);};
function definition(source,name){const start=source.indexOf('CREATE OR REPLACE FUNCTION private.'+name+'('),end=source.indexOf('END$$;',start)+6;assert(start>=0&&end>start);return source.slice(start,end);}
export async function compileCompanyEligibility(){
 const worker=await fs.readFile('supabase/candidates/image-message/worker-policies.LOCAL.sql','utf8');
 const exact=await compileExactImageScope(),queue=await compileNormalImageQueue();
 const orig={};
 orig.image_inspector_active=definition(worker.replaceAll('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'),'image_inspector_active');
 orig.image_inspector_scope_guard=definition(exact.body.replaceAll('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'),'image_inspector_scope_guard');
 orig.image_authorized_scope=definition(exact.body.replaceAll('CREATE FUNCTION','CREATE OR REPLACE FUNCTION'),'image_authorized_scope');
 orig.image_claim=queue.sql.trim();orig.image_finish=definition(exact.body,'image_finish');orig.image_storage_allow=definition(exact.body,'image_storage_allow');
 const patched={...orig};
 patched.image_inspector_active=once(orig.image_inspector_active,"JOIN private.company_controls c ON c.company_id=i.company_id AND c.state='active' ","");
 patched.image_inspector_active=once(patched.image_inspector_active,"WHERE i.user_id=auth.uid()AND i.enabled","WHERE i.user_id=auth.uid()AND EXISTS(SELECT 1 FROM private.image_inspector_companies e WHERE e.inspector_id=i.user_id AND private.image_company_eligible(i.user_id,e.company_id))AND i.enabled");
 patched.image_inspector_scope_guard=once(orig.image_inspector_scope_guard,'a.id=new.attachment_id AND a.company_id=i.company_id','a.id=new.attachment_id AND a.company_id=new.company_id');
 patched.image_inspector_scope_guard=once(patched.image_inspector_scope_guard,'i.company_id=new.company_id AND a.media_kind',"private.image_company_eligible(i.user_id,new.company_id)AND new.valid_until<=(SELECT e.valid_until FROM private.image_inspector_companies e WHERE e.inspector_id=i.user_id AND e.company_id=new.company_id)AND private.attachment_author_lock(a.sender_id,a.company_id,a.conversation_id,a.session_id,a.valid_until)AND a.media_kind");
 patched.image_authorized_scope=once(orig.image_authorized_scope,'i.user_id=x.inspector_id AND i.company_id=x.company_id','i.user_id=x.inspector_id AND private.image_company_eligible(i.user_id,x.company_id)');
 patched.image_claim=once(orig.image_claim,"candidate.company_id=i.company_id AND candidate.media_kind='image'","private.image_company_eligible(i.user_id,candidate.company_id)AND candidate.media_kind='image'");
 patched.image_claim=once(patched.image_claim,"SELECT i.user_id,i.company_id,candidate.id","SELECT i.user_id,candidate.company_id,candidate.id");
 patched.image_claim=once(patched.image_claim,"candidate.valid_until,i.valid_until,to_timestamp","candidate.valid_until,i.valid_until,(SELECT e.valid_until FROM private.image_inspector_companies e WHERE e.inspector_id=i.user_id AND e.company_id=candidate.company_id),to_timestamp");
 patched.image_claim=once(patched.image_claim,"media_kind='image'AND company_id=i.company_id","media_kind='image'AND company_id=g.company_id");
 patched.image_finish=once(orig.image_finish,"company_id=(SELECT company_id FROM private.image_inspectors WHERE user_id=auth.uid())","company_id=g.company_id");
 patched.image_storage_allow=once(orig.image_storage_allow,"a.company_id=(SELECT company_id FROM private.image_inspectors WHERE user_id=auth.uid())","private.image_company_eligible(auth.uid(),a.company_id)");
 const ddl=await fs.readFile(new URL('./scope.CANDIDATE.sql',import.meta.url),'utf8');
 const sql=ddl+'\n'+Object.values(patched).join('\n')+'\n';
 assert(!/GRANT\s+(?:EXECUTE|SELECT|INSERT|UPDATE|DELETE|USAGE)/i.test(sql));
 assert.equal((Object.values(patched).join('\n').match(/SECURITY DEFINER/g)||[]).length,6);
 const rollback=Object.values(orig).join('\n')+'\n-- Close and verify worker/Storage/live leases first; retain rows for audit.\nUPDATE private.image_inspector_companies SET enabled=false,revoked_at=coalesce(revoked_at,clock_timestamp());\n';
 return{sql,rollback,metadata:{state:'local-company-scoped-candidate-unapplied-not-hosted-baseline-pinned',newDefiners:0,newInvokerHelpers:1,newPrivateTables:1,existingFunctionsChanged:Object.keys(patched),newClientRpc:0,newOperationalGrants:0,clientChoosesCompany:false,queueSelectsAssignedCompany:true,inspectorApplicationMembershipForbidden:true,defaultEnabled:false,remoteApplied:false,sqlSha256:sha(sql),rollbackSha256:sha(rollback),sourcePins:Object.entries(orig).map(([name,body])=>({name,sha256:sha(body)})),warning:'Local base sources only; current hosted transient rollout/removal guards must be composed and pinned before any migration. Never submit this file as hosted installer.'}};
}
