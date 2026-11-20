import {createRecentConversation} from '../../../packages/chat-client/src/recent-conversation.ts';
type Options=Parameters<typeof createRecentConversation>[0];
export function createRecentConversationHost(options:Omit<Options,'schedule'|'timeoutMs'>&Partial<Pick<Options,'schedule'|'timeoutMs'>>){
  const {schedule=(fn:()=>void,ms:number)=>{const timer=setTimeout(fn,ms);return()=>clearTimeout(timer);},timeoutMs=5000,...rest}=options;
  const host=createRecentConversation({...rest,schedule,timeoutMs});void host.refreshLatest();return host;
}
