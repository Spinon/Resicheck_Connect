import type {ProfileStatus} from './registration-forms.ts';
type Lease=Readonly<{userId:string;sessionKey:string;close:()=>void}>;
type AuthPort={currentLease:()=>Lease|null;subscribe:(fn:()=>void)=>()=>void};
type RegistrationPort={snapshot:()=>Readonly<{scopeKey:string;profile:ProfileStatus|null;busy:boolean;accessReloadRequired?:boolean}>;subscribe:(fn:()=>void)=>()=>void};
export const profileAllowsMembership=(profile:ProfileStatus|null)=>profile?.kind==='profile'&&profile.state==='approved'&&profile.identity!=='disputed';
// Presentation gate only. Approved profile status never grants a company role;
// the directory/server must still authorize every read/write. Scope ownership
// prevents an old approved projection being borrowed by a newly signed-in user.
export function createRegistrationMembershipGate(auth:AuthPort,registration:RegistrationPort){
 let disposed=false,scope:string|null=null,scopeLease:Lease|null=null;let view:Readonly<{ready:boolean;scopeKey:string}>=Object.freeze({ready:false,scopeKey:''});const listeners=new Set<()=>void>();
 function sync(){if(disposed)return;let current:Lease|null=null;try{current=auth.currentLease();}catch{}const r=registration.snapshot();if(r.scopeKey!==scope){scope=r.scopeKey;scopeLease=current;}
  const ready=!!current&&current===scopeLease&&r.accessReloadRequired!==true&&profileAllowsMembership(r.profile);
  if(view.ready===ready&&view.scopeKey===r.scopeKey)return;view=Object.freeze({ready,scopeKey:r.scopeKey});for(const f of [...listeners])try{f();}catch{}
 }
 const a=auth.subscribe(sync),b=registration.subscribe(sync);sync();
 return Object.freeze({snapshot:()=>view,matches:(lease:Lease)=>{sync();return !disposed&&view.ready&&scopeLease===lease&&auth.currentLease()===lease;},subscribe:(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};},dispose:()=>{if(disposed)return;disposed=true;a();b();scopeLease=null;view=Object.freeze({ready:false,scopeKey:''});for(const f of [...listeners])try{f();}catch{}listeners.clear();}});
}
