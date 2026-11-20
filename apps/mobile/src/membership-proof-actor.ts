import{createConnectedCompanyRegistry}from './connected-company-registry.ts';
import type{VerifiedAuthSession}from '../../../packages/chat-client/src/verified-auth-session.ts';
type Role='manager'|'staff'|'patient';
type Enabled=Readonly<{mode:'explicit-proof';actor:Readonly<{role:Role;userId:string}>;companyId:string;reservation:Readonly<{reservedUserIds:readonly string[];companyId?:string}>;publicConfig:unknown;fetch:typeof fetch;createId:()=>string;now:()=>number;schedule:(fn:()=>void,ms:number)=>()=>void;timeoutMs:number;randomFill?:(bytes:Uint8Array)=>void|Promise<void>;share:(url:string)=>Promise<void>}>;
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
/** QA composition only, never imported by release roots. Default does not construct Auth.
 * Credentials stay in RegistrationHostView/AuthController; no admin API or reset helper.
 * Role is a test label, not authorization. Server/normal membership gate remain authoritative. */
export function createMembershipProofActor(input:Readonly<{mode?:'off'}>|Enabled={mode:'off'}){
 if(input.mode!=='explicit-proof')return null;
 const active=input;
 if(!uuid(active.actor.userId)||!uuid(active.companyId)||!['manager','staff','patient'].includes(active.actor.role)||!Array.isArray(active.reservation.reservedUserIds)||active.reservation.reservedUserIds.includes(active.actor.userId)||active.reservation.companyId===active.companyId)throw Error('Proof actor unavailable');
 const app=createConnectedCompanyRegistry({publicConfig:active.publicConfig,fetch:active.fetch,createId:active.createId,now:active.now,schedule:active.schedule,timeoutMs:active.timeoutMs,membershipLinks:{protocol:'secret-v1',origin:'https://connect.resicheck.com.br',share:active.share,...(active.randomFill?{randomFill:active.randomFill}:{})}});
 let retired=false;
 function session():VerifiedAuthSession|null{
  if(retired||app.auth.snapshot().status!=='authenticated')return null;
  const lease=app.auth.currentLease(),s=lease?.verifiedAuthSession;
  if(!lease||lease.userId!==active.actor.userId||!s||s.userId!==lease.userId||s.expiresAt<=active.now())return null;
  return s;
 }
 function ready(){const lease=app.auth.currentLease();return !!session()&&!!lease&&app.gate.matches(lease)&&app.members.snapshot().stage==='ready'&&!app.members.snapshot().busy;}
 return Object.freeze({app,companyId:active.companyId,role:active.actor.role,session,ready,
  snapshot(){const s=session();return Object.freeze({role:active.actor.role,userId:s?.userId??null,sessionId:s?.sessionId??null,expiresAt:s?.expiresAt??null,ready:ready(),inviteStage:app.invites?.snapshot().stage??'paused'});},
  async closeOwnSession(expected:Readonly<{userId:string;sessionId:string}>){
   const s=session();if(!s||s.userId!==expected.userId||s.sessionId!==expected.sessionId)return Object.freeze({matched:false,remoteConfirmed:false});
   const result=await app.auth.signOut();return Object.freeze({matched:true,remoteConfirmed:result.remoteConfirmed===true});
  },
  async dispose(){retired=true;app.auth.closeMemory();return app.dispose();},
 });
}
export type MembershipProofActor=NonNullable<ReturnType<typeof createMembershipProofActor>>;
