// Official-connector request artifacts ONLY. Never sends a migration or changes ACL.
import fs from'node:fs/promises';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{compose}from'./compile.mjs';
const root='supabase/candidates/image-message/',out=root+'normal-activation/',sha=s=>createHash('sha256').update(s).digest('hex'),q=s=>"'"+s.replaceAll("'","''")+"'";
const read=p=>fs.readFile(p,'utf8'),json=async p=>JSON.parse(await read(p));
export async function prepare(){
 const b=await json(root+'normal-rollout-managed.READONLY.json'),c=await compose();
 assert.equal(b.currentUser,'postgres');assert.equal(b.sessionUser,'postgres');assert.equal(b.privateSchema.owner,'connect_hmac_registration');assert.equal(b.privateSchema.postgresCreate,false);
 assert.equal(b.memberships.length,2);assert(b.memberships.every(x=>!x.set&&!x.inherit));
 assert(b.memberships.some(x=>x.grantor==='supabase_admin'&&x.admin));assert(b.memberships.some(x=>x.grantor==='postgres'&&!x.admin));
 const expected={schema:b.privateSchema,memberships:[...b.memberships].sort((a,b)=>a.grantor.localeCompare(b.grantor))};
 const snapshot=`jsonb_build_object('schema',(SELECT jsonb_build_object('owner',pg_get_userbyid(nspowner),'acl',nspacl,'postgresCreate',has_schema_privilege('postgres','private','CREATE'))FROM pg_namespace WHERE oid='private'::regnamespace),'memberships',(SELECT jsonb_agg(jsonb_build_object('role',pg_get_userbyid(roleid),'member',pg_get_userbyid(member),'grantor',pg_get_userbyid(grantor),'admin',admin_option,'inherit',inherit_option,'set',set_option)ORDER BY pg_get_userbyid(grantor))FROM pg_auth_members WHERE roleid='connect_hmac_registration'::regrole AND member='postgres'::regrole))`;
 const verify=tag=>`DO $${tag}$BEGIN IF current_user<>'postgres'OR session_user<>'postgres'OR ${snapshot} IS DISTINCT FROM ${q(JSON.stringify(expected))}::jsonb THEN RAISE EXCEPTION 'Exact schema ACL and role grantors/options required';END IF;END $${tag}$;\n`;
 const enter='GRANT connect_hmac_registration TO postgres WITH SET TRUE GRANTED BY postgres;\nSET LOCAL ROLE connect_hmac_registration;\nGRANT CREATE ON SCHEMA private TO postgres;\nSET LOCAL ROLE postgres;\n';
 const restore='SET LOCAL ROLE connect_hmac_registration;\nREVOKE CREATE ON SCHEMA private FROM postgres;\nSET LOCAL ROLE postgres;\nGRANT connect_hmac_registration TO postgres WITH SET FALSE GRANTED BY postgres;\n';
 const prefix="BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';SELECT pg_advisory_xact_lock(900001,521);\n";
 const wrap=(sql,tag)=>{assert(sql.startsWith(prefix)&&sql.endsWith('COMMIT;\n'));return prefix+verify(tag+'_before')+enter+sql.slice(prefix.length,-'COMMIT;\n'.length)+restore+verify(tag+'_restored')+'COMMIT;\n';};
 const forward=wrap(c.forward,'normal_managed_install'),rollback=wrap(c.rollback,'normal_managed_restore');
 const previous=await json(root+'normal-rollout-managed-closed.REQUEST.UNAPPLIED.json');
 const request=(name,query)=>({link_id:previous.link_id,project_id:'ibdlvlwdzmsrbqadrudb',name,query});
 const metadata={state:'prepared-official-transactional-maintenance-requests-unsubmitted',projectId:'ibdlvlwdzmsrbqadrudb',connector:'supabase_apply_migration official; native cards retained',hostedCalls:0,submitted:false,nativeApprovalPending:false,forwardSha256:sha(forward),rollbackSha256:sha(rollback),innerForwardSha256:sha(c.forward),innerRollbackSha256:sha(c.rollback),temporaryEffects:['Enable SET only own existing postgres-granted membership; ADMIN/INHERIT unchanged.','Use schema owner to grant CREATE-private to postgres within transaction.','Create two closed private tables/helper and replace only eight pinned existing bodies as postgres.','Revoke the temporary CREATE; restore own SET=false; assert exact original schema ACL and both membership grantors/options before commit.'],privilegeScope:'While SET is enabled postgres can act as the owner of entire private schema; not technically restricted to eight functions. Only reviewed immutable SQL may run inside this transaction.',persistentPrivilegeDelta:0,newOperationalGrants:0,existingStoragePolicyChanges:0,newCredentials:0,requiresSpecificReview:true,notAuthorizedByPriorSingleFunctionMaintenance:true,failure:'Any failed assertion aborts complete transaction; do not submit another channel or repeat uncertain request.',officialReferences:['https://supabase.com/kb/troubleshooting/cant-revoke-a-role-membership-granted-by-supabase_admin-d08922','https://www.postgresql.org/docs/17/sql-grant.html']};
 return{forward,rollback,installRequest:request('connect_image_normal_company_guard_closed',forward),rollbackRequest:request('connect_image_normal_company_guard_restore_closed',rollback),metadata};
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/normal-activation/prepare-managed.mjs')){
 assert.deepEqual(process.argv.slice(2),['--prepare-only']);const p=await prepare();
 for(const[file,value]of[['install.MANAGED.REQUEST.UNAPPLIED.json',p.installRequest],['rollback.MANAGED.REQUEST.UNAPPLIED.json',p.rollbackRequest],['managed-metadata.PREPARED.json',p.metadata]])await fs.writeFile(out+file,JSON.stringify(value,null,2)+'\n');
 await fs.writeFile(out+'install.MANAGED.CLOSED.UNAPPLIED.sql',p.forward);await fs.writeFile(out+'rollback.MANAGED.CLOSED.UNAPPLIED.sql',p.rollback);
 console.log(JSON.stringify(p.metadata));
}
