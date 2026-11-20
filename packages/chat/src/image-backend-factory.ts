import{createImageS3Read}from'./image-s3-read.ts';
import{createAudioJwtVerifier}from'./audio-jwt-verifier.ts';
import{createImageSqlVerifier}from'./image-sql-executor.ts';
import{createPrivateImageStorage}from'./image-private-storage.ts';
import{openImageBackend}from'./image-backend-session.ts';
import type{AudioPgPool}from'./audio-sql-executor.ts';
import type{ImageScope}from'../../chat-client/src/image-contract.ts';
/** Node server factory. Reuses Auth-server verification without changing audio.
 * Pool must be separately provisioned for SET ROLE connect_image_backend only;
 * no DSN, password, role, grants, listener or service is created here. OFF. */
export function createImageBackendFactory(input:Readonly<{enabled?:boolean;publishableKey:string;publicAnonKey?:string;pool:AudioPgPool;fetch:typeof fetch;now:()=>number;schedule:(f:()=>void,ms:number)=>()=>void;timeoutMs:number}>){
 const d=Object.freeze({...input}),source=createImageS3Read({enabled:d.enabled===true,publicAnonKey:d.publicAnonKey,fetch:d.fetch,now:d.now}),verifyJwt=createAudioJwtVerifier({enabled:d.enabled===true,publishableKey:d.publishableKey,fetch:d.fetch,now:d.now,timeoutMs:d.timeoutMs}),verify=createImageSqlVerifier({enabled:d.enabled===true,verifyJwt,pool:d.pool,now:d.now});
 return(credential:string,scope:ImageScope,signal:AbortSignal)=>openImageBackend({enabled:d.enabled===true,credential,scope,signal,verify,readPublished:(descriptor,s)=>source.read(descriptor,credential,s),storage:current=>createPrivateImageStorage({enabled:true,companyId:scope.companyId,conversationId:scope.conversationId,current,headers:()=>({apikey:d.publishableKey,authorization:'Bearer '+credential}),fetch:d.fetch,schedule:d.schedule,timeoutMs:d.timeoutMs})});
}
