import{createAudioUploadCandidate,type AudioUploadPort,type AudioUploadCommand}from '../../../packages/chat-client/src/audio-upload.ts';
import type{LocalAudioView}from './local-audio.ts';
type Scope=Readonly<{token:object;companyId:string;conversationId:string;current:()=>boolean}>;
type Draft=Readonly<{snapshot:()=>LocalAudioView;subscribe:(fn:()=>void)=>()=>void}>;
type Source=Readonly<{durationMs:number;read:(max:number,signal:AbortSignal)=>Promise<Uint8Array>}>;
/** One explicitly reviewed clip, one captured conversation, candidate default OFF.
 * Scope must come from the authorized transport; opaque media ownership alone
 * must never be promoted to server authority. No URI or credential in snapshots. */
export function createReviewedAudioUpload(deps:Readonly<{enabled?:boolean;scope:Scope;draft:Draft;subscribeScope:(fn:()=>void)=>()=>void;createSource:(current:()=>boolean)=>Source;upload:AudioUploadPort;lookup:(command:AudioUploadCommand,signal:AbortSignal)=>Promise<unknown>;createId:()=>string;schedule:(fn:()=>void,ms:number)=>()=>void;timeoutMs:number}>){
 deps=Object.freeze({...deps,draft:Object.freeze({...deps.draft})});
 if(deps.enabled!==undefined&&typeof deps.enabled!=='boolean')throw Error('Audio review unavailable');
 const scope=Object.freeze({...deps.scope}),original=deps.enabled===true?deps.draft.snapshot():null;let closed=false,started=false,client:ReturnType<typeof createAudioUploadCandidate>|null=null;
 const listeners=new Set<()=>void>();let stopDraft=()=>{},stopScope=()=>{},stopClient=()=>{};
 const hidden=Object.freeze({phase:'closed' as const,attachmentId:null,notice:null}),off=Object.freeze({phase:'off' as const,attachmentId:null,notice:null}),review=Object.freeze({phase:'review' as const,attachmentId:null,notice:null});
 function live(){try{if(closed||deps.enabled!==true||original===null)return false;const valid=scope.current()===true&&deps.draft.snapshot()===original&&original.phase==='ready';return !closed&&valid;}catch{return false;}}
 const emit=()=>{for(const fn of [...listeners])try{fn();}catch{}};
 function close(){if(closed)return;closed=true;const stops=[stopDraft,stopScope,stopClient],previous=client;client=null;stopDraft=stopScope=stopClient=()=>{};for(const stop of stops)try{stop();}catch{}previous?.close();emit();}
 function ensure(){if(!live()){close();return false;}return true;}
 if(deps.enabled===true){
  if(!live())throw Error('Audio review unavailable');
  const source=deps.createSource(live);if(!live())throw Error('Audio review unavailable');
  client=createAudioUploadCandidate({scope:{companyId:scope.companyId,conversationId:scope.conversationId,current:live},source:{durationMs:source.durationMs,read:async(max,signal)=>{if(!live())throw Error('Audio review unavailable');const bytes=await source.read(max,signal);if(!live()){bytes.fill(0);throw Error('Audio review unavailable');}return bytes;}},upload:deps.upload,lookup:deps.lookup,idFactory:deps.createId,schedule:deps.schedule,timeoutMs:deps.timeoutMs});
  stopClient=client.subscribe(()=>{if(ensure())emit();});
  const changed=()=>{if(!live())close();};
  const draftStop=deps.draft.subscribe(changed);if(closed)draftStop();else stopDraft=draftStop;
  if(!closed){const scopeStop=deps.subscribeScope(changed);if(closed)scopeStop();else stopScope=scopeStop;}
  if(!live())close();
 }
 return Object.freeze({
  snapshot:()=>deps.enabled!==true?off:ensure()?started?client!.snapshot():review:hidden,
  subscribe:(fn:()=>void)=>{if(closed)return()=>{};listeners.add(fn);return()=>{listeners.delete(fn);};},
  start:async()=>{if(!ensure()||started||!client)return;const target=client;started=true;emit();if(ensure()&&client===target)await target.start();},
  recover:async()=>{if(ensure()&&started&&client)await client.recover();},
  close,
 });
}
