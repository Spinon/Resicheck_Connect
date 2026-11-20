import{safelyMeasureView}from './safe-view-measurement.ts';
type Geometry=Readonly<{top:number;height:number;viewportTop:number;viewportHeight:number;focused:boolean;uncovered:boolean}>;
/** Candidate protocol. Native scroll/layout/focus/overlay changes must invalidate it. */
export function createMessageVisibilityProof(deps:Readonly<{current:()=>object|null;now:()=>number;dwellMs?:number}>){
 const dwell=deps.dwellMs??1000;if(!Number.isSafeInteger(dwell)||dwell<1000||dwell>10000)throw Error('Invalid visibility dwell');
 let generation=0,last=-1,disposed=false;
 const time=()=>{let n:number;try{n=deps.now();}catch{generation++;return null;}if(!Number.isSafeInteger(n)||n<0||n<last){generation++;return null;}last=n;return n;};
 const complete=(g:Geometry)=>g.focused&&g.uncovered&&[g.top,g.height,g.viewportTop,g.viewportHeight].every(Number.isFinite)&&g.height>0&&g.viewportHeight>0&&g.top>=g.viewportTop&&g.top+g.height<=g.viewportTop+g.viewportHeight;
 type Ticket=Readonly<{owner:object;generation:number;at:number;messageId:string}>;
 const owned=new WeakSet<object>();
 return Object.freeze({
  begin(messageId:string,g:Geometry):Ticket|null{if(disposed||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(messageId)||!complete(g))return null;let owner:object|null;try{owner=deps.current();}catch{return null;}const at=time();if(!owner||at===null)return null;const ticket=Object.freeze({owner,generation,at,messageId});owned.add(ticket);return ticket;},
  confirm(ticket:Ticket,g:Geometry):string|null{if(disposed||!ticket||!owned.has(ticket))return null;owned.delete(ticket);const now=time();if(now===null||ticket.owner!==(()=>{try{return deps.current();}catch{return null;}})()||ticket.generation!==generation||now-ticket.at<dwell||!complete(g))return null;return ticket.messageId;},
  invalidate(){generation++;},dispose(){disposed=true;generation++;},
 });
}

type Measurable={measureInWindow:(done:(x:number,y:number,width:number,height:number)=>void)=>void};
export type MessageVisibilityObserver=Readonly<{attach:(id:string,node:Measurable|null)=>void;setCandidates?:(ids:readonly string[])=>void;invalidate:()=>void;setActive:(active:boolean)=>void;dispose:()=>void}>;
/** Candidate UI collector only. No RPC, storage, counters or automatic retries. */
export function createMessageVisibilityObserver(deps:Readonly<{enabled:boolean;current:()=>object|null;allowed:()=>boolean;viewport:()=>Measurable|null;now:()=>number;schedule:(fn:()=>void,ms:number)=>()=>void;seen:(ids:readonly string[])=>boolean|void}>):MessageVisibilityObserver{
 const nodes=new Map<string,Measurable>(),confirmed=new Set<string>();
 const currentOwner=()=>{try{return deps.current();}catch{return null;}};const rootOwner=currentOwner();
 let candidates:readonly string[]|null=null;let active=false,disposed=false,epoch=0,cancel:(()=>void)|null=null;
 const proof=createMessageVisibilityProof({current:deps.current,now:deps.now});
 const live=(generation:number,owner:object|null)=>{try{return !disposed&&deps.enabled&&active&&generation===epoch&&owner!==null&&owner===rootOwner&&currentOwner()===owner&&deps.allowed();}catch{return false;}};
 function clear(){epoch++;cancel?.();cancel=null;proof.invalidate();}
 function invalidate(){clear();if(!disposed&&deps.enabled&&active)cancel=deps.schedule(scan,300);}
 function scan(){
  cancel=null;const generation=epoch,owner=currentOwner();if(!live(generation,owner))return;
  // Bound native measurements, not the first IDs retained in a full history.
  // Viewability is a candidate hint only: exact geometry/dwell still prove read.
  const selected=candidates??[...nodes.keys()].slice(-64);
  const entries=selected.flatMap(id=>{const node=nodes.get(id);return node&&!confirmed.has(id)?[[id,node]as const]:[];});
  const tickets=new Map<string,NonNullable<ReturnType<typeof proof.begin>>>();
  const measure=(id:string,node:Measurable,done:(geometry:Geometry)=>void)=>{
   let viewport:Measurable|null=null;try{viewport=deps.viewport();}catch{return;}if(!viewport)return;
   const current=()=>live(generation,owner)&&nodes.get(id)===node&&deps.viewport()===viewport;
   safelyMeasureView(viewport,current,(_x,top,width,height)=>{
    if(width<=0)return;
    safelyMeasureView(node,current,(_nx,y,w,h)=>{if(w>0)done({top:y,height:h,viewportTop:top,viewportHeight:height,focused:true,uncovered:true});});
   });
  };
  for(const [id,node]of entries)measure(id,node,g=>{const ticket=proof.begin(id,g);if(ticket)tickets.set(id,ticket);});
  cancel=deps.schedule(()=>{
   cancel=null;if(!live(generation,owner))return;
   const seen:string[]=[];let remaining=entries.length,closed=false;
   const deliver=()=>{if(closed)return;closed=true;cancel?.();cancel=null;if(live(generation,owner)&&seen.length){try{if(deps.seen(Object.freeze([...seen]))!==false)for(const id of seen)confirmed.add(id);}catch{/* Queue did not accept; retain eligibility for a later observation. */}}};
   const finish=()=>{if(--remaining===0)deliver();};
   // Each callback is optional; use a bounded settlement instead of waiting forever.
   for(const [id,node]of entries){const ticket=tickets.get(id);if(!ticket){finish();continue;}measure(id,node,g=>{if(closed)return;const accepted=proof.confirm(ticket,g);if(accepted&&seen.length<25)seen.push(accepted);finish();});}
   if(remaining>0)cancel=deps.schedule(deliver,250);
  },1100);
 }
 return Object.freeze({
  attach(id,node){if(disposed||!deps.enabled)return;if(node){if(nodes.get(id)===node)return;if(nodes.size>=10000&&!nodes.has(id))return;nodes.set(id,node);}else nodes.delete(id);invalidate();},
  setCandidates(ids){if(disposed||!deps.enabled)return;const next=Object.freeze([...new Set(ids.filter(id=>typeof id==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)))].slice(0,64));if(candidates&&next.length===candidates.length&&next.every((id,i)=>candidates![i]===id))return;candidates=next;invalidate();},
  invalidate,setActive(next){if(active===next)return;active=next;invalidate();},
  dispose(){disposed=true;active=false;clear();nodes.clear();confirmed.clear();candidates=null;proof.dispose();},
 });
}
