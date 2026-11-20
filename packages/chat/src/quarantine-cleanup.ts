// Infrastructure reference, not a patient/ADM endpoint. No Storage SDK or path.
import {randomUUID} from 'node:crypto';
export type PurgeTicket=Readonly<{attachmentId:string;companyId:string;conversationId:string;leaseId:string;attemptId:string;fenceId:string|null;objectName:string;objectId:string|null;sha256:string;byteLength:number;state:'claimed'|'reconcile'|'removing'|'done';expiresAt:number}>;
export type RemovalPermit=PurgeTicket&Readonly<{state:'removing';fenceId:string}>;
type Scope=Readonly<{companyId:string;attachmentId:string;leaseId:string}>;
type Attempt=Scope&Readonly<{attemptId:string}>;
export type CleanupPorts=Readonly<{
 // Transactional claim MUST fence catalog/expiry/retention before exposing key.
 claim:(scope:Attempt,signal:AbortSignal)=>Promise<unknown>;
 // One-way SQL CAS, rechecks current review/hold/deadline. Replays return null.
 beginRemoval:(scope:Attempt,signal:AbortSignal)=>Promise<unknown>;
 // Trusted adapter: create-only version, digest/size and publication guard;
 // never translate this into an unchecked delete-by-key or signed URL.
 removeExact:(ticket:RemovalPermit,signal:AbortSignal)=>Promise<'removed'|'missing'|'conflict'>;
 // Read-only check of BOTH bytes and metadata. Never delete during reconcile.
 confirmMissing:(ticket:PurgeTicket,signal:AbortSignal)=>Promise<boolean>;
 complete:(scope:Scope,signal:AbortSignal)=>Promise<unknown>;
 schedule:(callback:()=>void,ms:number)=>()=>void;
 now:()=>number;
 createAttemptId?:()=>string;
}>;
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s);
const exact=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')==='attachmentId,attemptId,byteLength,companyId,conversationId,expiresAt,fenceId,leaseId,objectId,objectName,sha256,state';
let active=0;
export function createQuarantineCleanup(ports:CleanupPorts,timeoutMs=2000){
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw Error('Cleanup unavailable');
 let pending=false;
 return Object.freeze({run:async(input:Scope):Promise<'done'|'retained'|'pending'|'conflict'>=>{
  if(pending||active>=2)return'pending';
  if(!uuid(input.companyId)||!uuid(input.attachmentId)||!uuid(input.leaseId))return'retained';
  let attemptId:string;try{attemptId=(ports.createAttemptId??randomUUID)();}catch{return'retained';}if(!uuid(attemptId))return'retained';
  const scope=Object.freeze({companyId:input.companyId,attachmentId:input.attachmentId,leaseId:input.leaseId,attemptId});pending=true;active++;
  const controller=new AbortController();let cancel=()=>{},finished=false;
  let settle!:(value:'done'|'retained'|'pending'|'conflict')=>void;
  const result=new Promise<'done'|'retained'|'pending'|'conflict'>(r=>{settle=r;});
  const finish=(value:'done'|'retained'|'pending'|'conflict')=>{if(finished)return;finished=true;settle(value);};
  const work=async()=>{
   try{
    cancel=ports.schedule(()=>{controller.abort();finish('pending');},timeoutMs);
    if(controller.signal.aborted)return;
    const t=await ports.claim(scope,controller.signal);if(controller.signal.aborted)return;
    if(!exact(t)||t.attachmentId!==scope.attachmentId||t.companyId!==scope.companyId||t.leaseId!==scope.leaseId||t.attemptId!==attemptId||t.fenceId!==null||!uuid(t.conversationId)||!(t.objectId===null||uuid(t.objectId))||typeof t.objectName!=='string'||!t.objectName.startsWith('q/')||!uuid(t.objectName.slice(2))||typeof t.sha256!=='string'||!/^[0-9a-f]{64}$/.test(t.sha256)||!Number.isSafeInteger(t.byteLength)||Number(t.byteLength)<0||Number(t.byteLength)>10485760||!['claimed','reconcile','done'].includes(String(t.state))||!Number.isSafeInteger(t.expiresAt)){finish('retained');return;}
    const ticket=Object.freeze({...t}) as PurgeTicket;
    if(ticket.state==='done'){finish('done');return;}
    if(ticket.state==='reconcile'){
      const absent=await ports.confirmMissing(ticket,controller.signal);if(controller.signal.aborted)return;
      if(absent!==true){finish('retained');return;}
      const completed=await ports.complete(scope,controller.signal);if(!controller.signal.aborted)finish(completed==='done'?'done':'pending');return;
    }
    const live=(expires:number)=>{const now=ports.now();return Number.isSafeInteger(now)&&now>=0&&now<expires&&expires-now<=30000&&!controller.signal.aborted;};
    if(!live(ticket.expiresAt)){finish('retained');return;}
    const raw=await ports.beginRemoval(scope,controller.signal);if(controller.signal.aborted)return;
    if(raw===null){finish('pending');return;}
    if(!exact(raw)||raw.state!=='removing'||!uuid(raw.fenceId)||!Number.isSafeInteger(raw.expiresAt)||Number(raw.expiresAt)>ticket.expiresAt
      ||['attachmentId','companyId','conversationId','leaseId','attemptId','objectName','objectId','sha256','byteLength'].some(k=>raw[k]!==ticket[k as keyof PurgeTicket])){finish('pending');return;}
    const permit=Object.freeze({...raw}) as RemovalPermit;if(!live(permit.expiresAt)){finish('pending');return;}
    const removed=await ports.removeExact(permit,controller.signal);if(controller.signal.aborted)return;
    if(!live(permit.expiresAt)){finish('pending');return;}
    if(removed==='conflict'){finish('conflict');return;}if(removed!=='removed'&&removed!=='missing'){finish('retained');return;}
    const completed=await ports.complete(scope,controller.signal);if(controller.signal.aborted)return;
    finish(completed==='done'?'done':'pending');
   }catch{finish('pending');}
   finally{try{cancel();}catch{}pending=false;active--;if(!finished)finish('pending');}
  };
  // A non-cooperative port retains the admission slot until underlying work
  // settles, even after the deadline returned pending. No overlapping retry.
  void work();return result;
 }});
}
