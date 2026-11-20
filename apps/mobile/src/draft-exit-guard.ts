type DraftHost=Readonly<{snapshot:()=>Readonly<{status:string;draft:string;sending:boolean;pending:readonly unknown[]}>;subscribe:(fn:()=>void)=>()=>void}>;
export type DraftExitPrompt=Readonly<{cancel:()=>boolean;discard:()=>boolean;save?:()=>boolean}>;
type Owner=Readonly<{owner:object;host:DraftHost}>;
/** Memory-only back intent. Never intercepts forced privacy/session retirement. */
export function createDraftExitGuard(deps:Readonly<{current:()=>Owner|null;subscribe:(fn:()=>void)=>()=>void;save?:(host:DraftHost)=>boolean}>){
 type Intent=Owner&Readonly<{draft:string;back:()=>boolean|void;view:DraftExitPrompt}>;
 let pending:Intent|null=null,closed=false,revision=0,stopHost=()=>{};const listeners=new Set<()=>void>();
 const emit=()=>{for(const fn of [...listeners])try{fn();}catch{}};
 function same(intent:Owner&{draft:string}){try{const now=deps.current(),v=intent.host.snapshot();return !closed&&now?.owner===intent.owner&&now.host===intent.host&&v.status==='active'&&!v.sending&&v.pending.length===0&&v.draft===intent.draft;}catch{return false;}}
 function clear(expected:Intent|null){if(pending!==expected)return revision;pending=null;const ticket=++revision;const stop=stopHost;stopHost=()=>{};stop();emit();return ticket;}
 function reconcile(){if(pending&&!same(pending))clear(pending);}
 const stopSource=deps.subscribe(reconcile);
 return Object.freeze({
  snapshot:():DraftExitPrompt|null=>pending&&same(pending)?pending.view:null,
  subscribe:(fn:()=>void)=>{if(closed)return()=>{};listeners.add(fn);return()=>{listeners.delete(fn);};},
  request(back:()=>boolean|void):boolean{
   if(closed||typeof back!=='function')return false;reconcile();
   if(pending){clear(pending);return true;}
   let owner:Owner|null=null,draft='';try{owner=deps.current();if(owner){const v=owner.host.snapshot();if(v.status==='active'&&!v.sending&&v.pending.length===0)draft=v.draft;}}catch{owner=null;}
   if(!owner||draft===''){try{return back()!==false;}catch{return false;}}
   const captured=owner,original=draft;let intent:Intent;
   const save=deps.save?()=>{if(pending!==intent||!same(intent))return false;
    try{if(!deps.save!(intent.host)||!same(intent))return false;}catch{return false;}
    const ticket=clear(intent);if(closed||revision!==ticket||pending!==null||!same(intent))return false;
    try{return back()!==false;}catch{return false;}
   }:undefined;
   const view=Object.freeze({...(save?{save}:{}),cancel:()=>{if(pending!==intent)return false;clear(intent);return true;},discard:()=>{
    if(pending!==intent||!same(intent)){if(pending===intent)clear(intent);return false;}
    const ticket=clear(intent);if(closed||revision!==ticket||pending!==null||!same(intent))return false;
    try{return back()!==false;}catch{return false;}
   }});
   intent={...captured,draft:original,back,view};pending=intent;revision++;
   stopHost=captured.host.subscribe(reconcile);if(!same(intent)){clear(intent);return true;}emit();return true;
  },
  dispose(){if(closed)return;closed=true;stopSource();const stop=stopHost;stopHost=()=>{};stop();pending=null;revision++;listeners.clear();},
 });
}
