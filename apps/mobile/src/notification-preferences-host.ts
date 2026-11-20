import type {AuthView} from '../../../packages/session/src/auth-controller.ts';
import {notificationPreview} from './demo.ts';
type Lease=Readonly<{userId:string;sessionKey:string;close:()=>void}>;
type Auth={snapshot:()=>AuthView;currentLease:()=>Lease|null;subscribe:(fn:()=>void)=>()=>void};
type Privacy=1|2|3|4;
type Filter='all'|'important';
type View=Readonly<{scopeKey:number;ready:boolean;privacy:Privacy;filter:Filter|null}>;
// Current session/device memory only. No preference sync, device identifier,
// push token, OS permission request or sensitive notification event is stored.
export function createNotificationPreferencesHost(auth:Auth){
 let disposed=false,lease:Lease|null=null,view:View=Object.freeze({scopeKey:0,ready:false,privacy:1,filter:null});const listeners=new Set<()=>void>();
 function publish(patch:Partial<View>){if(disposed)return;view=Object.freeze({...view,...patch});for(const fn of [...listeners])try{fn();}catch{}}
 function current(){try{const a=auth.snapshot(),l=a.status==='authenticated'?auth.currentLease():null;return auth.snapshot()===a?l:null;}catch{return null;}}
 function sync(){if(disposed)return;const next=current();if(next===lease)return;lease=next;publish({scopeKey:view.scopeKey+1,ready:!!next,privacy:1,filter:null});}
 function update(patch:Partial<Pick<View,'privacy'|'filter'>>){sync();const captured=lease;if(disposed||!captured||current()!==captured)return false;publish(patch);return !disposed&&lease===captured&&current()===captured;}
 const unsubscribe=auth.subscribe(sync);sync();
 return Object.freeze({snapshot:()=>view,subscribe:(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};},
  setPrivacy:(value:unknown)=>typeof value==='number'&&[1,2,3,4].includes(value)?update({privacy:value as Privacy}):false,
  setFilter:(value:unknown)=>value==='all'||value==='important'?update({filter:value}):false,
  preview:(important=true)=>{sync();if(disposed||!lease||current()!==lease||view.filter===null)return null;return notificationPreview({privacy:view.privacy,filter:view.filter},{company:'Empresa fictícia',attendant:'Atendente fictícia',message:'Mensagem fictícia de teste.',important});},
  dispose:()=>{if(disposed)return;unsubscribe();lease=null;disposed=true;view=Object.freeze({scopeKey:view.scopeKey+1,ready:false,privacy:1,filter:null});const old=[...listeners];listeners.clear();for(const fn of old)try{fn();}catch{}},
 });
}
