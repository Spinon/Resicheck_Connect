// Only the new maintenance envelope; no repeat of SQL isolation/media tests.
import assert from'node:assert/strict';import fs from'node:fs/promises';import{prepare}from'./prepare-managed.mjs';
const p=await prepare();
for(const sql of[p.forward,p.rollback]){
 assert(sql.startsWith('BEGIN;')&&sql.endsWith('COMMIT;\n'));
 const enable=sql.indexOf('GRANT connect_hmac_registration TO postgres WITH SET TRUE GRANTED BY postgres;'),create=sql.indexOf('GRANT CREATE ON SCHEMA private TO postgres;'),body=sql.indexOf('DO $normal_before$')>=0?sql.indexOf('DO $normal_before$'):sql.indexOf('DO $normal_restore_before$'),revoke=sql.lastIndexOf('REVOKE CREATE ON SCHEMA private FROM postgres;'),disable=sql.lastIndexOf('GRANT connect_hmac_registration TO postgres WITH SET FALSE GRANTED BY postgres;'),verify=sql.lastIndexOf('_restored$BEGIN');
 assert(enable>0&&create>enable&&body>create&&revoke>body&&disable>revoke&&verify>disable&&verify<sql.lastIndexOf('COMMIT;'));
 const stripped=sql.replace(/--[^\n]*/g,'');assert.equal((stripped.match(/\bGRANT\b/g)||[]).length,3);
 assert(!/GRANT\s+(?:EXECUTE|SELECT|INSERT|UPDATE|DELETE|USAGE|ALL)|GRANTED BY supabase_admin|WITH ADMIN TRUE|WITH INHERIT TRUE/i.test(stripped));
 assert(sql.includes('pg_auth_members')&&sql.includes("'grantor'")&&sql.includes('nspacl')&&sql.includes('IS DISTINCT FROM'));
 assert(!/\bCREATE\s+(?:USER|ROLE)|\bALTER\s+ROLE|SET ROLE supabase_admin/i.test(stripped));
}
assert.equal(p.installRequest.project_id,'ibdlvlwdzmsrbqadrudb');assert.equal(p.metadata.persistentPrivilegeDelta,0);
const result={state:'passed-offline-official-maintenance-envelope-order-and-restoration-contract',runs:1,sqlExecuted:false,hostedCalls:0,nativeRequestSubmitted:false,privilegedStatements:'3 GRANTs: own SET true, temporary CREATE, own SET false; temporary CREATE revoked before commit',forwardSha256:p.metadata.forwardSha256,rollbackSha256:p.metadata.rollbackSha256,limitation:'Static composition check; no PostgreSQL execution or claim of hosted capability. Existing official documented ADMIN path still requires applicable approval.'};
await fs.writeFile('supabase/candidates/image-message/normal-activation/managed-offline-check.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
