import fs from'node:fs/promises';import{constants}from'node:fs';import{randomUUID}from'node:crypto';import{pathToFileURL}from'node:url';
import{createOwnedImagePasswordSession,OWNED_IMAGE_SESSION_POLICY}from'../owned-session-auth.mjs';
import{createImageServiceWorker}from'../service-worker.mjs';
import image from'../linux-image.lock.json'with{type:'json'};
import{readNormalImageCredential}from'./credential.mjs';import{createNormalCodecPort}from'./codec-ipc.mjs';
import{runNormalImageService,normalImageHealth,NORMAL_IMAGE_PURPOSE}from'./service.mjs';
import{normalActivationGate}from'./activation-gate.mjs';
const state='/var/lib/connect-image-inspector',config='/etc/connect-image-inspector/config.json',fail=()=>Error('Normal image service unavailable');
async function readOwned(p,uid,mode,max){const s=await fs.lstat(p);if(!s.isFile()||s.isSymbolicLink()||s.uid!==uid||(s.mode&0o777)!==mode||s.nlink!==1||s.size>max)throw fail();
 const h=await fs.open(p,constants.O_RDONLY|constants.O_NOFOLLOW);try{const v=await h.stat();if(v.ino!==s.ino||v.dev!==s.dev||v.size!==s.size)throw fail();return JSON.parse(await h.readFile('utf8'));}finally{await h.close();}}
async function main(){
 if(process.argv.length!==3||process.argv[2]!=='--serve'||process.platform!=='linux'||process.getuid()===0||process.geteuid()!==process.getuid()||process.getgid()===0||process.getegid()!==process.getgid()||process.getgroups().some(id=>id!==process.getgid()))throw fail();
 const uid=process.getuid(),status=await fs.readFile('/proc/self/status','utf8');
 if(!/^NoNewPrivs:\s+1$/m.test(status)||['CapEff','CapPrm','CapBnd','CapAmb','CapInh'].some(k=>!new RegExp('^'+k+':\\s+0+$','m').test(status)))throw fail();
 const plan=await readOwned(config,0,0o644,16384);
 const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v);
 const companies=plan.companyIds;

 if(plan.enabled!==true){process.exitCode=78;return;}
 if(plan.schemaVersion!==1||plan.projectRef!=='ibdlvlwdzmsrbqadrudb'||plan.inspectorId!=='ee330000-0000-4000-8000-000000000202'||!Array.isArray(companies)||companies.length===0||companies.length>256||!companies.every(uuid)||new Set(companies).size!==companies.length||plan.decoderImage!==image.imageId||plan.stateRoot!==state||plan.sessionPolicy!==OWNED_IMAGE_SESSION_POLICY)throw fail();
 const dir=await fs.lstat(state);if(!dir.isDirectory()||dir.isSymbolicLink()||dir.uid!==uid||(dir.mode&0o777)!==0o700)throw fail();
 const gate=await normalActivationGate(companies);
 const ac=new AbortController();process.once('SIGTERM',()=>ac.abort());process.once('SIGINT',()=>ac.abort());
 let queue=Promise.resolve();
 const write=(name,value)=>{queue=queue.then(async()=>{const tmp=state+'/'+name+'.'+randomUUID();await fs.writeFile(tmp,JSON.stringify(value)+'\n',{flag:'wx',mode:0o600});await fs.rename(tmp,state+'/'+name);});return queue;};
 const wait=(ms,signal)=>new Promise(resolve=>{const finish=()=>{clearTimeout(t);signal.removeEventListener('abort',finish);resolve();},t=setTimeout(finish,ms);signal.addEventListener('abort',finish,{once:true});if(signal.aborted)finish();});
 let auth,inspect,sessionAudit;const attemptId=randomUUID();
 const outcome=await runNormalImageService(plan,{signal:ac.signal,now:Date.now,wait,
 readJournal:()=>readOwned(state+'/journal.json',uid,0o600,4096).catch(e=>{if(e.code==='ENOENT')return null;throw e;}),
 sessionOpened:own=>{sessionAudit={purpose:NORMAL_IMAGE_PURPOSE,attemptId,ownSessionId:own.sessionId,openedAt:Date.now(),logout:'not-attempted'};return write('session-'+attemptId+'.json',sessionAudit);},
 sessionClosed:result=>{if(!sessionAudit)return;return write('session-'+attemptId+'.json',{...sessionAudit,logout:result.logout,closedAt:Date.now()});},
 writeJournal:v=>write('journal.json',v),health:v=>write('health.json',normalImageHealth(v,Date.now())),
 auth:()=>{auth=createOwnedImagePasswordSession({enabled:true,publishableKey:plan.publishableKey,sessionPolicy:plan.sessionPolicy,attemptId,readCredential:readNormalImageCredential,now:Date.now,fetch:globalThis.fetch.bind(globalThis)});return auth;},
 worker:sid=>{inspect=createNormalCodecPort({sessionId:()=>auth.sessionId(),companyIds:companies});const queue=createImageServiceWorker({...plan,expectedSessionId:sid,region:'us-east-1',now:Date.now,fetch:globalThis.fetch.bind(globalThis),inspect});let released=false;
  return{async tick(args){if(!released){await gate.wait(args.signal,()=>write('health.json',{purpose:NORMAL_IMAGE_PURPOSE,updatedAt:Date.now(),phase:'idle',healthy:true,closureReviewRequired:false,processed:0,rejected:0,waitingForBackend:true}));released=true;}return queue.tick(args);},close(){queue.close();}};}});
 process.stdout.write(JSON.stringify(outcome)+'\n');process.exitCode=outcome.exitCode;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)main().catch(()=>{process.stderr.write('image-service-configuration-unavailable\n');process.exitCode=78;});
