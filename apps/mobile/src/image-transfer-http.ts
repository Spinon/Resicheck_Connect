import{IMAGE_ORIGIN,IMAGE_PATH,IMAGE_MAX,imageIntent,imageCommit,imageMessage}from'../../../packages/chat-client/src/image-contract.ts';
const prefix=IMAGE_ORIGIN+IMAGE_PATH,fail=()=>Error('Image transfer unavailable');
export const isImageTransferUrl=(url:string)=>url.startsWith(prefix);
/** Client admission only; backend independently verifies Auth, session and membership.
 * Exact private protocol, no Storage URL/cookie/admin credential or arbitrary destination. */
export function createImageTransferFetch(nativeFetch:typeof fetch,key:string):typeof fetch{return(async(input,init)=>{
 if(typeof input!=='string'||!['upload','status','send','lookup','read'].some(k=>input===prefix+k)||!init||init.method!=='POST'||!(init.signal instanceof AbortSignal)||init.signal.aborted||init.redirect!=='error'||init.credentials!=='omit'||init.cache!=='no-store'||init.referrerPolicy!=='no-referrer')throw fail();
 const kind=input.slice(prefix.length),h=new Headers(init.headers),allowed=new Set(['apikey','authorization','content-type','accept',...(kind==='upload'?['x-connect-image-intent']:[])]);
 h.forEach((_,k)=>{if(!allowed.has(k))throw fail();});const bearer=h.get('authorization');
 if(h.get('apikey')!==key||!bearer||bearer.length>8200||!/^Bearer [-A-Za-z0-9_]+\.[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+$/.test(bearer)||h.get('content-type')!==(kind==='upload'?'application/octet-stream':'application/json')||h.get('accept')!==(kind==='read'?'image/png,image/jpeg':'application/json'))throw fail();
 let body:BodyInit;
 if(kind==='upload'){
  const metadata=h.get('x-connect-image-intent');if(!metadata||metadata.length>1024||!(init.body instanceof ArrayBuffer)||init.body.byteLength<1||init.body.byteLength>IMAGE_MAX)throw fail();
  const command=imageIntent(JSON.parse(metadata));if(command.byteLength!==init.body.byteLength)throw fail();h.set('x-connect-image-intent',JSON.stringify(command));body=init.body;
 }else{
  if(typeof init.body!=='string'||init.body.length>2048)throw fail();const raw=JSON.parse(init.body);
  body=JSON.stringify(kind==='status'?imageIntent(raw):kind==='read'?imageMessage(raw):imageCommit(raw));
 }
 return nativeFetch(input,{method:'POST',headers:h,body,signal:init.signal,redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
})as typeof fetch;}
