const origin='https://ibdlvlwdzmsrbqadrudb.supabase.co';
const uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const fail=()=>Error('Audio unavailable');
const readUrl=origin+'/functions/v1/connect-audio-transfer-v1/read';
export const isScopedAudioUrl=(url:string)=>url===readUrl||(url.startsWith(origin+'/storage/v1/object/connect-private-attachments/')||url.startsWith(origin+'/storage/v1/object/authenticated/connect-private-attachments/'))||['reserve_connect_audio_scoped_v1','confirm_connect_audio_scoped_v1','status_connect_audio_scoped_v1','resolve_connect_audio_storage_v1'].some(n=>url===origin+'/rest/v1/rpc/'+n);
/** Native admission only. Backend JWT/RLS checks remain authoritative. */
export function createScopedAudioFetch(nativeFetch:typeof fetch,key:string):typeof fetch{return(async(input,init)=>{
 if(typeof input!=='string'||!isScopedAudioUrl(input)||!init||!(init.signal instanceof AbortSignal)||init.signal.aborted||init.redirect!=='error'||init.credentials!=='omit'||init.cache!=='no-store'||init.referrerPolicy!=='no-referrer')throw fail();
 const h=new Headers(init.headers),rpc=input.includes('/rest/v1/rpc/'),read=input===readUrl,allowed=new Set(['apikey','authorization','accept',...(rpc?['content-type','accept-profile','content-profile']:read?['content-type','x-connect-company','x-connect-conversation','x-connect-attachment']:['content-type','x-upsert'])]);h.forEach((_,k)=>{if(!allowed.has(k))throw fail();});
 if(h.get('apikey')!==key||!/^Bearer [-A-Za-z0-9_.]{1,8192}$/.test(h.get('authorization')??'')||h.get('authorization')?.startsWith('Bearer sb_'))throw fail();
 if(read){if(init.method!=='POST'||init.body!==undefined||h.get('accept')!=='audio/mp4'||h.get('content-type')!=='application/json'||!uuid(h.get('x-connect-company'))||!uuid(h.get('x-connect-conversation'))||!uuid(h.get('x-connect-attachment')))throw fail();}
 else if(rpc){
  if(init.method!=='POST'||h.get('accept')!=='application/json'||h.get('content-type')!=='application/json'||h.get('accept-profile')!=='public'||h.get('content-profile')!=='public'||typeof init.body!=='string'||init.body.length>1024)throw fail();
  const p:unknown=JSON.parse(init.body);if(!p||typeof p!=='object'||Array.isArray(p))throw fail();const v=p as Record<string,unknown>;if(!uuid(v.p_company)||!uuid(v.p_conversation))throw fail();
  let canonical:Record<string,unknown>={p_company:v.p_company,p_conversation:v.p_conversation};
  if(input.endsWith('/reserve_connect_audio_scoped_v1')){if(typeof v.p_client!=='string'||!/^[-A-Za-z0-9_]{1,80}$/.test(v.p_client)||typeof v.p_digest!=='string'||!/^[a-f0-9]{64}$/.test(v.p_digest)||!Number.isSafeInteger(v.p_bytes)||(v.p_bytes as number)<16||(v.p_bytes as number)>1048576)throw fail();canonical={...canonical,p_client:v.p_client,p_digest:v.p_digest,p_bytes:v.p_bytes};}
  else if(input.endsWith('/status_connect_audio_scoped_v1')){if(typeof v.p_client!=='string'||!/^[-A-Za-z0-9_]{1,80}$/.test(v.p_client))throw fail();canonical={...canonical,p_client:v.p_client};}
  else{if(!uuid(v.p_attachment))throw fail();canonical={...canonical,p_attachment:v.p_attachment};}
  if(JSON.stringify(canonical)!==init.body)throw fail();
 }else{
  const objectPrefix=origin+'/storage/v1/object/'+(read?'authenticated/':'')+'connect-private-attachments/';if(!input.startsWith(objectPrefix))throw fail();const keyPath=input.slice(objectPrefix.length);if(!keyPath.startsWith('q/')||!uuid(keyPath.slice(2)))throw fail();
  if(read){if(h.get('accept')!=='audio/mp4'||init.body!==undefined)throw fail();}
  else if(init.method!=='POST'||h.get('accept')!=='application/json'||h.get('content-type')!=='audio/mp4'||h.get('x-upsert')!=='false'||!(init.body instanceof ArrayBuffer)||init.body.byteLength<16||init.body.byteLength>1048576)throw fail();
 }
 return nativeFetch(input,{...init,headers:h});
})as typeof fetch;}
