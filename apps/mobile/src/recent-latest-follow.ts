export type LatestBubbleGeometry=Readonly<{viewportTop:number;viewportHeight:number;targetTop:number;targetHeight:number;offset:number;contentHeight:number}>;
type Decision=Readonly<{kind:'idle'|'wait'|'settled'}|{kind:'end'}|{kind:'scroll';offset:number;oversized:boolean}>;
// Full bubble when it fits; otherwise align its end and let the user drag to
// read the beginning. No percentage visibility or assumptions about row height.
export function latestBubbleAdjustment(g:LatestBubbleGeometry):Decision{
  const {viewportTop,viewportHeight,targetTop,targetHeight,offset,contentHeight}=g;
  if(![viewportTop,viewportHeight,targetTop,targetHeight,offset,contentHeight].every(Number.isFinite)||viewportHeight<=0||targetHeight<=0||contentHeight<0||offset<0)return{kind:'wait'};
  const bottom=viewportTop+viewportHeight,targetBottom=targetTop+targetHeight,oversized=targetHeight>viewportHeight;
  const delta=oversized?targetBottom-bottom:targetTop<viewportTop?targetTop-viewportTop:targetBottom>bottom?targetBottom-bottom:0;
  if(delta===0)return{kind:'settled'};
  const next=Math.max(0,Math.min(Math.max(0,contentHeight-viewportHeight),offset+delta));
  return next===offset?{kind:'wait'}:{kind:'scroll',offset:next,oversized};
}
// A completed latest page keeps following geometry changes until manual drag,
// an older window or owner retirement. Settled never disables future resizes.
export function createRecentLatestFollow(current:()=>boolean,maxCorrections=4){
  if(!Number.isInteger(maxCorrections)||maxCorrections<1||maxCorrections>16)throw Error('Scroll unavailable');
  let owner:object|null=null,revision=0,remaining=maxCorrections;
  const live=()=>{try{return owner!==null&&current()===true;}catch{return false;}};
  type Ticket=Readonly<{owner:object;revision:number}>;
  return Object.freeze({
    arm(){owner={};revision++;remaining=maxCorrections;},cancel(){owner=null;revision++;},
    geometry(resetBudget=true){if(!live())return;revision++;if(resetBudget)remaining=maxCorrections;},
    capture:():Ticket|null=>live()?Object.freeze({owner:owner!,revision}):null,
    plan(ticket:Ticket,geometry:LatestBubbleGeometry|null):Decision{
      if(!live()||ticket.owner!==owner||ticket.revision!==revision)return{kind:'idle'};
      const decision=geometry?latestBubbleAdjustment(geometry):{kind:'end' as const};
      if(decision.kind==='scroll'||decision.kind==='end'){if(remaining===0)return{kind:'idle'};remaining--;}
      return decision;
    },
  });
}
