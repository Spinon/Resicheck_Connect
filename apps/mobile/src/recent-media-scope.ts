import type {createMembershipRecentBridge} from './membership-recent-bridge.ts';
import type {ConversationMediaCapability,ConversationMediaScopePort} from './conversation-media-scope.ts';
export type RecentMediaScopeSource=Pick<ReturnType<typeof createMembershipRecentBridge>,'snapshot'|'subscribe'|'captureMediaScope'>;
type Entry={id:string;source:ConversationMediaCapability;cap:ConversationMediaCapability;retired:boolean};
let ownerSequence=0;
/** Opaque presentation/file owner only. No user/company/conversation identifiers,
 * authorization, URI access or transport capability are derived here. */
export function createRecentMediaScope(recent:RecentMediaScopeSource):ConversationMediaScopePort&Readonly<{dispose:()=>void}>{
 const owner=++ownerSequence,hidden=Object.freeze({activeConversationId:null});let sequence=0,disposed=false,reading=false,dirtyNotify=false,version=0,entry:Entry|null=null,view:Readonly<{activeConversationId:string|null}>=hidden;
 const listeners=new Set<()=>void>();
 const notify=()=>{for(const f of [...listeners])try{f();}catch{}};
 function hide(){if(entry)entry.retired=true;entry=null;const changed=view!==hidden;view=hidden;return changed;}
 function current(e:Entry){if(disposed||e.retired||entry!==e)return false;let valid=false;try{valid=e.source.current()===true;}catch{}if(!valid||disposed||entry!==e){e.retired=true;if(entry===e){const changed=hide();if(reading)dirtyNotify=changed||dirtyNotify;else if(changed)notify();}return false;}return true;}
 function sync(){
  if(disposed||reading)return;reading=true;const epoch=version;let next:Entry|null=null,changed=false;
  try{
   const snapshot=recent.snapshot(),raw=snapshot.route==='chat'&&snapshot.host?recent.captureMediaScope():null,token=raw?.token,check=raw?.current;
   if(typeof token==='object'&&token!==null&&typeof check==='function'&&check()===true&&!disposed&&version===epoch){
    if(entry&&entry.source.token===token&&current(entry))next=entry;
    else{const source=Object.freeze({token,current:check});const e:Entry={id:'recent-media-'+owner+'-'+(++sequence),source,cap:null as unknown as ConversationMediaCapability,retired:false};e.cap=Object.freeze({token:Object.freeze({}),current:()=>current(e)});next=e;}
   }
  }catch{}
  if(disposed||version!==epoch)next=null;
  if(next!==entry){changed=hide();entry=next;if(next){view=Object.freeze({activeConversationId:next.id});changed=true;}}
  reading=false;const mustNotify=changed||dirtyNotify;dirtyNotify=false;if(mustNotify)notify();
 }
 const changed=()=>{version++;if(reading){dirtyNotify=hide()||dirtyNotify;return;}sync();};
 const unsubscribe=recent.subscribe(changed);sync();
 return Object.freeze({getSnapshot:()=>{if(reading)return hidden;sync();const e=entry;if(e&&!current(e))sync();return view;},captureConversationContext:(id:string)=>{if(typeof id!=='string'||disposed||reading)return null;sync();const e=entry;return e&&e.id===id&&current(e)&&entry===e&&!disposed?e.cap:null;},subscribe:(listener:()=>void)=>{if(disposed)return()=>{};listeners.add(listener);return()=>{listeners.delete(listener);};},dispose:()=>{if(disposed)return;disposed=true;version++;const changed=hide();unsubscribe();if(changed)notify();listeners.clear();}});
}
