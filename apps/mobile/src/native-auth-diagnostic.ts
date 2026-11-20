import {fetch as expoFetch} from 'expo/fetch';
import {createAuthOnlyProbe} from '../../../packages/session/src/auth-only-probe';
import {createAuthDiagnosticFetch,AUTH_DIAGNOSTIC_ORIGIN} from './auth-diagnostic-http';
import {createAuthDiagnosticController} from './auth-diagnostic-controller';
import {authDiagnosticConfig} from './auth-diagnostic-config';
// Unmounted candidate. Only a reviewed public project key belongs here.
// No fallback to global fetch, .env, storage, privileged keys or another host.
export function prepareNativeAuthDiagnostic(raw:unknown){
  const config=authDiagnosticConfig(raw);
  if(config.projectUrl!==AUTH_DIAGNOSTIC_ORIGIN)throw Error('Auth diagnostic unavailable');
  const fetch=createAuthDiagnosticFetch(expoFetch as unknown as typeof globalThis.fetch,config.publishableKey);
  const probe=createAuthOnlyProbe({publishableKey:config.publishableKey,fetch,now:()=>Date.now(),schedule:(fn,ms)=>{const id=setTimeout(fn,ms);return()=>clearTimeout(id);},timeoutMs:10000});
  return createAuthDiagnosticController(probe);
}
