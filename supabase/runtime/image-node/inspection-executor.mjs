import {createHash} from 'node:crypto';
import {createAudioJwtVerifier} from '../../../packages/chat/src/audio-jwt-verifier.ts';
import {signS3Get} from '../audio-node/sigv4-get.mjs';

const ref='ibdlvlwdzmsrbqadrudb', origin='https://'+ref+'.supabase.co';
const storage='https://'+ref+'.storage.supabase.co', MAX=4194304;
const uuid=v=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join(',')===[...keys].sort().join(',');
const sha=b=>createHash('sha256').update(b).digest('hex');
const fail=()=>Error('Image inspection unavailable');
const leaseKeys=['attachmentId','leaseId','validUntil','companyId','conversationId','objectKey','sha256','byteLength','decoderImage'];
const audioImage='sha256:3dc14e011cfe0101b12731fc7a06a969325256bcd2796605e0d0e70cf6a65c28';

/** Single-task server coordinator, OFF by default. No login, credential storage,
 * service, daemon access or message publication. inspect is a trusted bounded
 * helper capability supplied by the owner, never a result supplied by a client.
 * An uncertain finish can only replay its exact proof/session before expiry. */
export function createImageInspectionExecutor(input) {
 const d=Object.freeze({...input});
 let busy=false, closed=false, activeController=null, pending=null, pendingTimer=null, blockedUntil=0;
 function clearPending(){clearTimeout(pendingTimer);pendingTimer=null;pending=null;}
 function validConfig() {
  if(d.allowedCompanyIds!==undefined&&(!Array.isArray(d.allowedCompanyIds)||d.allowedCompanyIds.length===0||d.allowedCompanyIds.length>256||!d.allowedCompanyIds.every(uuid)||new Set(d.allowedCompanyIds).size!==d.allowedCompanyIds.length))throw fail();
  if(closed||d.enabled!==true||d.expectedSessionId!==undefined&&!uuid(d.expectedSessionId)||!uuid(d.inspectorId)||!/^sha256:[a-f0-9]{64}$/.test(d.decoderImage??'')||d.decoderImage===audioImage||
    !/^[-a-z0-9]+$/.test(d.region??'')||typeof d.inspect!=='function'||typeof d.fetch!=='function'||typeof d.now!=='function')throw fail();
  const t=d.publicAnonKey;
  if(typeof t!=='string'||t.length>8192||!/^[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+\.[-A-Za-z0-9_]+$/.test(t))throw fail();
  const c=JSON.parse(Buffer.from(t.split('.')[1],'base64url'));
  if(c.role!=='anon'||c.ref!==ref||!Number.isSafeInteger(c.exp)||c.exp*1000<=d.now())throw fail();
  return c.exp*1000;
 }
 async function operation(token,signal,work,until=Infinity) {
  const anonUntil=validConfig(),start=d.now(),ac=new AbortController();
  if(!Number.isSafeInteger(start)||start<0||signal.aborted)throw fail();
  const deadline=Math.min(start+30000,until,anonUntil);
  if(deadline<=start)throw fail();
  activeController=ac;
  const abort=()=>ac.abort();signal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(abort,deadline-start);
  const live=()=>{const t=d.now();if(signal.aborted||ac.signal.aborted||!Number.isSafeInteger(t)||t<start||t>=deadline)throw fail();};
  try {
   const verify=createAudioJwtVerifier({enabled:true,publishableKey:d.publishableKey,fetch:d.fetch,now:d.now,timeoutMs:Math.min(10000,deadline-start)});
   const claims=await verify(token);live();
   if(claims.sub!==d.inspectorId||d.expectedSessionId!==undefined&&claims.session_id!==d.expectedSessionId||claims.exp*1000<=d.now())throw fail();
   const current=()=>{live();if(claims.exp*1000<=d.now())throw fail();};
   async function read(url,options,max,json=false) {
    let r,reader,arena=Buffer.alloc(max);const cancel=()=>{reader?.cancel().catch(()=>{});};
    ac.signal.addEventListener('abort',cancel,{once:true});
    try {
     current();r=await d.fetch(url,{...options,signal:ac.signal,redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});current();
     if(r.status!==200||r.redirected||r.url&&r.url!==url||!r.body||json&&!/^application\/json(?:;|$)/i.test(r.headers.get('content-type')??''))throw fail();
     const length=r.headers.get('content-length');
     if(length!==null&&(!/^[0-9]+$/.test(length)||Number(length)>max||!json&&Number(length)!==max))throw fail();
     reader=r.body.getReader();let n=0;
     for(;;){const p=await reader.read();current();if(p.done)break;if(!(p.value instanceof Uint8Array)||p.value.length>max-n)throw fail();arena.set(p.value,n);n+=p.value.length;}
     if(!json&&n!==max)throw fail();
     return json?JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(arena.subarray(0,n))):Buffer.from(arena.subarray(0,n));
    } finally {
     arena.fill(0);ac.signal.removeEventListener('abort',cancel);
     try{await reader?.cancel();reader?.releaseLock();if(!reader)await r?.body?.cancel();}catch{}
    }
   }
   const rpc=(name,body,dispatch)=>read(origin+'/rest/v1/rpc/'+name,{
    method:'POST',headers:{apikey:d.publishableKey,Authorization:'Bearer '+token,'Content-Type':'application/json',Accept:'application/json'},
    body:(current(),dispatch?.(),JSON.stringify(body))
   },16384,true);
   return await work({claims,current,rpc,read,signal:ac.signal});
  } catch {throw fail();}
  finally {clearTimeout(timer);signal.removeEventListener('abort',abort);ac.abort();if(activeController===ac)activeController=null;}
 }
 function decodeLease(v,attachmentId,companyId) {
  const until=Date.parse(v?.validUntil);
  if(!exact(v,leaseKeys)||v.attachmentId!==attachmentId||v.companyId!==companyId||!uuid(v.leaseId)||!uuid(v.conversationId)||
    !/^q\/[a-f0-9-]{36}$/.test(v.objectKey)||!uuid(v.objectKey.slice(2))||!/^[a-f0-9]{64}$/.test(v.sha256)||
    !Number.isSafeInteger(v.byteLength)||v.byteLength<16||v.byteLength>MAX||v.decoderImage!==d.decoderImage||
    !Number.isSafeInteger(until)||until<=d.now()||until>d.now()+31000)throw fail();
  return Object.freeze({...v,until});
 }
 function finishResult(v) {
  if(!exact(v,['state'])||!['ready','rejected'].includes(v.state))throw fail();
  return Object.freeze({state:v.state,attachmentId:pending.attachmentId,leaseId:pending.leaseId});
 }
 async function inspectTask({token,attachmentId,companyId,queue=false,signal=new AbortController().signal}) {
   if(closed)return Object.freeze({state:'unavailable',stage:'closed'});
   if(busy)throw fail();busy=true;let bytes=null,stage='auth',claimed=null;
   try {
    validConfig();
    if((!queue&&!uuid(attachmentId))||!(queue&&d.allowedCompanyIds!==undefined)&&!uuid(companyId)||d.now()<blockedUntil)throw fail();
    clearPending();
    return await operation(token,signal,async op=>{
     stage='claim';
     const lease=await op.rpc('claim_connect_image_inspection_v1',{p_attachment:queue?null:attachmentId},()=>{blockedUntil=d.now()+30000;});
     if(queue&&lease===null){blockedUntil=0;return Object.freeze({state:'idle'});}
     if(queue){if(!uuid(lease?.attachmentId))throw fail();attachmentId=lease.attachmentId;
      if(d.allowedCompanyIds!==undefined){if(!d.allowedCompanyIds.includes(lease.companyId))throw fail();companyId=lease.companyId;}}
     claimed=decodeLease(lease,attachmentId,companyId);
     blockedUntil=claimed.until;
     const live=()=>{op.current();if(d.now()>=claimed.until)throw fail();};
     stage='read';live();
     const path='/storage/v1/s3/connect-private-images/'+claimed.objectKey,stamp=new Date(d.now()).toISOString().replace(/[:-]|\.\d{3}/g,'');
     const signed=signS3Get({host:ref+'.storage.supabase.co',path,region:d.region,accessKey:ref,secret:d.publicAnonKey,stamp,headers:{'x-amz-security-token':token}});
     const {host:_,...headers}=signed.headers;
     bytes=await op.read(storage+path,{method:'GET',headers},claimed.byteLength);
     live();if(sha(bytes)!==claimed.sha256)throw fail();
     // Revalidate current session/author/lease after IO, before passing bytes to the codec.
     const fresh=decodeLease(await op.rpc('claim_connect_image_inspection_v1',{p_attachment:attachmentId}),attachmentId,companyId);
     if(leaseKeys.some(k=>fresh[k]!==claimed[k]))throw fail();
     live();stage='codec';
     const issued=d.now();
     const permit=Object.freeze({purpose:'image-inspection-lease-v1',attachmentId,leaseId:claimed.leaseId,companyId,
      inspectorId:op.claims.sub,sessionId:op.claims.session_id,sha256:claimed.sha256,byteLength:claimed.byteLength,decoderImage:claimed.decoderImage,
      issuedAt:new Date(issued).toISOString(),expiresAt:new Date(Math.min(claimed.until,issued+30000)).toISOString()});
     const proof=await d.inspect(bytes,Object.freeze({signal:op.signal,permit}));live();
     if(sha(bytes)!==claimed.sha256||!proof||typeof proof.accepted!=='boolean')throw fail();
     if(proof.accepted&&(!['image/png','image/jpeg'].includes(proof.mime)||proof.sha256!==claimed.sha256||proof.byteLength!==claimed.byteLength||
       !Number.isSafeInteger(proof.width)||!Number.isSafeInteger(proof.height)||proof.width<1||proof.height<1||
       proof.width>16384||proof.height>16384||proof.width*proof.height>16000000))throw fail();
     stage='finish';
     pending={token,sessionId:op.claims.session_id,attachmentId,leaseId:claimed.leaseId,until:claimed.until,dispatched:false,
      body:Object.freeze({p_attachment:attachmentId,p_lease:claimed.leaseId,p_digest:claimed.sha256,p_bytes:claimed.byteLength,p_pass:proof.accepted,
       p_type:proof.accepted?proof.mime:null,p_width:proof.accepted?proof.width:null,p_height:proof.accepted?proof.height:null,p_decoder:d.decoderImage})};
     const exactPending=pending;pendingTimer=setTimeout(()=>{if(pending===exactPending)clearPending();},Math.max(1,pending.until-d.now()));pendingTimer.unref?.();
     const result=finishResult(await op.rpc('finish_connect_image_inspection_v1',pending.body,()=>{pending.dispatched=true;}));
     clearPending();blockedUntil=0;return result;
    });
   } catch {
    if(pending?.dispatched&&d.now()<pending.until)return Object.freeze({state:'finish-unconfirmed',attachmentId:pending.attachmentId,leaseId:pending.leaseId});
    clearPending();return Object.freeze({state:'unavailable',stage});
   } finally {bytes?.fill(0);busy=false;}
 }
 return Object.freeze({
  inspectAttachment: command=>inspectTask(command),
  inspectNext: ({token,companyId,signal}={})=>inspectTask({token,companyId,signal,queue:true}),
  async reconcile({signal=new AbortController().signal}={}) {
   if(closed)return Object.freeze({state:'unavailable'});
   if(busy)throw fail();busy=true;
   try {
    if(!pending?.dispatched||d.now()>=pending.until)throw fail();
    const p=pending;
    return await operation(p.token,signal,async op=>{
     if(op.claims.session_id!==p.sessionId)throw fail();
     const r=finishResult(await op.rpc('finish_connect_image_inspection_v1',p.body));
     clearPending();blockedUntil=0;return r;
    },p.until);
   } catch {
    if(pending&&d.now()>=pending.until)clearPending();
    return Object.freeze({state:'finish-unconfirmed'});
   } finally {busy=false;}
  },
  close(){if(closed)return;closed=true;clearPending();activeController?.abort();}
 });
}
