import {createStaffInviteReviewHost} from './staff-invite-review-host.ts';import {createStaffInviteReviewRpcAdapter,type StaffInviteReviewRpc} from '../../../packages/chat-client/src/staff-invite-review-rpc.ts';
export type InviteReviewSessionLease=Readonly<{userId:string;sessionKey:string;staffInviteReview:StaffInviteReviewRpc}>;
// Candidate composition only. The caller must supply the verified transport's
// current lease. No login, token persistence, profile activation or network setup.
export function createStaffInviteReviewSessionHost(deps:{lease:InviteReviewSessionLease;currentLease:()=>InviteReviewSessionLease|null;displayName:string;origin:string;now:()=>number;schedule:(fn:()=>void,ms:number)=>()=>void}){
 let owned:ReturnType<typeof createStaffInviteReviewRpcAdapter>|null=null;try{
 const {lease,currentLease,displayName,origin,now,schedule}=deps;const {userId,sessionKey,staffInviteReview}=lease;
 if(typeof displayName!=='string'||!displayName.trim()||[...displayName].length>160||/[\u0000-\u001f\u007f]/.test(displayName))throw Error('Invitation unavailable');
 const scope=Object.freeze({userId,sessionKey,displayName});const live=()=>{try{return currentLease()===lease;}catch{return false;}};
 const adapter=createStaffInviteReviewRpcAdapter({userId,sessionKey,rpc:staffInviteReview,current:live});owned=adapter;
 return createStaffInviteReviewHost({origin,scope,current:()=>live()?scope:null,now,schedule,port:adapter,preview:async(id,token,signal)=>{const r=await adapter.preview(id,token,signal);return r.ok?Object.freeze({...r.value,expiresAt:Date.parse(r.value.expiresAt)}):null;}});
 }catch{try{owned?.close();}catch{}throw Error('Invitation unavailable');}
}
