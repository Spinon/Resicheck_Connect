type Proof=Readonly<{viewportTop:number;viewportHeight:number;tailBottom:number}>|Readonly<{empty:true;viewportWidth:number;viewportHeight:number}>;
/** Native geometry only authorizes a read refresh, never a read receipt. */
export function createQuietLatestRefresh(deps:Readonly<{emptyWindow?:boolean;allowVisibleTail?:boolean;current:()=>boolean;measure:(done:(proof:Proof|null)=>void)=>void;refresh:()=>unknown;fallback:()=>void;schedule:(fn:()=>void,ms:number)=>()=>void}>){
 if(deps.allowVisibleTail!==undefined&&typeof deps.allowVisibleTail!=='boolean')throw Error('Refresh unavailable');
 if(deps.emptyWindow!==undefined&&typeof deps.emptyWindow!=='boolean')throw Error('Refresh unavailable');
 let stopped=false,consumed=false,cancel:(()=>void)|null=null;
 const live=()=>{try{return !stopped&&!consumed&&deps.current()===true;}catch{return false;}};
 const fallback=()=>{if(stopped||consumed)return;consumed=true;cancel?.();deps.fallback();};
 let returned=false;cancel=deps.schedule(()=>{if(!returned){stopped=true;return;}if(!live()){fallback();return;}cancel=deps.schedule(fallback,1000);
  try{deps.measure(proof=>{
   if(!live()){fallback();return;}
   const validProof=proof&&(deps.emptyWindow===true?'empty'in proof&&proof.empty===true&&[proof.viewportWidth,proof.viewportHeight].every(Number.isFinite)&&proof.viewportWidth>0&&proof.viewportHeight>0:!('empty'in proof)&&[proof.viewportTop,proof.viewportHeight,proof.tailBottom].every(Number.isFinite)&&proof.viewportHeight>0&&proof.tailBottom>=proof.viewportTop&&(Math.abs(proof.tailBottom-(proof.viewportTop+proof.viewportHeight))<=8||deps.allowVisibleTail===true&&proof.tailBottom<=proof.viewportTop+proof.viewportHeight));
   if(!validProof){fallback();return;}
   consumed=true;cancel?.();try{void Promise.resolve(deps.refresh()).then(ok=>{if(!stopped&&ok!==true)deps.fallback();},()=>{if(!stopped)deps.fallback();});}catch{deps.fallback();}
  });}catch{fallback();}
 },700);returned=true;if(stopped)cancel?.();
 return Object.freeze({dispose(){stopped=true;cancel?.();cancel=null;}});
}

/** A foreground/focus cycle cannot reuse geometry measured in an earlier epoch. */
export function createAttentionEpoch(initialActive:boolean){
 let active=initialActive,focused=true,token=Object.freeze({active:initialActive});
 return Object.freeze({
  snapshot:()=>token,
  current:(captured:object)=>captured===token&&active&&focused,
  change(nextActive:boolean,nextFocused:boolean){
   if(active===nextActive&&focused===nextFocused)return false;
   active=nextActive;focused=nextFocused;token=Object.freeze({active:active&&focused});return true;
  },
 });
}
