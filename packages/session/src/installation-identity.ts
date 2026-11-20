import type {SecureStorePort,SecureStoreOptions} from './native-session-vault.ts';
type Result=Readonly<{status:'ready';installationId:string}|{status:'unavailable'|'closed'}>;
const uuid4=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const unavailable=()=>Object.freeze({status:'unavailable' as const});

// Candidate storage owner only. No SDK, disk, generator or device ID is used here.
// Requires one owner per key/process (not enforced across instances); do not
// race a replacement against pending IO. Native/process exclusivity is a gate.
// Public random UUID, never authorization, hardware identity or an account secret.
export function createInstallationIdentity({store,projectRef,createId}:{store:SecureStorePort;projectRef:string;createId:()=>string}){
 let available:()=>PromiseLike<boolean>,get:(key:string,options:SecureStoreOptions)=>PromiseLike<string|null>,set:(key:string,value:string,options:SecureStoreOptions)=>PromiseLike<void>,accessibility:number;
 try{
  accessibility=store.WHEN_UNLOCKED_THIS_DEVICE_ONLY;
  const {isAvailableAsync,getItemAsync,setItemAsync}=store;
  if(!/^[a-z]{20}$/.test(projectRef)||!Number.isSafeInteger(accessibility)||accessibility<0||[isAvailableAsync,getItemAsync,setItemAsync,createId].some(fn=>typeof fn!=='function'))throw Error();
  available=()=>isAvailableAsync.call(store);get=(k,o)=>getItemAsync.call(store,k,o);set=(k,v,o)=>setItemAsync.call(store,k,v,o);
 }catch{throw Error('Installation unavailable');}
 const key=`resicheck.connect.${projectRef}.installation.v1`,options=Object.freeze({keychainService:key,keychainAccessible:accessibility,requireAuthentication:false as const});
 let closed=false,blocked=false,value:string|null=null,job:Promise<Result>|null=null;
 const ended=():Result=>Object.freeze({status:'closed'});
 function decode(raw:string):string{
  if(typeof raw!=='string'||raw.length>256)throw Error();
  const v:unknown=JSON.parse(raw);
  if(!v||typeof v!=='object'||Array.isArray(v))throw Error();
  const r=v as Record<string,unknown>;
  if(Object.keys(r).length!==3||r.version!==1||r.projectRef!==projectRef||!uuid4(r.installationId))throw Error();
  return r.installationId;
 }
 function read():Promise<Result>{
  if(closed)return Promise.resolve(ended());if(blocked)return Promise.resolve(unavailable());
  if(value)return Promise.resolve(Object.freeze({status:'ready',installationId:value}));if(job)return job;
  const work=async():Promise<Result>=>{
   try{
    if(await available()!==true)throw Error();if(closed)return ended();
    const raw=await get(key,options);if(closed)return ended();
    let next:string;
    if(raw!==null)next=decode(raw);
    else{
     next=createId();if(!uuid4(next))throw Error();
     const encoded=JSON.stringify({version:1,projectRef,installationId:next});
     await set(key,encoded,options);if(closed)return ended();
     // Do not expose an identity before the same owner verifies its readback.
     if(decode((await get(key,options)) as string)!==next)throw Error();
    }
    if(closed)return ended();value=next;return Object.freeze({status:'ready',installationId:next});
   }catch{if(closed)return ended();blocked=true;value=null;return unavailable();}
  };
  job=work();void job.then(()=>{job=null;});return job;
 }
 return Object.freeze({read,close(){closed=true;value=null;},snapshot:()=>Object.freeze({state:closed?'closed' as const:blocked?'blocked' as const:job?'loading' as const:value?'ready' as const:'idle' as const})});
}
