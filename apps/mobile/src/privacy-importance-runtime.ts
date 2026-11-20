import {createNativePrivacyBinding,type NativePrivacyPort} from './native-privacy-binding.ts';import {createSyntheticImportanceChat} from '../previews/synthetic-importance-chat.ts';import type {ImportanceScope} from './message-importance-host.ts';
export function createPrivacyImportanceRuntime(deps:{native:NativePrivacyPort;foreground:Parameters<typeof createNativePrivacyBinding>[0]['foreground'];createId:()=>string}){
 const app=createSyntheticImportanceChat(deps.createId);let requestedRole:ImportanceScope['role']='staff',closed=false;
 let view:Readonly<{version:number;readyEpoch:number|null}>=Object.freeze({version:0,readyEpoch:null as number|null});const listeners=new Set<()=>void>();
 const publish=(readyEpoch:number|null,bump=false)=>{if(closed)return;view=Object.freeze({version:view.version+(bump?1:0),readyEpoch});for(const f of [...listeners])try{f();}catch{}};
 const binding=createNativePrivacyBinding({native:deps.native,foreground:deps.foreground,suspendPrivate:()=>{app.host.suspend();publish(null);},resumePrivate:async(epoch,signal)=>{
  if(signal.aborted||closed)return false;if(app.role!==requestedRole)app.switchRole(requestedRole);else app.resume();const captured=app.host;publish(null,true);
  if(app.role==='staff'&&!await captured.refresh())return false;if(signal.aborted||closed||app.host!==captured)return false;publish(epoch);return true;
 }});
 return Object.freeze({app,binding,snapshot:()=>view,subscribe:(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};},requestRole:(role:ImportanceScope['role'])=>{requestedRole=role;return binding.refresh();},dispose:()=>{if(closed)return;binding.close();app.dispose();closed=true;listeners.clear();}});
}
