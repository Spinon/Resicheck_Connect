import {createPersistentAuthProvider,type SecureSessionStore} from '../../../packages/session/src/persistent-auth-provider.ts';
import {createSupabaseAuthProvider} from '../../../packages/session/src/supabase-auth-provider.ts';
import {createTextSessionChannel} from '../../../packages/chat-client/src/text-session-channel.ts';
import {createAccessRecentControllers} from './access-recent-controllers.ts';
import {authDiagnosticConfig} from './auth-diagnostic-config.ts';
import {createPendingRegistrationFetch} from './pending-registration-http.ts';

type Dependencies=Readonly<{
 publicConfig:unknown;fetch:typeof fetch;createId:()=>string;now:()=>number;sessionStore?:SecureSessionStore;
 schedule:(callback:()=>void,ms:number)=>()=>void;timeoutMs:number;
}>;
const unavailable=()=>Error('Pending registration configuration unavailable');

/** Configuration admission only: a key's spelling cannot prove project custody.
 * The existing validator pins Connect, copies the public fields and rejects
 * extra fields, privileged/legacy keys and fixture placeholders. A future build
 * must also verify its project-scoped public-key retrieval receipt/hash.
 * No environment, native storage, Vault, default fetch or synthetic fallback. */
export function connectedPendingRegistrationConfig(raw:unknown){
 try{return authDiagnosticConfig(raw);}catch{throw unavailable();}
}

/** Owns a dedicated provider/channel. Construction starts no I/O. All Auth and
 * onboarding traffic passes the existing pending-only boundary; constructing
 * the shared controllers does not admit membership, activation or chat routes.
 * This candidate does not demonstrate server authorization or online readiness. */
export function createConnectedPendingRegistration(deps:Dependencies){
 let config:ReturnType<typeof connectedPendingRegistrationConfig>;
 let nativeFetch:typeof fetch,createId:()=>string,now:()=>number,schedule:Dependencies['schedule'],timeoutMs:number,sessionStore:SecureSessionStore|undefined;
 try{
  const {publicConfig,fetch,createId:id,now:clock,schedule:timer,timeoutMs:timeout,sessionStore:storage}=deps;
  config=connectedPendingRegistrationConfig(publicConfig);
  if([fetch,id,clock,timer].some(fn=>typeof fn!=='function')||!Number.isSafeInteger(timeout)||timeout<1||timeout>60000)throw unavailable();
  nativeFetch=fetch;createId=id;now=clock;schedule=timer;timeoutMs=timeout;sessionStore=storage;
 }catch{throw unavailable();}
 const options={projectUrl:config.projectUrl,publishableKey:config.publishableKey,fetch:createPendingRegistrationFetch(nativeFetch,config.publishableKey),now,schedule,timeoutMs};
 const base=createSupabaseAuthProvider(options);
 let provider:ReturnType<typeof createPersistentAuthProvider>|typeof base;
 try{provider=sessionStore===undefined?base:createPersistentAuthProvider({base,store:sessionStore,now});}catch{base.dispose();throw unavailable();}
 const transport=createTextSessionChannel(options);
 try{
  const app=createAccessRecentControllers({provider,transport,createId,now,schedule,timeoutMs,preserveSessionOnDispose:sessionStore!==undefined});
  let closing:ReturnType<typeof app.dispose>|null=null;
  return Object.freeze({...app,restoreSession:()=>app.auth.restore(),
   dispose(){
    if(!closing)closing=app.dispose().finally(()=>{try{transport.signOut();}finally{provider.dispose();}});
    return closing;
   },
  });
 }catch{try{transport.signOut();}finally{provider.dispose();}throw unavailable();}
}
