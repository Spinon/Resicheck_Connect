import{createHash}from 'node:crypto';
type Command=Readonly<{companyId:string;conversationId:string;attachmentId:string}>;
type Descriptor=Command&Readonly<{objectKey:string;sha256:string;byteLength:number}>;
type Ports=Readonly<{resolve:(credential:string,command:Command)=>Promise<Descriptor>;readPrivate:(descriptor:Descriptor,maxBytes:number)=>Promise<Uint8Array>}>;
const fail=()=>Error('Audio unavailable'),uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
/** Unmounted server core. resolve must freshly authorize JWT/session and current conversation access. */
export function createAudioPrivateRead(input:Ports){const p=Object.freeze({...input});return async(credential:string,command:Command)=>{
 let bytes:Uint8Array|null=null;
 try{if(typeof credential!=='string'||credential.length<1||credential.length>8192||!command||Object.keys(command).sort().join(',')!=='attachmentId,companyId,conversationId'||![command.companyId,command.conversationId,command.attachmentId].every(uuid))throw fail();const c=Object.freeze({...command}),d=Object.freeze({...await p.resolve(credential,c)});
 const valid=(v:Descriptor)=>v.companyId===c.companyId&&v.conversationId===c.conversationId&&v.attachmentId===c.attachmentId&&/^q\/[a-f0-9-]{36}$/.test(v.objectKey)&&Number.isSafeInteger(v.byteLength)&&v.byteLength>=1&&v.byteLength<=1048576&&/^[a-f0-9]{64}$/.test(v.sha256);
 if(!valid(d))throw fail();bytes=await p.readPrivate(d,d.byteLength);if(!(bytes instanceof Uint8Array)||bytes.length!==d.byteLength||createHash('sha256').update(bytes).digest('hex')!==d.sha256)throw fail();const fresh=await p.resolve(credential,c);if(!valid(fresh)||fresh.objectKey!==d.objectKey||fresh.sha256!==d.sha256||fresh.byteLength!==d.byteLength)throw fail();return bytes;
 }catch{bytes?.fill(0);throw fail();}
 };}
