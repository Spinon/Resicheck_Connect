// Root-owned, public coordination only. No token, network or new privilege.
import fs from'node:fs/promises';import{constants}from'node:fs';
const dir='/etc/connect-image-inspector/',uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(v),fail=()=>Error('Image activation not ready');
export function validateActivationHold(v,company,now){
 if(!v||Object.keys(v).sort().join(',')!=='activationDeadline,companyId,createdAt,gateId,schemaVersion'||v.schemaVersion!==1||!uuid(v.gateId)||v.companyId!==company||!Number.isSafeInteger(v.createdAt)||!Number.isSafeInteger(v.activationDeadline)||v.createdAt>now||v.activationDeadline-v.createdAt!==300000)throw fail();return Object.freeze({...v});
}
export function validBackendReady(v,hold,now){return !!v&&Object.keys(v).sort().join(',')==='companyId,expiresAt,gateId,schemaVersion'&&v.schemaVersion===1&&v.gateId===hold.gateId&&v.companyId===hold.companyId&&Number.isSafeInteger(v.expiresAt)&&v.expiresAt>now&&v.expiresAt<=hold.createdAt+31*86400000;}
async function read(name){
 const p=dir+name;let s;try{s=await fs.lstat(p);}catch(e){if(e.code==='ENOENT')return null;throw e;}
 if(!s.isFile()||s.isSymbolicLink()||s.uid!==0||s.nlink!==1||(s.mode&0o777)!==0o644||s.size>2048||await fs.realpath(p)!==p)throw fail();
 const h=await fs.open(p,constants.O_RDONLY|constants.O_NOFOLLOW);try{const a=await h.stat();if(a.ino!==s.ino||a.dev!==s.dev||a.size!==s.size)throw fail();return JSON.parse(await h.readFile('utf8'));}finally{await h.close();}
}
export async function normalActivationGate(companyIds,now=Date.now){
 if(!Array.isArray(companyIds)||companyIds.length!==1)throw fail();
 const hold=validateActivationHold(await read('ACTIVATION-HOLD.json'),companyIds[0],now()),already=await read('BACKEND-READY.json');
 if(!validBackendReady(already,hold,now())&&now()>=hold.activationDeadline)throw fail();
 return Object.freeze({async wait(signal,heartbeat){
  for(;;){if(signal.aborted)throw fail();if(validBackendReady(await read('BACKEND-READY.json'),hold,now()))return;if(now()>=hold.activationDeadline)throw fail();await heartbeat();
   await new Promise(resolve=>{const done=()=>{clearTimeout(t);signal.removeEventListener('abort',done);resolve();},t=setTimeout(done,1000);signal.addEventListener('abort',done,{once:true});if(signal.aborted)done();});
  }
 }});
}
