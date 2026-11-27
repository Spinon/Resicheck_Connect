import type{ImageDescriptor}from'../../../packages/chat-client/src/image-contract.ts';
import {createRecordConversationCache} from './record-conversation-cache.ts';
import type {CacheRecordStore} from './cache-record-store.ts';
import type {RecentHistoryPage} from '../../../packages/chat-client/src/recent-history-read.ts';
import type {AudioTransferRead} from '../../../packages/chat-client/src/audio-transfer.ts';
export type PrivateCacheStore=Readonly<{read:()=>Promise<string|null>;write:(value:string|null)=>Promise<void>;records?:CacheRecordStore}>;
export type CacheScope=Readonly<{userId:string;companyId:string;conversationId:string}>;
type Page={key:string;at:number;page:RecentHistoryPage};type Clip={key:string;at:number;hex:string};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const TTL=24*60*60*1000,TEXT_MAX=1024*1024,AUDIO_MAX=2*1024*1024,VAULT_MAX=6*1024*1024;
const scopeKey=(s:CacheScope)=>{if(![s.userId,s.companyId,s.conversationId].every(x=>UUID.test(x)))throw Error('Cache unavailable');return [s.userId,s.companyId,s.conversationId].join('/');};
const clipKey=(s:CacheScope,c:AudioTransferRead)=>{if(s.companyId!==c.companyId||s.conversationId!==c.conversationId||!UUID.test(c.attachmentId)||!/^[a-f0-9]{64}$/.test(c.sha256)||!Number.isSafeInteger(c.byteLength)||c.byteLength<1||c.byteLength>1048576)throw Error('Cache unavailable');return scopeKey(s)+'/'+c.attachmentId+'/'+c.sha256+'/'+c.byteLength;};
/** Disposable received data only. Never stores drafts, outgoing intents, tokens or authority.
 * Callers must obtain live conversation authorization before reading a cached page/clip. */
