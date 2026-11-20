import {createAccountDeleteIntent,type AccountDeleteConfirmation,type AccountDeletePorts} from './account-delete-intent.ts';
import type {LocalExpiryForeground} from '../../../packages/session/src/auth-controller.ts';

/** Unmounted local candidate. Required ports have no defaults. This adapter is
 * not authorization, a deletion executor or an available account setting.
 * A screen must actually clear its controlled fields in clearSensitiveInput;
 * neither this wrapper nor JS can guarantee forensic erasure of strings. */
export function createAccountDeleteLifecycle(deps:Readonly<{
 ports:AccountDeletePorts;
 captureForeground:()=>LocalExpiryForeground|null;
 clearSensitiveInput:()=>void;
}>){
 if(!deps||typeof deps.captureForeground!=='function'||typeof deps.clearSensitiveInput!=='function')throw Error('Account confirmation unavailable');
 const intent=createAccountDeleteIntent(deps.ports);
 let started=false,retired=false,disposed=false,capture:LocalExpiryForeground|null=null,stopScope=()=>{};
 function clear(){try{deps.clearSensitiveInput();return true;}catch{return false;}}
 function detach(){const stop=stopScope;stopScope=()=>{};try{stop();}catch{}}
 function retire(){
  if(retired)return;retired=true;capture=null;detach();clear();
  if(!['cancelled','uncertain','failed','blocked','login-removed'].includes(intent.snapshot().stage))intent.cancel();
 }
 function live(){
  if(disposed||retired||!started||!capture)return false;
  try{if(capture.isCurrent()===true)return true;}catch{}
  retire();return false;
 }
 const stopIntent=intent.subscribe(()=>{
  if(['cancelled','uncertain','failed','blocked','login-removed'].includes(intent.snapshot().stage))retire();
 });
 return Object.freeze({
  snapshot(){if(started&&!retired)live();return intent.snapshot();},
  subscribe:intent.subscribe,
  begin(){
   if(disposed||retired||started)return false;started=true;
   try{
    capture=deps.captureForeground();
    if(!live()) {retire();return false;}
    const stop=capture!.onInvalidate(retire);
    if(typeof stop!=='function')throw Error('Lifecycle unavailable');
    if(retired){try{stop();}catch{}return false;}
    stopScope=stop;
    if(!live())return false;
    const opened=intent.begin();
    if(!opened||!live()){retire();return false;}
    return true;
   }catch{retire();return false;}
  },
  reauthenticate(first:string,second:string):Promise<boolean>{
   if(!live()||intent.snapshot().stage!=='captured')return Promise.resolve(false);
   // Clear UI fields before passing the one password to the injected port.
   // Clearing can itself trigger navigation, background or account change.
   if(!clear()){retire();return Promise.resolve(false);}
   if(!live()||intent.snapshot().stage!=='captured')return Promise.resolve(false);
   return intent.reauthenticate(first,second);
  },
  confirm(declaration:AccountDeleteConfirmation):Promise<boolean>{
   if(!live()||intent.snapshot().stage!=='awaiting-confirmation')return Promise.resolve(false);
   if(!clear()){retire();return Promise.resolve(false);}
   if(!live()||intent.snapshot().stage!=='awaiting-confirmation')return Promise.resolve(false);
   return intent.confirm(declaration);
  },
  cancel:retire,
  dispose(){if(disposed)return;disposed=true;retire();try{stopIntent();}finally{intent.dispose();}},
 });
}
