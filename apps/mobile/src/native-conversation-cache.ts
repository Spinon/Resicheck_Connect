import type {PrivateCacheStore} from './conversation-cache.ts';
import type {CacheRecordChange,CacheRecordState,CacheRecordStore}from'./cache-record-store.ts';
let lane:Promise<unknown>=Promise.resolve(),owner=0;
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function encode(b:Uint8Array){const parts:string[]=[];let chunk='';for(let i=0;i<b.length;i+=3){const a=b[i],c=b[i+1],d=b[i+2];chunk+=alphabet[a>>2]+alphabet[(a&3)<<4|(c??0)>>4]+(i+1<b.length?alphabet[(c&15)<<2|(d??0)>>6]:'=')+(i+2<b.length?alphabet[d&63]:'=');if(chunk.length>=16384){parts.push(chunk);chunk='';}}if(chunk)parts.push(chunk);return parts.join('');}
function decode(s:string){const pad=s.endsWith('==')?2:s.endsWith('=')?1:0;if(s.length%4||s.length>22369624||/[^A-Za-z0-9+/=]/.test(s)||s.slice(0,s.length-pad).includes('='))throw Error('Cache unavailable');const out=new Uint8Array(s.length/4*3-pad);let j=0;for(let i=0;i<s.length;i+=4){const n=alphabet.indexOf(s[i])<<18|alphabet.indexOf(s[i+1])<<12|(alphabet.indexOf(s[i+2])&63)<<6|(alphabet.indexOf(s[i+3])&63);if(j<out.length)out[j++]=n>>16;if(j<out.length)out[j++]=n>>8;if(j<out.length)out[j++]=n;}return out;}
export function nativeConversationCache(raw:unknown):PrivateCacheStore {
 const p=raw as {read?:()=>Promise<string|null>;write?:(v:string|null)=>Promise<void>;recordsOpen?:(u:string)=>Promise<string>;recordsGet?:(u:string,g:string,k:string)=>Promise<string|null>;recordsApply?:(u:string,g:string,c:string)=>Promise<string>};
 if(typeof p?.read!=='function'||typeof p?.write!=='function')throw Error('Cache unavailable');const mine=++owner;
 const run=<T>(work:()=>Promise<T>)=>{const job=lane.then(()=>{if(owner!==mine)throw Error('Cache unavailable');return work();});lane=job.catch(()=>{});return job;};
 const records:CacheRecordStore|undefined=[p.recordsOpen,p.recordsGet,p.recordsApply].every(x=>typeof x==='function')?{open:u=>run(async()=>JSON.parse(await p.recordsOpen!(u))as CacheRecordState),get:(u,g,k)=>run(async()=>{const b=await p.recordsGet!(u,g,k);return b===null?null:decode(b);}),apply:(u,g,c)=>run(async()=>{const {put,...change}=c;return JSON.parse(await p.recordsApply!(u,g,JSON.stringify({...change,...(put?{put:{key:put.key,kind:put.kind,base64:encode(put.bytes)}}:{})})))as CacheRecordState;})}:undefined;
 return{read:()=>run(()=>p.read!()),write:v=>run(()=>p.write!(v)),...(records?{records}:{})};
}
