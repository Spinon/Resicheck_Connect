import type {LocalExpiryForeground} from './auth-controller.ts';
import type {AppStatePort} from './auth-screen-binding.ts';
/** Lifecycle-only generation. No Auth call, timer, credential or clinical state.
 * Blur invalidates even if AppState remains active (Android notification tray).
 * Caller owns dispose alongside its runtime. Unknown/failing sources deny. */
export function createForegroundRecoveryScope(source:AppStatePort){
 let active=false,focused=true,disposed=false,failed=false,generation=0;
 const watchers=new Set<()=>void>(),cleanup:(()=>void)[]=[];
 const current=()=>!disposed&&!failed&&active&&focused;
 function invalidate(){generation++;const prior=[...watchers];watchers.clear();for(const notify of prior)try{notify();}catch{}}
 function change(nextActive:boolean,nextFocused:boolean){if(disposed)return;if(active===nextActive&&focused===nextFocused)return;active=nextActive;focused=nextFocused;invalidate();}
 try{
  active=source.currentState==='active';
  for(const event of ['change','blur','focus'] as const){
   const subscription=source.addEventListener(event,value=>{if(event==='change')change(value==='active',focused);else change(active,event==='focus');});
   if(!subscription||typeof subscription.remove!=='function')throw Error('Lifecycle unavailable');
   cleanup.push(()=>subscription.remove());
  }
 }catch{failed=true;invalidate();for(const stop of cleanup.splice(0))try{stop();}catch{}}
 return Object.freeze({
  capture:():LocalExpiryForeground|null=>{
   if(!current())return null;const captured=generation;
   const isCurrent=()=>current()&&generation===captured;
   return Object.freeze({isCurrent,onInvalidate:(listener:()=>void)=>{
    if(!isCurrent()){try{listener();}catch{}return()=>{};}
    const notify=()=>listener();watchers.add(notify);return()=>{watchers.delete(notify);};
   }});
  },
  dispose(){if(disposed)return;disposed=true;invalidate();for(const stop of cleanup.splice(0))try{stop();}catch{}},
 });
}
