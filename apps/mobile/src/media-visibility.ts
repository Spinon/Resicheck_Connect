export type MediaAppState='active'|'inactive'|'background'|'unknown';
export type MediaPickerOutcome='selected'|'cancelled'|'failed';
declare const pickerBrand:unique symbol;
export type MediaPickerTicket=Readonly<{[pickerBrand]:true}>;
export type MediaVisibilityScope=Readonly<{token:object|number;current:()=>boolean}>;
export type MediaVisibilityView=Readonly<{
 appState:MediaAppState;focused:boolean;mediaVisible:boolean;modalVisible:boolean;
 covered:boolean;previewOpen:boolean;pickerPending:boolean;needsExplicitReveal:boolean;lastPickerOutcome:MediaPickerOutcome|null;
}>;
const hidden:MediaVisibilityView=Object.freeze({appState:'unknown',focused:false,mediaVisible:false,modalVisible:false,covered:true,previewOpen:false,pickerPending:false,needsExplicitReveal:true,lastPickerOutcome:null});

// Local presentation gate only. It owns no URI/files and never saves, releases or
// uploads media. current() MUST capture one immutable conversation/session scope,
// not look up the latest account. Revoke/dispose this gate when that scope ends.
// Lifecycle/picker integration and OS recents/screenshot protection are NOT proven
// by this pure model. JS AppState callbacks alone cannot promise FLAG_SECURE.
export function createMediaVisibility(current?:()=>boolean,initial:MediaAppState='unknown'){
 let appState:MediaAppState=initial,focused=true,covered=true,modal=false,epoch=0,disposed=false;
 let scope:MediaVisibilityScope|null=current?Object.freeze({token:Object.freeze({}),current}):null;
 let pending:MediaPickerTicket|null=null,lastPickerOutcome:MediaPickerOutcome|null=null;
 const listeners=new Set<()=>void>();
 const live=()=>{if(!scope||disposed)return false;try{return scope.current()===true;}catch{return false;}};
 const foreground=()=>appState==='active'&&focused;
 const visible=()=>live()&&foreground()&&!covered&&pending===null;
 let view:MediaVisibilityView=hidden;
 function notify(){for(const listener of [...listeners])try{listener();}catch{}}
 function publish(){view=Object.freeze({appState,focused,mediaVisible:visible(),modalVisible:visible()&&modal,covered:!visible(),previewOpen:visible()&&modal,pickerPending:pending!==null,needsExplicitReveal:covered,lastPickerOutcome});notify();}
 function cover(){covered=true;modal=false;epoch++;}
 function revoke(){if(!scope||disposed)return;scope=null;pending=null;lastPickerOutcome=null;cover();publish();}
 function settlePicker(ticket:MediaPickerTicket,outcome:MediaPickerOutcome='selected'){
  if(!live()){revoke();return false;}
  if(pending===null||ticket!==pending||!['selected','cancelled','failed'].includes(outcome))return false;
  pending=null;lastPickerOutcome=outcome;cover();publish();return true;
 }
 publish();
 return Object.freeze({
  snapshot:():MediaVisibilityView=>live()?view:hidden,
  subscribe:(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};},
  selectScope:(next:MediaVisibilityScope|null)=>{
   if(disposed)return false;
   if(next===null){revoke();return true;}
   if(typeof next.current!=='function'||!(typeof next.token==='object'&&next.token!==null||Number.isSafeInteger(next.token)&&Number(next.token)>0)){revoke();return false;}
   let nextLive=false;try{nextLive=next.current()===true;}catch{}
   if(scope?.token===next.token&&live()&&nextLive)return true;
   scope=next;pending=null;lastPickerOutcome=null;cover();publish();return true;
  },
  setAppState:(next:MediaAppState)=>{
   if(disposed||!['active','inactive','background','unknown'].includes(next))return false;
   if(next===appState)return true;
   appState=next;cover();publish();return true;
  },
  // Android may emit blur (notification drawer) while AppState stays active.
  // An authoritative focus event can restore focus, but never reveal content.
  setFocused:(next:boolean)=>{
   if(disposed||typeof next!=='boolean')return false;if(next===focused)return true;
   focused=next;cover();publish();return true;
  },
  bind:()=>{
   const capturedEpoch=epoch,capturedScope=scope;
   const sameScope=()=>capturedScope!==null&&capturedScope===scope&&live();
   const active=()=>sameScope()&&epoch===capturedEpoch&&foreground();
   const openPreview=()=>{if(!active()||!visible())return false;modal=true;publish();return true;};
   const closePreview=()=>{if(!active())return false;modal=false;epoch++;publish();return true;};
   return Object.freeze({
    canUse:()=>active()&&visible(),
    reveal:()=>{if(!active()||pending!==null)return false;covered=false;modal=false;epoch++;publish();return true;},
    openPreview,closePreview,openModal:openPreview,closeModal:closePreview,
    hide:()=>{if(!active())return false;cover();publish();return true;},
    beginPicker:():MediaPickerTicket|null=>{
     if(!active()||pending!==null)return null;
     const ticket=Object.freeze({}) as MediaPickerTicket;pending=ticket;lastPickerOutcome=null;cover();publish();return sameScope()&&pending===ticket?ticket:null;
    },
    settlePicker:(ticket:MediaPickerTicket,outcome:MediaPickerOutcome='selected')=>sameScope()?settlePicker(ticket,outcome):false,
   });
  },
  // A system picker may background the app. Do not invalidate its opaque ticket
  // just for AppState transitions. Valid completion remains covered even when
  // active; the UI needs a NEW explicit reveal action, and never opens a modal.
  // false => caller must drop/release its private late result using its own port.
  settlePicker,
  revoke,
  dispose:()=>{if(disposed)return;revoke();disposed=true;notify();listeners.clear();},
 });
}
