import {createSyntheticRegistrationServer} from './synthetic-registration-server.ts';
import {createAuthController} from '../../../packages/session/src/auth-controller.ts';
import {createSupabaseAuthProvider} from '../../../packages/session/src/supabase-auth-provider.ts';
import {createSessionRpcTransport} from '../../../packages/chat-client/src/session-rpc.ts';
import {createPersistentNotificationPreferencesHost} from '../src/persistent-notification-preferences-host.ts';

// Offline fixture, not an authorization server, durable store or SQL emulator.
// The real candidate controllers/adapter/lease use injected HTTP envelopes only.
export function createSyntheticPersistentNotificationRuntime(json:(value:unknown,status?:number)=>Response,createId:()=>string){
  const server=createSyntheticRegistrationServer(json),installationId='90000000-0000-4000-8000-000000000001';
  type State={privacy:number;filter:null|'all'|'important';revision:number};
  const values=new Map<string,State>(),receipts=new Map<string,{payload:string;value:unknown}>();
  let loseAck=false,writes=0,reads=0,closed=false;
  const injected:typeof fetch=async(input,init)=>{
    if(closed)throw Error('Offline fixture closed');
    const url=new URL(String(input)),name=url.pathname.split('/').at(-1);
    if(name!=='get_notification_preferences_v1'&&name!=='set_notification_preferences_v1')return server.fetch(input,init);
    const identity=await server.fetch(url.origin+'/auth/v1/user',{headers:init?.headers,signal:init?.signal});
    if(identity.status!==200)return json({code:'42501'},403);
    const user=await identity.json() as {id:string},data=JSON.parse(String(init?.body??'{}'));
    if(init?.method!=='POST'||data.p_installation!==installationId)return json({code:'22023'},400);
    const current=values.get(user.id)??{privacy:1,filter:null,revision:0};
    if(name==='get_notification_preferences_v1'){reads++;return json({installation_id:installationId,...current});}
    const key=user.id+':'+data.p_operation,payload=JSON.stringify(data),prior=receipts.get(key);
    let reply:unknown;
    if(prior){if(prior.payload!==payload)return json({code:'22023'},400);reply=prior.value;}
    else{
      if(data.p_expected_revision!==current.revision)return json({code:'40001'},409);
      if(![1,2,3,4].includes(data.p_privacy)||![null,'all','important'].includes(data.p_filter))return json({code:'22023'},400);
      const next={privacy:data.p_privacy,filter:data.p_filter,revision:current.revision+(current.privacy===data.p_privacy&&current.filter===data.p_filter?0:1)};
      values.set(user.id,next);writes++;reply={installation_id:installationId,operation_id:data.p_operation,...next};receipts.set(key,{payload,value:reply});
    }
    if(loseAck){loseAck=false;throw Error('Synthetic acknowledgement lost');}
    return json(reply);
  };
  const schedule=(fn:()=>void,ms:number)=>{const t=setTimeout(fn,ms);return()=>clearTimeout(t);};
  const deps={projectUrl:'https://abcdefghijklmnopqrst.supabase.co',publishableKey:'sb_publishable_synthetic',fetch:injected,now:Date.now,schedule,timeoutMs:3000};
  const provider=createSupabaseAuthProvider(deps),transport=createSessionRpcTransport(deps);
  const auth=createAuthController({provider,transport,authorizeCompany:async()=>false,clearPrivateView:()=>undefined,createSessionKey:createId,now:Date.now,schedule,timeoutMs:3000});
  const preferences=createPersistentNotificationPreferencesHost({auth,installationId,createOperationId:createId,schedule,timeoutMs:3000});
  return Object.freeze({auth,preferences,loseNextWriteAcknowledgement:()=>{loseAck=true;},counts:()=>({writes,reads}),
    async dispose(){if(closed)return;preferences.dispose();await auth.signOut();transport.signOut();provider.dispose();closed=true;values.clear();receipts.clear();},
  });
}
