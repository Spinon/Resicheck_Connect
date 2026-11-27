export type CacheRecordMeta=Readonly<{key:string;kind:'page'|'audio'|'image';bytes:number;at:number}>;
export type CacheRecordState=Readonly<{generation:string;automatic:boolean;limitMb:number;limitBytes:number;availableBytes:number|null;migrated:boolean;records:readonly CacheRecordMeta[]}>;
export type CacheRecordChange=Readonly<{put?:Readonly<{key:string;kind:'page'|'audio'|'image';bytes:Uint8Array}>;removePrefix?:string;clear?:boolean;logout?:boolean;automatic?:boolean;limitMb?:number;migrated?:boolean}>;
export type CacheRecordStore=Readonly<{open:(user:string)=>Promise<CacheRecordState>;get:(user:string,generation:string,key:string)=>Promise<Uint8Array|null>;apply:(user:string,generation:string,change:CacheRecordChange)=>Promise<CacheRecordState>}>;
export const CACHE_DEFAULT_MB=100,CACHE_LIMITS_MB=[64,100,256,1024] as const,CACHE_RECORD_MAX=16*1024*1024;
export const cacheUser=(s:string)=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(s);
export const cacheRecordKey=(s:string)=>/^[pai]\/[a-f0-9/-]{1,230}$/.test(s)&&!s.includes('..');
export function validRecordState(s:CacheRecordState){return cacheUser(s.generation)&&typeof s.automatic==='boolean'&&CACHE_LIMITS_MB.includes(s.limitMb as 64|100|256|1024)&&Number.isSafeInteger(s.limitBytes)&&s.limitBytes>=0&&s.limitBytes<=s.limitMb*1048576&&Array.isArray(s.records)&&s.records.length<=10000&&s.records.every(x=>cacheRecordKey(x.key)&&['page','audio','image'].includes(x.kind)&&Number.isSafeInteger(x.bytes)&&x.bytes>0&&x.bytes<=CACHE_RECORD_MAX&&Number.isSafeInteger(x.at));}
/** LRU is storage accounting, never authorization. Backend commit must fence generation atomically. */
export function planRecordChange(old:CacheRecordState,c:CacheRecordChange,now:number,available:number|null,reserve=32*1048576){
 if(!validRecordState(old)||c.limitMb!==undefined&&!CACHE_LIMITS_MB.includes(c.limitMb as 64|100|256|1024)||c.automatic!==undefined&&typeof c.automatic!=='boolean')throw Error('Cache unavailable');
 let rows=[...old.records],removed:string[]=[],limitMb=c.limitMb??old.limitMb;
 if(c.clear||c.logout){removed=rows.map(x=>x.key);rows=[];}
 if(c.removePrefix){if(!cacheRecordKey(c.removePrefix))throw Error('Cache unavailable');removed.push(...rows.filter(x=>x.key.startsWith(c.removePrefix!)).map(x=>x.key));rows=rows.filter(x=>!x.key.startsWith(c.removePrefix!));}
 if(c.put){const p=c.put;if(!cacheRecordKey(p.key)||!['page','audio','image'].includes(p.kind)||!(p.bytes instanceof Uint8Array)||p.bytes.length<1||p.bytes.length>CACHE_RECORD_MAX)throw Error('Cache unavailable');rows=rows.filter(x=>x.key!==p.key);rows.push({key:p.key,kind:p.kind,bytes:p.bytes.length,at:now});}
 const used=old.records.reduce((n,x)=>n+x.bytes,0),limitBytes=Math.min(limitMb*1048576,available===null?limitMb*1048576:Math.max(0,used+available-reserve));rows.sort((a,b)=>a.at-b.at||a.key.localeCompare(b.key));let total=rows.reduce((n,x)=>n+x.bytes,0);while(rows.length&&(total>limitBytes||rows.length>10000)){const r=rows.shift()!;total-=r.bytes;removed.push(r.key);}
 return{state:{...old,automatic:c.logout?false:c.automatic??old.automatic,limitMb:c.logout?CACHE_DEFAULT_MB:limitMb,limitBytes,availableBytes:available,migrated:c.clear||c.logout?true:c.migrated??old.migrated,records:rows},removed};
}
