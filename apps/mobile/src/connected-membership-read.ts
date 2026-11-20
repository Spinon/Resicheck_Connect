import {createPersistentAuthProvider,type SecureSessionStore} from '../../../packages/session/src/persistent-auth-provider.ts';
import {createSupabaseAuthProvider} from '../../../packages/session/src/supabase-auth-provider.ts';
import {createTextSessionChannel} from '../../../packages/chat-client/src/text-session-channel.ts';
import {createAccessRecentControllers} from './access-recent-controllers.ts';
import {authDiagnosticConfig} from './auth-diagnostic-config.ts';
import {createMembershipReadFetch} from './membership-read-http.ts';

type Dependencies=Readonly<{publicConfig:unknown;fetch:typeof fetch;createId:()=>string;now:()=>number;sessionStore?:SecureSessionStore;schedule:(callback:()=>void,ms:number)=>()=>void;timeoutMs:number}>;
const unavailable=()=>Error('Membership read configuration unavailable');

/** Admission pins Connect/public fields, not proof of key ownership or account
 * identity. Build review must separately verify the project-scoped key receipt. */
export function connectedMembershipReadConfig(raw:unknown){try{return authDiagnosticConfig(raw);}catch{throw unavailable();}}

/** A dedicated provider/channel and shared controllers, using one verified
 * lease. No default fetch, fixture, activation, UI, entry or persistent storage.
 * Existing server grants remain unchanged; only this client's traffic is cut
 * to pending registration and membership/history reads. Never call it a
 * read-only server or treat a locally approved profile as verified identity. */
export function createConnectedMembershipRead(deps:Dependencies){
 let config:ReturnType<typeof connectedMembershipReadConfig>;
 let nativeFetch:typeof fetch,createId:()=>string,now:()=>number,schedule:Dependencies['schedule'],timeoutMs:number,sessionStore:SecureSessionStore|undefined;
 try{
  const {publicConfig,fetch,createId:id,now:clock,schedule:timer,timeoutMs:timeout,sessionStore:storage}=deps;
  config=connectedMembershipReadConfig(publicConfig);
  if([fetch,id,clock,timer].some(fn=>typeof fn!=='function')||!Number.isSafeInteger(timeout)||timeout<1||timeout>60000)throw unavailable();
  nativeFetch=fetch;createId=id;now=clock;schedule=timer;timeoutMs=timeout;sessionStore=storage;
 }catch{throw unavailable();}
 const options={projectUrl:config.projectUrl,publishableKey:config.publishableKey,fetch:createMembershipReadFetch(nativeFetch,config.publishableKey),now,schedule,timeoutMs};
 const base=createSupabaseAuthProvider(options);
 let provider:ReturnType<typeof createPersistentAuthProvider>|typeof base;
 try{provider=sessionStore===undefined?base:createPersistentAuthProvider({base,store:sessionStore,now});}catch{base.dispose();throw unavailable();}
 const transport=createTextSessionChannel(options);
 try{
  const app=createAccessRecentControllers({provider,transport,createId,now,schedule,timeoutMs,preserveSessionOnDispose:sessionStore!==undefined});let closing:ReturnType<typeof app.dispose>|null=null;
  return Object.freeze({...app,restoreSession:()=>app.auth.restore(),dispose(){if(!closing)closing=app.dispose().finally(()=>{try{transport.signOut();}finally{provider.dispose();}});return closing;}});
 }catch{try{transport.signOut();}finally{provider.dispose();}throw unavailable();}
}
