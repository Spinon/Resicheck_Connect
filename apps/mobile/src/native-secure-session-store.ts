import type {SecureSessionStore} from '../../../packages/session/src/persistent-auth-provider.ts';
const unavailable=()=>Error('Secure session unavailable');
/** Capture only the fixed native methods. Provider and native backend both
 * re-admit records/CAS; no credentials, key aliases or file paths in this UI port. */
export function nativeSecureSessionStore(raw:unknown):SecureSessionStore{
 try{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw unavailable();
  const native=raw as Record<string,unknown>,claim=native.claim,save=native.save,clear=native.clear;
  if([claim,save,clear].some(value=>typeof value!=='function'))throw unavailable();
  return Object.freeze({
   claim:()=>Reflect.apply(claim as Function,native,[]) as ReturnType<SecureSessionStore['claim']>,
   save:(epoch,record)=>Reflect.apply(save as Function,native,[epoch,record]) as ReturnType<SecureSessionStore['save']>,
   clear:epoch=>Reflect.apply(clear as Function,native,[epoch]) as ReturnType<SecureSessionStore['clear']>,
  });
 }catch{throw unavailable();}
}
