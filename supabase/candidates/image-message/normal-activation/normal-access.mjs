// Build normal access DCL/settings only. No Auth call, SQL execution or elevation.
import fs from'node:fs/promises';import assert from'node:assert/strict';import{createHash}from'node:crypto';import{compose}from'./compile.mjs';
const root='supabase/candidates/image-message/',out=root+'normal-activation/',sha=s=>createHash('sha256').update(s).digest('hex'),q=s=>"'"+String(s).replaceAll("'","''")+"'";
const uuid=s=>/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(s);
const prefix="BEGIN;SET LOCAL lock_timeout='3s';SET LOCAL statement_timeout='30s';SELECT pg_advisory_xact_lock(900001,521);\n";
export function buildNormalAccess(input){
 const{functions,policies,companyId:co,inspectorId:actor,baseInspector,decoderImage,assignmentDays=30}=input;
 assert(functions.length===23&&policies.length===4&&uuid(co)&&uuid(actor)&&assignmentDays>=1&&assignmentDays<=90&&Number.isInteger(assignmentDays));
 assert(baseInspector.enabled===false&&baseInspector.user_id===actor&&baseInspector.company_id===co);assert(/^sha256:[a-f0-9]{64}$/.test(decoderImage));
 const history=f=>/^(?:public\.)?read_connect_messages_v3\(|^private\.read_messages_projection_v3\(/.test(f.signature);assert.equal(functions.filter(history).length,2);
 const names=functions.map(x=>x.signature).join(','),images=functions.filter(x=>!history(x)).map(x=>x.signature).join(','),hist=functions.filter(history).map(x=>x.signature).join(',');
 const array=a=>q(JSON.stringify([...a].sort()))+'::jsonb';
 const invariants=functions.map(f=>{const attributes={...f.attributes};delete attributes.proacl;assert(Array.isArray(f.attributes.proacl));return `(SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex')FROM pg_proc WHERE oid=to_regprocedure(${q(f.signature)}))IS DISTINCT FROM ${q(f.bodySha256)} OR(SELECT to_jsonb(p)-'prosrc'-'proacl'FROM pg_proc p WHERE oid=to_regprocedure(${q(f.signature)}))IS DISTINCT FROM ${q(JSON.stringify(attributes))}::jsonb`;}).join(' OR ');
 const acl=mode=>functions.map(f=>{const active=mode==='active'||mode==='history'&&history(f),expected=[...f.attributes.proacl,...(active?['authenticated=X/postgres']:[])];assert(!f.attributes.proacl.some(x=>/^authenticated=/.test(x)));return `(SELECT coalesce(jsonb_agg(x::text ORDER BY x::text),'[]'::jsonb)FROM pg_proc p CROSS JOIN LATERAL unnest(p.proacl)x WHERE p.oid=to_regprocedure(${q(f.signature)}))IS DISTINCT FROM ${array(expected)} OR has_function_privilege('anon',${q(f.signature)},'EXECUTE')OR has_function_privilege('service_role',${q(f.signature)},'EXECUTE')`;}).join(' OR ');
 const policyStatement=(p,expr)=>'ALTER POLICY '+p.policyname+' ON storage.objects '+(p.cmd==='SELECT'?'USING':'WITH CHECK')+'('+expr+');';
 const normalExpr=p=>"CASE WHEN bucket_id='connect-private-images'THEN private.image_storage_allow(bucket_id,name,owner_id,"+(p.cmd==='INSERT'?'true':'false')+")ELSE "+(p.permissive==='RESTRICTIVE'?'true':'false')+' END';
 const restorePolicies=policies.map(p=>policyStatement(p,p.cmd==='SELECT'?p.qual:p.with_check)).join('\n');
 const normalPolicies=policies.map(p=>policyStatement(p,normalExpr(p))).join('\n');
 const policyRows="SELECT schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check FROM pg_policies WHERE schemaname='storage'AND tablename='objects'AND policyname=ANY(ARRAY["+policies.map(p=>q(p.policyname)).join(',')+'])';
 const baselinePolicies=`(SELECT jsonb_agg(to_jsonb(p)ORDER BY policyname)FROM(${policyRows})p)IS DISTINCT FROM ${q(JSON.stringify([...policies].sort((a,b)=>a.policyname.localeCompare(b.policyname))))}::jsonb`;
 const normalPolicyRows=policies.map(p=>({...p,[p.cmd==='SELECT'?'qual':'with_check']:"\nCASE\n    WHEN (bucket_id = 'connect-private-images'::text) THEN private.image_storage_allow(bucket_id, name, owner_id, "+(p.cmd==='INSERT'?'true':'false')+")\n    ELSE "+(p.permissive==='RESTRICTIVE'?'true':'false')+'\nEND'}));
 const activePolicies=`(SELECT jsonb_agg(to_jsonb(p)ORDER BY policyname)FROM(${policyRows})p)IS DISTINCT FROM ${q(JSON.stringify(normalPolicyRows.sort((a,b)=>a.policyname.localeCompare(b.policyname))))}::jsonb`;
 const noOther="EXISTS(SELECT 1 FROM private.image_company_rollout WHERE enabled AND company_id<>"+q(co)+")OR EXISTS(SELECT 1 FROM private.image_inspector_companies WHERE enabled AND(inspector_id<>"+q(actor)+'OR company_id<>'+q(co)+'))';
 const closed="EXISTS(SELECT 1 FROM private.image_settings WHERE enabled OR cardinality(scope_pairs)<>0 OR scope_until<>'-infinity'::timestamptz)OR EXISTS(SELECT 1 FROM private.image_worker_settings WHERE enabled OR storage_enabled)OR EXISTS(SELECT 1 FROM private.image_inspectors WHERE enabled)";
 const guard=(tag,condition)=>`DO $${tag}$BEGIN IF current_user<>'postgres'OR session_user<>'postgres'OR ${invariants} OR ${condition} THEN RAISE EXCEPTION 'Normal image access state differs';END IF;END $${tag}$;\n`;
 const layout="to_regclass('private.image_company_rollout')IS NULL OR to_regclass('private.image_inspector_companies')IS NULL OR(SELECT prosecdef FROM pg_proc WHERE oid='private.image_company_eligible(uuid,uuid)'::regprocedure)OR has_function_privilege('authenticated','private.image_company_eligible(uuid,uuid)','EXECUTE')";
 const active=prefix+guard('image_normal_before',layout+' OR '+closed+' OR '+noOther+' OR '+baselinePolicies+' OR (('+acl('baseline')+')AND('+acl('history')+'))')+
 `DO $image_normal_config$BEGIN
 IF NOT EXISTS(SELECT 1 FROM private.company_controls WHERE company_id=${q(co)}AND state='active')OR NOT EXISTS(SELECT 1 FROM private.image_inspectors WHERE user_id=${q(actor)}AND company_id=${q(co)}AND NOT enabled)OR EXISTS(SELECT 1 FROM public.memberships WHERE user_id=${q(actor)})OR EXISTS(SELECT 1 FROM private.accounts WHERE user_id=${q(actor)}AND state='active')OR EXISTS(SELECT 1 FROM private.audio_inspectors WHERE user_id=${q(actor)})THEN RAISE EXCEPTION 'Exclusive image inspector/company required';END IF;
 INSERT INTO private.image_company_rollout(company_id,enabled)VALUES(${q(co)},true)ON CONFLICT(company_id)DO UPDATE SET enabled=true;
 INSERT INTO private.image_inspector_companies(inspector_id,company_id,enabled,valid_until,revoked_at)VALUES(${q(actor)},${q(co)},true,clock_timestamp()+interval'${assignmentDays} days',null)ON CONFLICT(inspector_id,company_id)DO UPDATE SET enabled=true,valid_until=excluded.valid_until,revoked_at=null;
 UPDATE private.image_inspectors SET enabled=true,valid_until=clock_timestamp()+interval'${assignmentDays} days'WHERE user_id=${q(actor)}AND company_id=${q(co)};
 UPDATE private.image_settings SET enabled=true WHERE singleton;IF NOT FOUND THEN RAISE EXCEPTION 'Settings missing';END IF;
 UPDATE private.image_worker_settings SET enabled=true,storage_enabled=true,decoder_image=${q(decoderImage)}WHERE singleton;IF NOT FOUND THEN RAISE EXCEPTION 'Worker settings missing';END IF;
 END $image_normal_config$;
 GRANT EXECUTE ON FUNCTION ${names} TO authenticated;
 ${normalPolicies}
 `+guard('image_normal_after','('+acl('active')+')OR '+activePolicies+' OR '+noOther+" OR NOT EXISTS(SELECT 1 FROM private.image_company_rollout WHERE company_id="+q(co)+"AND enabled)OR NOT EXISTS(SELECT 1 FROM private.image_settings WHERE singleton AND enabled AND cardinality(scope_pairs)=0 AND scope_until='-infinity'::timestamptz)")+'COMMIT;\n';
 const close=prefix+guard('image_normal_close_before',layout+' OR '+noOther+' OR (('+activePolicies+')AND('+baselinePolicies+')) OR (('+acl('active')+')AND('+acl('history')+'))')+
 `UPDATE private.image_settings SET enabled=false WHERE singleton;
 UPDATE private.image_worker_settings SET enabled=false,storage_enabled=false,decoder_image=null WHERE singleton;
 UPDATE private.image_company_rollout SET enabled=false WHERE company_id=${q(co)};
 UPDATE private.image_inspector_companies SET enabled=false,revoked_at=coalesce(revoked_at,clock_timestamp())WHERE inspector_id=${q(actor)}AND company_id=${q(co)};
 UPDATE private.image_inspectors SET enabled=false,valid_until=${q(baseInspector.valid_until)}::timestamptz WHERE user_id=${q(actor)}AND company_id=${q(co)};
 UPDATE private.image_inspection_scopes SET revoked_at=clock_timestamp()WHERE inspector_id=${q(actor)}AND company_id=${q(co)}AND revoked_at IS NULL;
 REVOKE EXECUTE ON FUNCTION ${images} FROM authenticated;
 ${restorePolicies}
 `+guard('image_normal_close_after',closed+' OR '+noOther+' OR '+baselinePolicies+' OR '+acl('history'))+'COMMIT;\n';
 const full=prefix+guard('image_normal_restore_before',closed+' OR '+noOther+' OR '+baselinePolicies+' OR (('+acl('baseline')+')AND('+acl('history')+'))')+
 "DO $client_history_rollback$BEGIN IF current_setting('connect_image.clients_compatible_with_v2',true)IS DISTINCT FROM'true'THEN RAISE EXCEPTION 'Rollback clients to compatible history before baseline ACL restore';END IF;END $client_history_rollback$;\n"+
 'REVOKE EXECUTE ON FUNCTION '+hist+' FROM authenticated;\n'+guard('image_normal_restore_after',closed+' OR '+baselinePolicies+' OR '+acl('baseline'))+'COMMIT;\n';
 const audit=`SELECT jsonb_build_object('imageEnabled',(SELECT enabled FROM private.image_settings WHERE singleton),'workerEnabled',(SELECT enabled FROM private.image_worker_settings WHERE singleton),'storageEnabled',(SELECT storage_enabled FROM private.image_worker_settings WHERE singleton),'companyEnabled',EXISTS(SELECT 1 FROM private.image_company_rollout WHERE company_id=${q(co)}AND enabled),'inspectorEnabled',EXISTS(SELECT 1 FROM private.image_inspectors WHERE user_id=${q(actor)}AND enabled),'historyRpcEnabled',has_function_privilege('authenticated','public.read_connect_messages_v3(uuid,uuid,bigint,bigint,integer)','EXECUTE'),'newClientTableGrants',EXISTS(SELECT 1 FROM information_schema.role_table_grants WHERE grantee IN('anon','authenticated','service_role')AND table_schema='private'AND table_name IN('image_company_rollout','image_inspector_companies')));`;
 return{active,close,full,audit,metadata:{state:'prepared-inert-normal-company-access-and-close',companyId:co,inspectorId:actor,assignmentDays,sharedRole:'authenticated',activateExecuteSignatures:23,closeRevokesImageSignatures:21,closeKeepsHistorySignatures:2,newOperationalRuntimeRole:false,maintenanceRoleElevation:false,noAuthSessionQuery:true,activationSha256:sha(active),closeSha256:sha(close),baselineAclRestoreSha256:sha(full),normalClosePreservesHistory:true,fullBaselineRestoreRequiresCompatibleClients:true}};
}
export async function prepareNormalAccess(){
 const b=JSON.parse(await fs.readFile(root+'normal-rollout-managed.READONLY.json','utf8')),p=JSON.parse(await fs.readFile(root+'normal-service-integration-plan-current.json','utf8')),c=await compose();
 const key=s=>s.replace(/^public\./,'');
 const functions=p.proposedAccess.executeSignatures.map(signature=>{const f=b.functionInvariants.find(x=>key(x.signature)===key(signature));assert(f);const changed=c.after.find(x=>key(x.signature)===key(signature));return{signature,attributes:f.attributes,bodySha256:changed?sha(changed.body):f.bodySha256};});
 const policies=p.proposedAccess.policyNames.map(name=>{const x=b.policies.find(x=>x.policyname===name&&x.schemaname==='storage');assert(x);return x;});
 return buildNormalAccess({functions,policies,companyId:p.actorBindings.companyId,inspectorId:p.actorBindings.inspector,baseInspector:b.inspectors.find(x=>x.user_id===p.actorBindings.inspector),decoderImage:JSON.parse(await fs.readFile('supabase/runtime/image-node/linux-image.lock.json','utf8')).imageId});
}
if(process.argv[1]?.replaceAll('\\','/').endsWith('/normal-activation/normal-access.mjs')){
 assert.deepEqual(process.argv.slice(2),['--prepare-only']);const c=await prepareNormalAccess(),previous=JSON.parse(await fs.readFile(root+'normal-rollout-managed-closed.REQUEST.UNAPPLIED.json','utf8'));
 for(const[file,sql]of[['activate.NORMAL.UNAPPLIED.sql',c.active],['close.NORMAL.UNAPPLIED.sql',c.close],['restore.BASELINE-ACL.UNAPPLIED.sql',c.full],['audit.NORMAL.READONLY.sql',c.audit]])await fs.writeFile(out+file,sql);
 for(const[name,query]of[['activate',c.active],['close',c.close]])await fs.writeFile(out+name+'.NORMAL.REQUEST.UNAPPLIED.json',JSON.stringify({link_id:previous.link_id,project_id:'ibdlvlwdzmsrbqadrudb',name:'connect_image_normal_company_'+name,query},null,2)+'\n');
 await fs.writeFile(out+'normal-access.PREPARED.json',JSON.stringify(c.metadata,null,2)+'\n');console.log(JSON.stringify(c.metadata));
}
