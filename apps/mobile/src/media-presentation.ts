import {createMediaVisibility,type MediaAppState,type MediaPickerOutcome} from './media-visibility.ts';
import type {ConversationMediaScopePort} from './conversation-media-scope.ts';
export const mediaAppState=(value:string):MediaAppState=>value==='active'||value==='inactive'||value==='background'?value:'unknown';

// Presentation only: no file ownership or transport authority. One controller
// subscribes before React renders, so old account callbacks fail immediately.
export function createMediaPresentation(session:ConversationMediaScopePort,initial:MediaAppState='unknown'){
 const gate=createMediaVisibility(undefined,initial);
 const sync=()=>{const id=session.getSnapshot().activeConversationId;gate.selectScope(id?session.captureConversationContext(id):null);};
 const unsubscribe=session.subscribe(sync);sync();
 return Object.freeze({
  gate,
  select:async(operation:()=>Promise<MediaPickerOutcome>)=>{
   const actions=gate.bind(),ticket=actions.beginPicker();if(!ticket)return false;
   try{const outcome=await operation();return actions.settlePicker(ticket,outcome)&&outcome==='selected';}
   catch{actions.settlePicker(ticket,'failed');return false;}
  },
  dispose:()=>{unsubscribe();gate.dispose();},
 });
}
