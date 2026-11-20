import{AUDIO_TRANSFER_ORIGIN}from '../../../packages/chat-client/src/audio-transfer.ts';
const prefix=AUDIO_TRANSFER_ORIGIN+'/functions/v1/connect-audio-transfer-v1/';
const fail=()=>Error('Audio transfer unavailable'),uuid=(v:string|null)=>v!==null&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
/** Candidate admission only. No endpoint is deployed; backend must authorize independently. */
export function createAudioTransferFetch(nativeFetch:typeof fetch,key:string):typeof fetch{return(async(input,init)=>{
 if(typeof input!=='string'||!['upload','lookup','read'].some(k=>input===prefix+k)||!init||init.method!=='POST'||!(init.signal instanceof AbortSignal)||init.signal.aborted||init.redirect!=='error'||init.credentials!=='omit'||init.cache!=='no-store'||init.referrerPolicy!=='no-referrer')throw fail();
 const kind=input.slice(prefix.length),h=new Headers(init.headers),allowed=new Set(['apikey','authorization','content-type','accept','x-connect-company','x-connect-conversation',...(kind==='read'?['x-connect-attachment']:['x-connect-intent']),...(kind==='upload'?['x-connect-content-sha256']:[])]);
 h.forEach((_,k)=>{if(!allowed.has(k))throw fail();});const bearer=h.get('authorization');if(h.get('apikey')!==key||!bearer||!/^Bearer [-A-Za-z0-9_.]{1,8192}$/.test(bearer)||bearer.startsWith('Bearer sb_')||!uuid(h.get('x-connect-company'))||!uuid(h.get('x-connect-conversation'))||h.get('content-type')!==(kind==='upload'?'application/octet-stream':'application/json')||h.get('accept')!==(kind==='read'?'audio/mp4':'application/json'))throw fail();
 if(kind==='read'?!uuid(h.get('x-connect-attachment')):!/^[-A-Za-z0-9_]{1,80}$/.test(h.get('x-connect-intent')??''))throw fail();
 let body:ArrayBuffer|undefined;if(kind==='upload'){if(!(init.body instanceof ArrayBuffer)||init.body.byteLength<1||init.body.byteLength>1048576||!/^[a-f0-9]{64}$/.test(h.get('x-connect-content-sha256')??''))throw fail();body=init.body;}else if(init.body!==undefined)throw fail();
 return nativeFetch(input,{method:'POST',headers:h,body,signal:init.signal,redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
 })as typeof fetch;}
