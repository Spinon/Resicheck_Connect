import {createAccessRecentControllers} from '../src/access-recent-controllers.ts';
import {createSupabaseAuthProvider} from '../../../packages/session/src/supabase-auth-provider.ts';
import {createTextSessionChannel} from '../../../packages/chat-client/src/text-session-channel.ts';
import type {MembershipRpc} from '../../../packages/chat-client/src/membership-directory.ts';
import {createSyntheticRegistrationServer} from './synthetic-registration-server.ts';
import {createSyntheticMembershipBackend} from './synthetic-membership-backend.ts';
import {createSyntheticJourneyRecentServer} from './synthetic-journey-recent-server.ts';

// QA-only envelope; no global fetch, network, accounts, email or persistence.
export function syntheticReusableJson(value:unknown,status=200):Response{
 const encoded=encodeURIComponent(JSON.stringify(value)),bytes:number[]=[];
 for(let i=0;i<encoded.length;i++){if(encoded[i]==='%'){bytes.push(parseInt(encoded.slice(i+1,i+3),16));i+=2;}else bytes.push(encoded.charCodeAt(i));}
 return {status,redirected:false,url:'',headers:new Headers({'content-type':'application/json'}),body:new ReadableStream<Uint8Array>({start(c){if(status!==204)c.enqueue(new Uint8Array(bytes));c.close();}})} as Response;
}
async function read(response:Response):Promise<unknown>{
 const reader=response.body?.getReader();if(!reader)throw Error('Synthetic unavailable');
 try{const decoder=new TextDecoder('utf-8',{fatal:true});let text='',size=0;while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>32768)throw Error('Synthetic unavailable');text+=decoder.decode(part.value,{stream:true});}return JSON.parse(text+decoder.decode());}finally{reader.releaseLock();}
}
export function createSyntheticReusableAccess(createId:()=>string){
 const json=syntheticReusableJson,server=createSyntheticRegistrationServer(json),backend=createSyntheticMembershipBackend(createId),approved=new Set<string>(),names=new Map<string,string>();
 const schedule=(fn:()=>void,ms:number)=>{const id=setTimeout(fn,ms);return()=>clearTimeout(id);};
 const membershipNames=new Set(['search_connect_companies','my_connect_memberships','managed_connect_staff','connect_staff_inbox','link_patient','request_staff','approve_staff','revoke_staff','accept_staff_invite']);
 const voidNames=new Set(['request_staff','approve_staff','revoke_staff','accept_staff_invite']);
 const baseFetch:typeof fetch=async(input,init)=>{
  const url=new URL(String(input));if(url.origin!=='https://abcdefghijklmnopqrst.supabase.co')throw Error('Synthetic unavailable');
  const name=url.pathname.startsWith('/rest/v1/rpc/')?url.pathname.slice('/rest/v1/rpc/'.length):'';
  if(!name)return server.fetch(input,init);
  const signal=init?.signal??new AbortController().signal,identityResponse=await server.fetch(url.origin+'/auth/v1/user',{headers:init?.headers,signal});
  if(identityResponse.status!==200)return json({code:'42501'},403);
  const identity=await read(identityResponse) as {id?:unknown};if(typeof identity.id!=='string')return json({code:'42501'},403);const user=identity.id;
  if(membershipNames.has(name)){
   const params=JSON.parse(String(init?.body??'{}')),reply=await backend.rpc(user)({name,params} as Parameters<MembershipRpc>[0],signal);
   return reply.error?json(reply.error,403):json(reply.data,voidNames.has(name)?204:200);
  }
  if(name==='my_connect_staff_employer'){const reply=await backend.employerRpc(user)(signal);return reply.error?json(reply.error,403):json(reply.data);}
  const response=await server.fetch(input,init);if(response.status!==200)return response;
  if(name==='register_profile'||name==='resubmit_profile'){const input=JSON.parse(String(init?.body));names.set(user,input.p_name);approved.delete(user);backend.suspend(user);}
  if(name==='withdraw_profile'){approved.delete(user);backend.suspend(user);}
  if(approved.has(user)&&(name==='my_profile_registration'||name==='my_profile_registration_request')){const payload=await read(response) as Record<string,unknown>;return json(payload.registration_state==='pending'?{...payload,registration_state:'approved'}:payload);}
  return response;
 };
 const textServer=createSyntheticJourneyRecentServer({fetch:baseFetch,json,rpc:backend.rpc,createId,schedule});
 const deps={projectUrl:'https://abcdefghijklmnopqrst.supabase.co',publishableKey:'sb_publishable_synthetic',fetch:textServer.fetch,now:Date.now,schedule,timeoutMs:3000};
 const provider=createSupabaseAuthProvider(deps),transport=createTextSessionChannel(deps);
 const app=createAccessRecentControllers({provider,transport,createId,now:Date.now,schedule,timeoutMs:5000});
 let closing:Promise<unknown>|null=null;
 return Object.freeze({...app,
  async approveProfileFixture(){const a=app.auth.snapshot(),profile=app.registration.snapshot().profile;if(a.status!=='authenticated'||!a.userId||profile?.kind!=='profile'||profile.state!=='pending')return false;approved.add(a.userId);backend.activate(a.userId,names.get(a.userId)??profile.name);await app.registration.bind().onRefresh(new AbortController().signal);app.members.resume();return true;},
  dispose(){if(!closing)closing=app.dispose().finally(()=>{provider.dispose();backend.release();textServer.releaseHistory();textServer.releaseRecent();textServer.releaseAck();});return closing;},
 });
}
