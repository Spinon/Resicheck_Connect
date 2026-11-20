import {createAuthController} from './auth-controller.ts';
import {createSupabaseAuthProvider} from './supabase-auth-provider.ts';
import {createSessionRpcTransport} from '../../chat-client/src/session-rpc.ts';
type Input=Readonly<{email:string;password:string}>;
type Options={publishableKey:string;fetch:typeof globalThis.fetch;now:()=>number;schedule:(fn:()=>void,ms:number)=>()=>void;timeoutMs:number};
type Outcome='verified'|'unavailable'|'cancelled'|'busy';
export type AuthProbeReceipt=Readonly<{scope:'auth-only';outcome:Outcome;localSessionClosed:boolean;remoteRevocationConfirmed:boolean;businessAccessTested:false;persistentStorageUsed:false}>;
const receipt=(outcome:Outcome,remoteRevocationConfirmed=false):AuthProbeReceipt=>Object.freeze({scope:'auth-only',outcome,localSessionClosed:outcome!=='busy',remoteRevocationConfirmed,businessAccessTested:false,persistentStorageUsed:false});
// Candidate operator diagnostic. Never creates/signs up a user, sends email,
// calls onboarding/SQL, activates business access or exposes tokens/subject IDs.
// No default network implementation; tests inject fictional HTTP only.
export function createAuthOnlyProbe(options:Options){
  if(!Number.isSafeInteger(options.timeoutMs)||options.timeoutMs<1||options.timeoutMs>15000)throw Error('Auth probe unavailable');
  let busy=false,disposed=false,cycle=0;const cancels=new Set<()=>void>();
  return Object.freeze({
    async run(input:Input,signal:AbortSignal):Promise<AuthProbeReceipt>{
      if(disposed||signal.aborted)return receipt('cancelled');if(busy)return receipt('busy');busy=true;
      let provider:ReturnType<typeof createSupabaseAuthProvider>|null=null,transport:ReturnType<typeof createSessionRpcTransport>|null=null,auth:ReturnType<typeof createAuthController>|null=null;
      let cancelled=false,remoteConfirmed=false,verified=false;let reject!:(e:Error)=>void;
      const stopped=new Promise<never>((_,r)=>{reject=r;});void stopped.catch(()=>{});
      const stop=()=>{cancelled=true;reject(Error('Auth probe cancelled'));transport?.signOut();provider?.dispose();if(auth)void auth.signOut().catch(()=>{});};
      try{
        // Exact Connect project; configuration cannot choose another origin.
        const deps={...options,projectUrl:'https://ibdlvlwdzmsrbqadrudb.supabase.co'};
        provider=createSupabaseAuthProvider(deps);transport=createSessionRpcTransport(deps);
        auth=createAuthController({provider,transport,authorizeCompany:async()=>false,clearPrivateView:()=>undefined,createSessionKey:()=>`probe-${++cycle}`,now:options.now,schedule:options.schedule,timeoutMs:options.timeoutMs});
        cancels.add(stop);signal.addEventListener('abort',stop,{once:true});if(signal.aborted||disposed)stop();
        const active=auth;
        verified=await Promise.race([stopped,active.signIn(input.email,input.password)]);
        if(cancelled||signal.aborted||disposed)return receipt('cancelled');
        const cleanup=await Promise.race([stopped,active.signOut()]);remoteConfirmed=cleanup.remoteConfirmed===true;
        return receipt(verified?'verified':'unavailable',remoteConfirmed);
      }catch{return receipt(cancelled||signal.aborted||disposed?'cancelled':'unavailable');}
      finally{
        signal.removeEventListener('abort',stop);cancels.delete(stop);
        transport?.signOut();provider?.dispose();if(auth)void auth.signOut().catch(()=>{});busy=false;
      }
    },
    dispose:()=>{disposed=true;for(const cancel of [...cancels])cancel();},
  });
}
