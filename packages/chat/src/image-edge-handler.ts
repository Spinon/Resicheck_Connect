import{createImageEdgeRuntime}from'./image-edge-runtime.ts';
import{IMAGE_ORIGIN}from'../../chat-client/src/image-contract.ts';
/** Runtime binding boundary only. No key lookup, session, network or privileges.
 * S3 needs the public legacy anon JWT, independently of the API publishable key.
 * The existing reader validates anon/project/expiry; malformed configuration
 * stays closed without killing the Edge worker before Deno.serve registers. */
export function createImageEdgeHandler(input:Readonly<{enabled:boolean;projectUrl:string|undefined;publishableKeys:string|undefined;publicS3AnonKey?:string;fetch:typeof fetch;now:()=>number;observe?:(code:'image-startup-configuration-unavailable')=>void}>){
 let runtime:ReturnType<typeof createImageEdgeRuntime>|null=null;
 try{
  if(input.projectUrl!==IMAGE_ORIGIN)throw Error('Image configuration unavailable');
  const keys=JSON.parse(input.publishableKeys??'{}');
  if(!keys||typeof keys!=='object'||Array.isArray(keys)||typeof keys.default!=='string')throw Error('Image configuration unavailable');
  runtime=createImageEdgeRuntime({enabled:input.enabled,publishableKey:keys.default,publicAnonKey:input.enabled?input.publicS3AnonKey:undefined,origins:['https://connect.resicheck.com.br'],fetch:input.fetch,now:input.now});
 }catch{try{input.observe?.('image-startup-configuration-unavailable');}catch{}}
 return async(req:Request):Promise<Response>=>{
  if(runtime)return runtime(req);
  return Response.json({status:'unavailable'},{status:503,headers:{'cache-control':'no-store','cdn-cache-control':'no-store','surrogate-control':'no-store','x-content-type-options':'nosniff'}});
 };
}
