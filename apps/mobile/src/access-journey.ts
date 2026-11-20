import {createSupabaseAuthProvider} from '../../../packages/session/src/supabase-auth-provider.ts';
import {createAuthController} from '../../../packages/session/src/auth-controller.ts';
import {createSessionRpcTransport} from '../../../packages/chat-client/src/session-rpc.ts';
import {createRegistrationHost} from './registration-host.ts';
import {createRegistrationMembershipGate} from './registration-membership-gate.ts';
import {createMembershipHost} from './membership-host.ts';

// Candidate assembly, not mounted in the app. No default fetch, account,
// credentials, approval fixture, storage, restoration or clinical authorization.
export function createAccessJourney(options:Parameters<typeof createSessionRpcTransport>[0]&{createId:()=>string}){
 const provider=createSupabaseAuthProvider(options),transport=createSessionRpcTransport(options);
 let members:ReturnType<typeof createMembershipHost>|null=null,disposed=false;
 const auth=createAuthController({provider,transport,authorizeCompany:async()=>false,clearPrivateView:()=>{members?.suspend();return undefined;},createSessionKey:options.createId,now:options.now,schedule:options.schedule,timeoutMs:options.timeoutMs});
 const registration=createRegistrationHost({auth,signUp:provider.signUp,createRequestId:options.createId,schedule:options.schedule,timeoutMs:options.timeoutMs});
 const gate=createRegistrationMembershipGate(auth,registration);
 members=createMembershipHost({auth,gate,schedule:options.schedule,timeoutMs:options.timeoutMs});const host=members;
 const unsubscribe=auth.subscribe(()=>{if(!disposed&&['authenticated','signed-out'].includes(auth.snapshot().status))host.resume();});
 let closing:Promise<void>|null=null;
 return Object.freeze({auth,registration,gate,members:host,dispose:()=>{
  if(closing)return closing;disposed=true;unsubscribe();host.dispose();gate.dispose();registration.dispose();transport.signOut();
  closing=auth.signOut().then(()=>{},()=>{}).finally(()=>provider.dispose());return closing;
 }});
}
