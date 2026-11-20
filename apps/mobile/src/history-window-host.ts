import {createHistoryWindow} from '../../../packages/chat-client/src/history-window.ts';
type Options=Parameters<typeof createHistoryWindow>[0];
// Separate opt-in QA assembly. Read authorization belongs to the injected port;
// the caller must replace/dispose this immutable host when context changes.
export function createHistoryWindowHost(options:Omit<Options,'schedule'|'timeoutMs'>&Partial<Pick<Options,'schedule'|'timeoutMs'>>){
  const {schedule=(fn:()=>void,ms:number)=>{const timer=setTimeout(fn,ms);return()=>clearTimeout(timer);},timeoutMs=5000,...rest}=options;
  const host=createHistoryWindow({...rest,schedule,timeoutMs});void host.loadLatest();return host;
}
