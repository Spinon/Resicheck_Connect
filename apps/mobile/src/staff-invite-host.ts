import {createStaffInviteLinkCodec} from '../../../packages/chat-client/src/staff-invite-link.ts';
export type InvitePreview=Readonly<{companyId:string;companyName:string;expiresAt:number;recipientPolicy:'first-active-bearer'}>;
type Result=Readonly<{ok:true;value:Readonly<{inviteId:string;companyId:string;staffState:'active'}>}|{ok:false;code:string}>;
type Port={accept:(id:string,token:string,signal?:AbortSignal)=>Promise<Result>;close:()=>void};
type Scope=Readonly<{userId:string;sessionKey:string;displayName:string}>;
type View=Readonly<{stage:'empty'|'loading'|'review'|'sending'|'accepted'|'unavailable'|'uncertain'|'paused';accountName:string;companyName:string|null;expiresAt:number|null;busy:boolean}>;
// The preview port is synthetic only until a server-authorized preview and
// expected-company acceptance contract exist. Never derive company/account from URL.
export function createStaffInviteHost(deps:{origin:string;scope:Scope;current:()=>Scope|null;port:Port;preview:(id:string,signal:AbortSignal)=>Promise<InvitePreview|null>;now:()=>number;schedule:(cb:()=>void,ms:number)=>()=>void}){
 const codec=createStaffInviteLinkCodec({origin:deps.origin}),scope=deps.scope;let generation=0,disposed=false,task:AbortController|null=null,cancelExpiry=()=>{};
 let secret:{inviteId:string;token:string}|null=null,preview:InvitePreview|null=null;
 let view:View=Object.freeze({stage:'empty',accountName:scope.displayName,companyName:null,expiresAt:null,busy:false});const listeners=new Set<()=>void>();
 const current=()=>{try{return !disposed&&deps.current()===scope;}catch{return false;}};
 function emit(stage:View['stage'],notify=true){view=Object.freeze({stage,accountName:stage==='paused'?'':scope.displayName,companyName:preview?.companyName??null,expiresAt:preview?.expiresAt??null,busy:stage==='loading'||stage==='sending'});if(notify)for(const f of [...listeners])try{f();}catch{}}
 function clear(stage:View['stage'],notify=true){generation++;task?.abort();task=null;try{cancelExpiry();}catch{}cancelExpiry=()=>{};secret=null;preview=null;emit(stage,notify);}
 function live(){try{const n=deps.now();return current()&&preview!==null&&Number.isSafeInteger(n)&&n>=0&&n<preview.expiresAt;}catch{return false;}}
 return Object.freeze({snapshot:()=>{if(!current()&&view.stage!=='paused')clear('paused',false);return view;},subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},
  open:async(url:string)=>{clear('empty');if(!current()){clear('paused');return false;}let intent;try{intent=codec.parse(url);}catch{clear('unavailable');return false;}
   const epoch=generation,job=new AbortController();task=job;secret=intent;emit('loading');try{const raw=await deps.preview(intent.inviteId,job.signal);if(epoch!==generation||job.signal.aborted)return false;if(!current()){clear('paused');return false;}
    if(!raw)throw Error();const {companyId,companyName,expiresAt,recipientPolicy}=raw;
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(companyId)||typeof companyName!=='string'||companyName.length<1||companyName.length>160||/[\u0000-\u001f\u007f]/.test(companyName)||!Number.isSafeInteger(expiresAt)||recipientPolicy!=='first-active-bearer')throw Error();
    preview=Object.freeze({companyId,companyName,expiresAt,recipientPolicy});if(!live())throw Error();task=null;
    cancelExpiry=deps.schedule(()=>{if(epoch===generation)clear(view.stage==='sending'?'uncertain':'unavailable');},expiresAt-deps.now());if(epoch!==generation||!live()){clear('unavailable');return false;}emit('review');return true;
   }catch{if(epoch===generation)clear(current()?'unavailable':'paused');return false;}},
  accept:async()=>{if(!secret||!preview||!['review','uncertain'].includes(view.stage))return false;if(!live()){clear(current()?'unavailable':'paused');return false;}
   const epoch=generation,intent=secret,expected=preview,job=new AbortController();task=job;emit('sending');try{const r=await deps.port.accept(intent.inviteId,intent.token,job.signal);if(epoch!==generation||job.signal.aborted)return false;if(!current()){clear('paused');return false;}task=null;if(!live()){clear('uncertain');return false;}
    if(r.ok&&r.value.inviteId===intent.inviteId&&r.value.companyId===expected.companyId&&r.value.staffState==='active'){secret=null;try{cancelExpiry();}catch{}cancelExpiry=()=>{};emit('accepted');return true;}
    // A dispatched mismatch may have committed elsewhere. Never call it rejected.
    if(r.ok||r.code==='UNCERTAIN'){emit('uncertain');return false;}clear('unavailable');return false;
   }catch{if(epoch===generation){task=null;if(!current())clear('paused');else if(!live())clear('uncertain');else emit('uncertain');}return false;}},
  clear:()=>clear('empty'),suspend:()=>{clear('paused');deps.port.close();},
  dispose:()=>{if(disposed)return;clear('paused');disposed=true;deps.port.close();listeners.clear();},
 });
}
