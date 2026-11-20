/** Optional QA observation only. No identifiers, bodies or object capabilities. */
const events=['anchor','gate','arm','cancel','frame-scheduled','frame-skipped','frame-start','tail-ref','viewport-measured','tail-measured','plan','command','scroll','viewport-layout','content-layout','geometry'] as const;
const reasons=['missing-scroll','missing-anchor','effect','cleanup','drag','momentum','external','frame-pending','not-current','invalid-size','missing-tail','stale','zero-size'] as const;
const decisions=['idle','wait','settled','end','scroll'] as const;
const scrolls=['inactive','stationary','command','external'] as const;
type Event=typeof events[number];
type Reason=typeof reasons[number];
type Fields={reason?:Reason;decision?:typeof decisions[number];scroll?:typeof scrolls[number];
  anchor?:boolean;delta?:number;attempt?:number;offset?:number;targetOffset?:number;contentHeight?:number;viewportTop?:number;width?:number;height?:number;targetTop?:number;targetWidth?:number;targetHeight?:number;
  rows?:number;pending?:number;provisional?:number;
  ready?:boolean;active?:boolean;busy?:boolean;sending?:boolean;older?:boolean;owner?:boolean;ticket?:boolean;tail?:boolean;sameRows?:boolean;resetBudget?:boolean;allowed?:boolean;oversized?:boolean;attached?:boolean};
export type RecentScrollObservation=Readonly<{event:Event}&Fields>;
export type RecentScrollObserver=(event:RecentScrollObservation)=>void;
export type RecentScrollTraceEntry=Readonly<RecentScrollObservation&{sequence:number}>;
const numeric=['delta','attempt','offset','targetOffset','contentHeight','viewportTop','width','height','targetTop','targetWidth','targetHeight','rows','pending','provisional'];
const boolean=['anchor','ready','active','busy','sending','older','owner','ticket','tail','sameRows','resetBudget','allowed','oversized','attached'];
const enums:Record<string,readonly string[]>={event:events,reason:reasons,decision:decisions,scroll:scrolls};
const allowed=new Set([...numeric,...boolean,...Object.keys(enums)]);

/** Defensive sink: reject unknown fields rather than copying arbitrary errors.
 * Memory and entry size are bounded, with no automatic output or persistence. */
export function createRecentScrollTraceBuffer({limit=256}:{limit?:number}={}){
  if(!Number.isInteger(limit)||limit<1||limit>2048)throw Error('Observation unavailable');
  let sequence=0;const entries:RecentScrollTraceEntry[]=[];
  function record(input:RecentScrollObservation):void{
    try{
      if(!input||typeof input!=='object'||Array.isArray(input))return;
      const keys=Reflect.ownKeys(input);if(keys.length>allowed.size||keys.some(key=>typeof key!=='string'||!allowed.has(key)))return;
      const out:Record<string,unknown>={};
      for(const key of keys as string[]){
        const value=(input as unknown as Record<string,unknown>)[key]; // snapshot each getter once
        if(key in enums){if(typeof value!=='string'||!enums[key].includes(value))return;}
        else if(boolean.includes(key)){if(typeof value!=='boolean')return;}
        else if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e8)return;
        if(['rows','pending','provisional'].includes(key)&&(typeof value!=='number'||!Number.isInteger(value)||value<0))return;
        out[key]=value;
      }
      if(!Object.hasOwn(out,'event'))return;
      entries.push(Object.freeze({...out,sequence:++sequence}) as RecentScrollTraceEntry);
      if(entries.length>limit)entries.shift();
    }catch{/* Observation failure never escapes into the UI. */}
  }
  return Object.freeze({record,snapshot:():readonly RecentScrollTraceEntry[]=>Object.freeze([...entries]),
    stats:()=>Object.freeze({recorded:sequence,droppedCount:Math.max(0,sequence-entries.length)})});
}
