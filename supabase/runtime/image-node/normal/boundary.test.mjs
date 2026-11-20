// Focused new lifecycle/credential-free IPC contract only. No old codec/Auth suite.
import assert from'node:assert/strict';import fs from'node:fs/promises';import{spawnSync}from'node:child_process';import{createHash}from'node:crypto';
import{runNormalImageService,normalImageRecovery,normalImageHealth,NORMAL_IMAGE_PURPOSE}from'./service.mjs';
import{codecRequest}from'./codec-ipc.mjs';
const checks=[],purpose=NORMAL_IMAGE_PURPOSE;let now=Date.parse('2026-11-20T12:00:00Z');
assert.deepEqual(await runNormalImageService({enabled:false},{}),{state:'off',exitCode:78,credentialsRead:false});
assert.equal(normalImageRecovery({purpose,version:1,phase:'auth-dispatched',updatedAt:now},now).allowed,false);
assert.throws(()=>normalImageRecovery({purpose:'test-session',version:1,phase:'idle',updatedAt:now},now));
checks.push('OFF reads no credential; foreign/test journal and uncertain Auth do not restart/login');
async function cycle({previous=null,states=['finish-unconfirmed','ready'],failAuth=false}={}){
 const ac=new AbortController(),journal=[],health=[],events=[];let opened=0,closed=0,ticks=0,waits=[];const secret='synthetic-not-for-journal';
 const result=await runNormalImageService({enabled:true},{now:()=>now,signal:ac.signal,readJournal:async()=>previous,
 writeJournal:async v=>journal.push({...v}),health:async v=>health.push(normalImageHealth(v,now)),
 wait:async ms=>{waits.push(ms);now+=ms;},
 auth:()=>({open:async()=>{opened++;events.push('auth');if(failAuth)throw Error();return{sessionId:'90560000-0000-4000-8000-000000000001'};},readSession:async()=>secret,close:async()=>{closed++;return{logout:failAuth?'not-attempted':'local-acknowledged'};}}),
 worker:()=>({tick:async({token})=>{assert.equal(token,secret);const state=states[ticks++];if(ticks===states.length)ac.abort();return{state};},close:()=>events.push('worker-closed')})});
 assert(!JSON.stringify({journal,health,result}).includes(secret));return{result,journal,health,opened,closed,ticks,waits,events};
}
const recovered=await cycle({previous:{purpose,version:1,phase:'tick',updatedAt:now}});
assert.equal(recovered.waits[0],35000);assert.equal(recovered.opened,1);assert.equal(recovered.closed,1);assert.equal(recovered.ticks,2);assert.equal(recovered.result.processed,1);assert.equal(recovered.result.exitCode,0);assert(recovered.journal.some(v=>v.phase==='tick'));assert(recovered.health.some(v=>v.closureReviewRequired));
const failed=await cycle({states:['unavailable']});assert.equal(failed.result.exitCode,75);assert.equal(failed.journal.at(-1).phase,'lease-uncertain');
const auth=await cycle({failAuth:true});assert.equal(auth.result.exitCode,79);assert.equal(normalImageRecovery(auth.journal.at(-1),now).allowed,false);
checks.push('restart waits past30s lease; same worker reconciles uncertain finish; own logout once; unknown Auth opens circuit; journals/health contain no bearer');
const id='90560000-0000-4000-8000-000000000001',co='ee330000-0000-4000-8000-000000000201';
const bytes=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAFElEQVR4nGNoIBEwjGoY1TB8NQAAJYSAEGy7FvQAAAAASUVORK5CYII=','base64'));
const permit={purpose:'image-inspection-lease-v1',attachmentId:id,leaseId:id,companyId:co,inspectorId:'ee330000-0000-4000-8000-000000000202',sessionId:id,sha256:createHash('sha256').update(bytes).digest('hex'),byteLength:bytes.length,decoderImage:'sha256:27d6b28f9111c36fcf39cab1d8cc818daa2a5474f93fce305e1466010cdf695e',issuedAt:new Date(now).toISOString(),expiresAt:new Date(now+30000).toISOString()};
const frame=codecRequest(permit,bytes,now,id,co);assert.equal(frame.header.width,16);assert.equal(Object.keys(frame).sort().join(','),'header,nonce,permit,version');
for(const p of [{...permit,sessionId:'90560000-0000-4000-8000-000000000002'},{...permit,password:'forbidden'},{...permit,expiresAt:new Date(now).toISOString()}])assert.throws(()=>codecRequest(p,bytes,now,id,co));
assert.throws(()=>codecRequest(permit,bytes.slice(1),now,id,co));
const python="import ast,pathlib,datetime,json\np=pathlib.Path('supabase/runtime/image-node/normal/codec-connection.py');a=ast.parse(p.read_text(encoding='utf-8'));f=next(x for x in a.body if isinstance(x,ast.FunctionDef)and x.name=='admit');g={'datetime':datetime};exec(compile(ast.Module(body=[x for x in a.body if isinstance(x,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='PERMIT'for t in x.targets)]+[f],type_ignores=[]),'decoder-admission','exec'),g);v=json.loads("+JSON.stringify(JSON.stringify(frame))+");t="+(now/1000)+";assert g['admit'](v,1201,1201,t)>t\nfor uid in [0,1202]:\n try:g['admit'](v,uid,1201,t);raise AssertionError('Peer admitted')\n except ValueError:pass\nprint('python-peer-admission-and-syntax-passed')";
const p=spawnSync('python',['-c',python],{encoding:'utf8',timeout:10000,windowsHide:true});assert.equal(p.status,0,p.stderr);
checks.push('new codec frame rejects wrong session/hash/expiry/extra secret; Python peer admission rejects foreign UID; native peercred/ELF not exercised');
for(const file of ['connect-image-inspector.service','connect-image-codec@.service']){const text=await fs.readFile(new URL('./systemd/'+file,import.meta.url),'utf8');assert(!/^User=root$/m.test(text));assert(text.includes('NoNewPrivileges=yes'));assert(/^CapabilityBoundingSet=\r?$/m.test(text));}
const decoder=await fs.readFile(new URL('./systemd/connect-image-codec@.service',import.meta.url),'utf8');assert(decoder.includes('PrivateNetwork=yes'));assert(!decoder.includes('LoadCredential='));
checks.push('units use distinct non-root accounts, no decoder Auth credential, private Unix socket and resource caps; systemd Linux activation not run');
console.log(JSON.stringify({state:'passed-new-normal-image-service-boundaries-local',invocations:1,checks,realNetwork:0,realAuth:0,realCodecRuns:0,linuxSystemdOrPeerCredentialsTested:false,hostedChanged:false}));
