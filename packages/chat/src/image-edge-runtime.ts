import{createImageTransferHandler}from'./image-transfer-handler.ts';
import{createImageRpcBackendFactory}from'./image-rpc-backend-factory.ts';
import{IMAGE_ORIGIN,IMAGE_PATH}from'../../chat-client/src/image-contract.ts';
/** Hosted ESM composition. Explicit OFF default; no ambient secret, database
 * credential or inspection operation. Only fixed image routes are normalized. */
export function createImageEdgeRuntime(input:Readonly<{enabled?:boolean;publishableKey:string;publicAnonKey?:string;origins?:readonly string[];fetch:typeof fetch;now:()=>number}>){
 const d=Object.freeze({...input}),schedule=(fn:()=>void,ms:number)=>{const t=setTimeout(fn,ms);return()=>clearTimeout(t);};
 const open=createImageRpcBackendFactory({...d,enabled:d.enabled===true,schedule,timeoutMs:8000});
 const handler=createImageTransferHandler({...d,enabled:d.enabled===true,open});
 return async(req:Request)=>{const u=new URL(req.url),prefix='/connect-image-transfer-v1/';
  if(u.pathname.startsWith(prefix)){const path=IMAGE_PATH+u.pathname.slice(prefix.length),init={method:req.method,headers:req.headers,signal:req.signal,...(!['GET','HEAD'].includes(req.method)?{body:req.body,duplex:'half'}:{})}as RequestInit;return handler(new Request(IMAGE_ORIGIN+path+u.search,init));}
  return handler(req);
 };
}