export function createConversationCache(store:PrivateCacheStore,now:()=>number=Date.now){
 if(store.records)return createRecordConversationCache(store,now);
 let user:string|null=null,version=0,loaded=false,automatic=false,pages:Page[]=[],clips:Clip[]=[],failed=false,queue=Promise.resolve(),ready=Promise.resolve();
 const listeners=new Set<()=>void>();let view:Readonly<{bytes:number;messageBytes:number;audioBytes:number;imageBytes:number;images:number;conversations:number;audios:number;automatic:boolean;ready:boolean;failed:boolean;revision:number;limitMb:number;limitBytes:number;availableBytes:number|null;segmented:boolean}>=Object.freeze({bytes:0,messageBytes:0,audioBytes:0,imageBytes:0,images:0,conversations:0,audios:0,automatic:false,ready:false,failed:false,revision:0,limitMb:3,limitBytes:3*1048576,availableBytes:null,segmented:false});
 const fresh=(at:number)=>Number.isSafeInteger(at)&&at<=now()&&now()-at<TTL;
 function trim(){pages=pages.filter(x=>fresh(x.at));clips=clips.filter(x=>fresh(x.at));while(pages.length>20||JSON.stringify(pages).length*2>TEXT_MAX)pages.shift();while(clips.reduce((n,x)=>n+x.hex.length/2,0)>AUDIO_MAX)clips.shift();}
 function emit(){trim();const messageBytes=pages.length?new TextEncoder().encode(JSON.stringify(pages)).length:0,audioBytes=clips.reduce((n,x)=>n+x.hex.length/2,0);view=Object.freeze({bytes:messageBytes+audioBytes,messageBytes,audioBytes,imageBytes:0,images:0,conversations:pages.length,audios:clips.length,automatic,ready:loaded,failed,revision:view.revision+1,limitMb:3,limitBytes:3*1048576,availableBytes:null,segmented:false});for(const f of [...listeners])try{f();}catch{}}
 function persist(clear=false){const epoch=version;const job=queue.then(async()=>{if(epoch!==version)return;try{const value=clear?null:JSON.stringify({v:1,user,automatic,pages,clips});if(value&&value.length>VAULT_MAX)throw Error();await store.write(value);failed=false;}catch{failed=true;throw Error('Cache unavailable');}finally{if(epoch===version)emit();}});queue=job.catch(()=>{});return job;}
 async function bind(subject:string){if(!UUID.test(subject))throw Error('Cache unavailable');if(user===subject){await ready;return;}const epoch=++version;user=subject;loaded=false;pages=[];clips=[];automatic=false;emit();ready=(async()=>{await queue;try{const raw=await store.read();if(epoch!==version)return;if(raw&&raw.length<=VAULT_MAX){const v=JSON.parse(raw);if(v?.v===1&&v.user===subject&&typeof v.automatic==='boolean'&&Array.isArray(v.pages)&&v.pages.length<=20&&Array.isArray(v.clips)&&v.clips.length<=128){automatic=v.automatic;pages=v.pages.filter((p:Page)=>p&&typeof p.key==='string'&&p.key.startsWith(subject+'/')&&fresh(p.at)&&p.page&&Array.isArray(p.page.items)&&p.page.items.length<=10000&&typeof p.page.hasOlder==='boolean');clips=v.clips.filter((c:Clip)=>c&&typeof c.key==='string'&&c.key.startsWith(subject+'/')&&fresh(c.at)&&typeof c.hex==='string'&&c.hex.length<=2097152&&/^(?:[a-f0-9]{2})+$/.test(c.hex));}else await store.write(null);}else if(raw)await store.write(null);failed=false;}catch{if(epoch===version)failed=true;}finally{if(epoch===version){loaded=true;emit();}}})();await ready;}
 const current=(s:CacheScope)=>user===s.userId&&loaded;
 return Object.freeze({bind,setLimitMb:async(_v:number)=>false,flush:()=>queue,snapshot:()=>view,subscribe:(f:()=>void)=>{listeners.add(f);return()=>{listeners.delete(f);};},
  ticket:()=>version,
  async page(s:CacheScope){await ready;if(!current(s))return null;trim();const p=pages.find(x=>x.key===scopeKey(s));return p?JSON.parse(JSON.stringify(p.page)) as RecentHistoryPage:null;},
  putPage(s:CacheScope,page:RecentHistoryPage,ticket:number,_removed?:boolean){if(ticket!==version||!current(s)||page.items.length>10000)return;const key=scopeKey(s);const prior=pages.find(x=>x.key===key);const retained=new Set(page.items.map(x=>x.id));if(prior?.page.items.some(x=>!retained.has(x.id)))clips=clips.filter(x=>!x.key.startsWith(key+'/'));pages=pages.filter(x=>x.key!==key);pages.push({key,at:now(),page:JSON.parse(JSON.stringify(page))});emit();void persist().catch(()=>{});},
  async audio(s:CacheScope,c:AudioTransferRead){await ready;if(!current(s))return null;trim();const x=clips.find(v=>v.key===clipKey(s,c));if(!x||x.hex.length!==c.byteLength*2)return null;const b=new Uint8Array(c.byteLength);for(let i=0;i<b.length;i++)b[i]=parseInt(x.hex.slice(i*2,i*2+2),16);return b;},
  async hasImage(_s:CacheScope,_messageId:string){return false;},
  async image(_s:CacheScope,_messageId:string):Promise<{descriptor:ImageDescriptor;bytes:Uint8Array}|null>{return null;},putImage(_s:CacheScope,_d:ImageDescriptor,_b:Uint8Array,_t:number){},purgeImage(_s:CacheScope,_id:string){},
  putAudio(s:CacheScope,c:AudioTransferRead,b:Uint8Array,ticket:number){if(ticket!==version||!current(s)||b.length!==c.byteLength)return;const key=clipKey(s,c);clips=clips.filter(x=>x.key!==key);clips.push({key,at:now(),hex:Array.from(b,n=>n.toString(16).padStart(2,'0')).join('')});emit();void persist().catch(()=>{});},
  drop(s:CacheScope){if(user!==s.userId)return;const prefix=scopeKey(s);version++;pages=pages.filter(x=>x.key!==prefix);clips=clips.filter(x=>!x.key.startsWith(prefix+'/'));emit();void persist().catch(()=>{});},
  async purgeAudio(s:CacheScope){await ready;if(!current(s))throw Error('Cache unavailable');const prefix=scopeKey(s)+'/';version++;clips=clips.filter(x=>!x.key.startsWith(prefix));emit();await persist();},
  async setAutomatic(value:boolean){if(!loaded||!user)return false;automatic=value;emit();try{await persist();return true;}catch{return false;}},
  async clear(){version++;loaded=user!==null;pages=[];clips=[];emit();try{await persist();return true;}catch{return false;}},
  retire(){version++;user=null;loaded=false;pages=[];clips=[];listeners.clear();emit();},
  async logout(){version++;user=null;loaded=false;automatic=false;pages=[];clips=[];emit();try{await persist(true);return true;}catch{return false;}},
 });
}
export type ConversationCache=ReturnType<typeof createConversationCache>;
