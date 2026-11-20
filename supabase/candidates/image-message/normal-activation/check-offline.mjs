// One focused compiler/SQL contract check. No PostgreSQL/Auth/Storage simulation.
import fs from'node:fs/promises';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{compose}from'./compile.mjs';
const c=await compose(),sha=s=>createHash('sha256').update(s).digest('hex'),dir='supabase/candidates/image-message/normal-activation/';
const statements=c.forward.replace(/--[^\n]*/g,'');
assert.equal(c.before.length,12);assert.equal(c.metadata.changedDefinitions,8);
assert(c.forward.indexOf('DO $normal_before$')<c.forward.indexOf('CREATE TABLE'));
assert(c.forward.indexOf('DO $normal_capability$')<c.forward.indexOf('CREATE TABLE'));
assert(c.forward.indexOf('CREATE TABLE private.image_company_rollout')<c.forward.indexOf('CREATE FUNCTION private.image_company_eligible'));
assert(c.forward.indexOf('REVOKE ALL ON FUNCTION private.image_company_eligible')<c.forward.indexOf('CREATE OR REPLACE FUNCTION'));
assert(c.forward.indexOf('DO $normal_after$')>c.forward.lastIndexOf('CREATE OR REPLACE FUNCTION'));
assert(c.forward.endsWith('COMMIT;\n')&&c.rollback.endsWith('COMMIT;\n'));
assert(!/\bGRANT\b|SET\s+(?:LOCAL\s+)?ROLE|SET\s+enabled\s*=\s*true/i.test(statements));
assert.equal((c.forward.match(/DEFAULT false/g)||[]).length,2);
assert.equal((c.forward.match(/FORCE ROW LEVEL SECURITY/g)||[]).length,2);
assert.equal(c.metadata.storagePolicyChanges,0);assert.equal(c.metadata.operationalGrants,0);
assert(c.forward.includes('has_function_privilege')&&c.forward.includes('FROM pg_policies'));
for(const f of c.before){
 assert(c.forward.includes(sha(f.body)),'Before source pin omitted');
 const next=c.after.find(x=>x.signature===f.signature);assert(next);
 assert.deepEqual(next.attributes,f.attributes,'Owner/ACL/attributes changed');
 if(next.body!==f.body){assert(c.rollback.includes(f.sql),'Rollback bytes changed');assert(!next.body.includes('scope_pairs')&&!next.body.includes('scope_until'));}
}
const updated=c.after.find(f=>f.name==='image_message_resolve');assert(updated.body.includes('private.message_is_removed'));
assert(c.rollback.indexOf('UPDATE private.image_company_rollout SET enabled=false')<c.rollback.indexOf('CREATE OR REPLACE FUNCTION'));
assert(c.rollback.includes('revoked_at=coalesce(revoked_at,clock_timestamp())'));
assert(c.rollback.includes(')AND('),'Rollback must accept full after OR full before baseline only');
assert(!/\bDELETE\s+FROM|\bDROP\s+(TABLE|FUNCTION|COLUMN)/i.test(c.rollback));
assert(c.rollback.indexOf('DO $normal_restore_after$')>c.rollback.lastIndexOf('CREATE OR REPLACE FUNCTION'));
const result={state:'passed-offline-composition-order-fail-closed-and-lossless-rollback-contract',compilerRunsForCheck:1,postgresExecuted:false,hostedCalls:0,mediaTests:0,reviewedDefinitions:12,changedDefinitions:8,grantsGenerated:0,existingStoragePoliciesChanged:0,checks:18,forwardSha256:sha(c.forward),rollbackSha256:sha(c.rollback),limits:['Static SQL/compiler contract, not execution or replay in PostgreSQL.','Hosted baseline must be revalidated by structural read before eventual approved application; no sessions queried.','Installation demands already-reviewed CREATE-private capability; script never elevates.']};
await fs.writeFile(dir+'offline-check.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
