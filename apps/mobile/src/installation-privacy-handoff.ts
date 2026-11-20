type Owner=Readonly<{close:()=>void}>;
// Separate bootstrap ownership. Runtime construction must clean its own partial
// resources if it throws; no native state or positive release is fabricated here.
export function createInstallationPrivacyHandoff<B extends Owner,R>(deps:Readonly<{createBootstrap:()=>B;createRuntime:(id:string)=>R}>){
 let closed=false,transferred=false,revision=0,owner:B|null=deps.createBootstrap();
 let view=Object.freeze({revision});const listeners=new Set<()=>void>();
 const publish=()=>{view=Object.freeze({revision:++revision});for(const fn of [...listeners])try{fn();}catch{}};
 return Object.freeze({currentBootstrap:()=>owner,snapshot:()=>view,subscribe:(fn:()=>void)=>{if(closed)return()=>{};listeners.add(fn);return()=>{listeners.delete(fn);};},
  transfer(id:string):R{
   if(closed||transferred)throw Error('Application unavailable');
   const prior=owner;owner=null;prior?.close();publish();
   try{const runtime=deps.createRuntime(id);transferred=true;return runtime;}
   catch{if(!closed){owner=deps.createBootstrap();publish();}throw Error('Application unavailable');}
  },
  close(){if(closed)return;closed=true;const prior=owner;owner=null;prior?.close();publish();listeners.clear();},
 });
}
