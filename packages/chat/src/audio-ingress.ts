// Unmounted backend core. Persistence, private Storage and real inspection are mandatory trusted adapters.
import{createHash}from 'node:crypto';
type Scope=Readonly<{companyId:string;conversationId:string}>;
type Intent=Scope&Readonly<{clientUploadId:string}>;
type Owner=Intent&Readonly<{userId:string}>;
type Row=Owner&Readonly<{id:string;sha256:string;byteLength:number;state:'quarantined'|'ready'|'rejected'}>;
export type AudioIngressPorts=Readonly<{
 authorize:(credential:string,scope:Scope,action:'write'|'read')=>Promise<Readonly<{userId:string}>|null>;
 // Atomic insert-or-return by owner+company+conversation+intent; different digest/size MUST conflict.
 reserve:(owner:Owner,digest:string,size:number)=>Promise<Readonly<{row:Row;created:boolean}>>;
 findOwn:(owner:Owner)=>Promise<Row|null>;
 // Private create-only object storage, scoped by row. Never client-supplied paths or URLs.
 putPrivate:(row:Row,bytes:Uint8Array)=>Promise<void>;
 // Real bounded parser/inspector required. Declared MIME/duration are not evidence.
 inspect:(bytes:Uint8Array)=>Promise<Readonly<{accepted:false}|{accepted:true;mime:string;durationMs:number}>>;
 // Atomic quarantined -> terminal, matching immutable owner/digest/size; durable before ACK.
 finish:(row:Row,state:'ready'|'rejected')=>Promise<Row>;
}>;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v),fail=()=>Error('Audio unavailable'),hash=(b:Uint8Array)=>createHash('sha256').update(b).digest('hex');
export function createAudioIngress(input:AudioIngressPorts){const p=Object.freeze({...input});
 function intent(v:Intent){if(!v||Object.keys(v).sort().join(',')!=='clientUploadId,companyId,conversationId'||!uuid(v.companyId)||!uuid(v.conversationId)||!/^[-A-Za-z0-9_]{1,80}$/.test(v.clientUploadId))throw fail();return Object.freeze({...v});}
 async function owner(credential:string,v:Intent){if(typeof credential!=='string'||credential.length<1||credential.length>8192)throw fail();const actor=await p.authorize(credential,{companyId:v.companyId,conversationId:v.conversationId},'write');if(!actor||!uuid(actor.userId))throw fail();return Object.freeze({...v,userId:actor.userId});}
 function row(v:Row,o:Owner,digest?:string,size?:number){if(!v||v.userId!==o.userId||v.companyId!==o.companyId||v.conversationId!==o.conversationId||v.clientUploadId!==o.clientUploadId||!uuid(v.id)||!['quarantined','ready','rejected'].includes(v.state)||!Number.isSafeInteger(v.byteLength)||v.byteLength<1||v.byteLength>1048576||!/^[a-f0-9]{64}$/.test(v.sha256)||digest!==undefined&&v.sha256!==digest||size!==undefined&&v.byteLength!==size)throw fail();return Object.freeze({...v});}
 const receipt=(v:Row|null,o:Owner)=>Object.freeze({company_id:o.companyId,conversation_id:o.conversationId,client_upload_id:o.clientUploadId,sender_id:o.userId,state:v?.state??'not_observed',attachment_id:v?.id??null});
 const api=Object.freeze({
  async lookup(credential:string,command:Intent){const v=intent(command),o=await owner(credential,v),found=await p.findOwn(o);const result=found?row(found,o):null;await owner(credential,v).then(next=>{if(next.userId!==o.userId)throw fail();});return receipt(result,o);},
  async upload(credential:string,command:Intent,bytes:Uint8Array,declaredDigest:string){const v=intent(command);if(!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>1048576||!/^[a-f0-9]{64}$/.test(declaredDigest))throw fail();const o=await owner(credential,v),held=Uint8Array.from(bytes);
   const recheck=async()=>{if((await owner(credential,v)).userId!==o.userId)throw fail();};
   try{if(hash(held)!==declaredDigest)throw fail();const reserved=await p.reserve(o,declaredDigest,held.length);if(typeof reserved.created!=='boolean')throw fail();const saved=row(reserved.row,o,declaredDigest,held.length);await recheck();if(!reserved.created)return receipt(saved,o);if(saved.state!=='quarantined')throw fail();await p.putPrivate(saved,held);await recheck();const inspection=await p.inspect(held);await recheck();if(hash(held)!==declaredDigest)throw fail();const accepted=inspection.accepted&&inspection.mime==='audio/mp4'&&Number.isSafeInteger(inspection.durationMs)&&inspection.durationMs>=500&&inspection.durationMs<=60500;
    const completed=row(await p.finish(saved,accepted?'ready':'rejected'),o,declaredDigest,held.length);if(completed.id!==saved.id||completed.state!==(accepted?'ready':'rejected'))throw fail();await recheck();return receipt(completed,o);
   }finally{held.fill(0);}
  },
 });
 return Object.freeze({lookup:async(...args:Parameters<typeof api.lookup>)=>{try{return await api.lookup(...args);}catch{throw fail();}},upload:async(...args:Parameters<typeof api.upload>)=>{try{return await api.upload(...args);}catch{throw fail();}}});
}
