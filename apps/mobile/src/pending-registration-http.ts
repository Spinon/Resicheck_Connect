import {onboardingPayload,type OnboardingCommand} from '../../../packages/chat-client/src/onboarding-rpc.ts';
import {AUTH_DIAGNOSTIC_ORIGIN} from './auth-diagnostic-http.ts';

const rpcNames=new Set(['register_profile','request_company','my_profile_registration','my_profile_registration_request','my_company_registration_page','my_company_registration']);
const authRoutes=new Set(['/auth/v1/signup','/auth/v1/token?grant_type=password','/auth/v1/token?grant_type=refresh_token','/auth/v1/user','/auth/v1/logout?scope=local']);
const unavailable=()=>Error('Registration connection unavailable');
const record=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==='object'&&!Array.isArray(value);
const keys=(value:object)=>Object.keys(value).sort().join(',');
const bearer=(value:string|null)=>value!==null&&/^Bearer [A-Za-z0-9_.-]{1,8192}$/.test(value)&&!value.startsWith('Bearer sb_');

/** Unmounted candidate for the pending-registration cut. Native fetch must be
 * explicitly supplied after deployment/configuration review; no default I/O,
 * storage, credentials, account activation or client-selected endpoint.
 * This client restriction is not server authorization, RLS or TLS evidence. */
export function createPendingRegistrationFetch(nativeFetch:typeof fetch,publishableKey:string):typeof fetch {
  if(typeof nativeFetch!=='function'||!/^sb_publishable_[A-Za-z0-9_-]{1,200}$/.test(publishableKey))throw unavailable();
  return (async(input,init)=>{
    let url:string,request:RequestInit;
    try{
      if(typeof input!=='string'||!input.startsWith(AUTH_DIAGNOSTIC_ORIGIN)||!init)throw unavailable();
      url=input;
      // Read each caller-owned option once; only the checked primitives and a
      // copied header collection reach native fetch, including after mutation.
      const {method,body,headers:rawHeaders,signal,redirect,credentials}=init;
      if(!(signal instanceof AbortSignal)||signal.aborted||redirect!=='error'||credentials!=='omit')throw unavailable();
      const route=url.slice(AUTH_DIAGNOSTIC_ORIGIN.length),rpc=route.startsWith('/rest/v1/rpc/')?route.slice('/rest/v1/rpc/'.length):null;
      if(!(rpc!==null?rpcNames.has(rpc):authRoutes.has(route))||method!==(route==='/auth/v1/user'?'GET':'POST'))throw unavailable();
      const headers=new Headers(rawHeaders),allowed=new Set(['apikey','accept','content-type','authorization']);
      headers.forEach((_,name)=>{if(!allowed.has(name))throw unavailable();});
      if(headers.get('apikey')!==publishableKey||headers.get('accept')!=='application/json')throw unavailable();
      const authenticated=rpc!==null||route==='/auth/v1/user'||route==='/auth/v1/logout?scope=local';
      if(authenticated?!bearer(headers.get('authorization')):headers.has('authorization'))throw unavailable();
      let projectedBody:string|undefined;
      if(route==='/auth/v1/user'||route==='/auth/v1/logout?scope=local'){
        if(body!==undefined||headers.has('content-type'))throw unavailable();
      }else{
        if(typeof body!=='string'||body.length>12000||new TextEncoder().encode(body).length>12000||headers.get('content-type')!=='application/json')throw unavailable();
        const parsed:unknown=JSON.parse(body);if(!record(parsed))throw unavailable();
        if(rpc!==null){
          const projected=onboardingPayload({name:rpc,params:parsed} as OnboardingCommand);
          const canonical=JSON.parse(projected.body) as Record<string,unknown>;
          if(projected.name!==rpc||keys(parsed)!==keys(canonical))throw unavailable();
          projectedBody=projected.body;
        }else if(route==='/auth/v1/token?grant_type=refresh_token'){
          const token=parsed.refresh_token;
          if(keys(parsed)!=='refresh_token'||typeof token!=='string'||!token||token.length>8192||/[\u0000-\u0020\u007f]/.test(token)||token.startsWith('sb_'))throw unavailable();
          projectedBody=JSON.stringify({refresh_token:token});
        }else{
          const {email,password}=parsed;
          if(keys(parsed)!=='email,password'||typeof email!=='string'||email.length>320||!/^\S+@\S+\.\S+$/.test(email)||typeof password!=='string'||!password||password.length>1024)throw unavailable();
          projectedBody=JSON.stringify({email,password});
        }
      }
      headers.set('Cache-Control','no-store');
      if(signal.aborted)throw unavailable();
      request={method,headers,body:projectedBody,signal,redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'};
    }catch{throw unavailable();}
    // Preserve HTTP status/body unchanged for the existing bounded decoders.
    // Native exceptions never escape with URLs, tokens or form input attached.
    try{return await nativeFetch(url,request);}catch{throw unavailable();}
  }) as typeof fetch;
}
