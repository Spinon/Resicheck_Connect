import{LOCAL_AUDIO_LIMITS,type LocalAudioPort,type LocalAudioView}from'./local-audio.ts';
import type{LocalAudioPermission}from'./audio-permission.ts';
export const WEB_AUDIO_MIME='audio/mp4;codecs=mp4a.40.2';
const unavailable=()=>Error('Web audio unavailable');
type Capture={epoch:number;recorder:MediaRecorder;stream:MediaStream;chunks:Blob[];bytes:number;overflow:boolean;failed:boolean;start:number;end:number|null;done:Promise<void>;resolve:()=>void;timer:ReturnType<typeof setTimeout>|null};
/** Private in-memory draft only. No upload, disk, cookie, URL input or saved clips. */
export function createWebLocalAudioPort({foreground,now=()=>performance.now()}:{foreground:()=>boolean;now?:()=>number}){
 let epoch=0,capture:Capture|null=null,clip:Readonly<{blob:Blob;durationMs:number}>|null=null,player:HTMLAudioElement|null=null,url:string|null=null,playFailed=false,permissionKnown=false,acquisition:Promise<MediaStream>|null=null;
 const active=()=>{try{return foreground()===true;}catch{return false;}};
 const stopTracks=(s:MediaStream)=>{for(const t of s.getTracks())t.stop();};
 const supported=()=>typeof window!=='undefined'&&window.isSecureContext&&!!navigator.mediaDevices?.getUserMedia&&typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported(WEB_AUDIO_MIME);
 function releasePlayer(){const p=player;player=null;playFailed=false;if(p){p.onended=null;p.onerror=null;p.pause();p.removeAttribute('src');p.load();}if(url){URL.revokeObjectURL(url);url=null;}}
 async function acquire(current:()=>boolean){
  if(!supported()||acquisition||!current()||!active())throw unavailable();const generation=epoch;let expired=false,timer:ReturnType<typeof setTimeout>|undefined;
  const pending=navigator.mediaDevices.getUserMedia({video:false,audio:{channelCount:{ideal:1,max:1},sampleRate:{ideal:44100},echoCancellation:true}});
  acquisition=pending;const owned=pending.then(stream=>{if(expired||generation!==epoch||!current()||!active()){stopTracks(stream);throw unavailable();}return stream;}).finally(()=>{if(acquisition===pending)acquisition=null;});
  try{return await Promise.race([owned,new Promise<never>((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(unavailable());},20000);})]);}finally{clearTimeout(timer);}
 }
 function stopCapture(c:Capture){if(c.timer){clearTimeout(c.timer);c.timer=null;}if(c.end===null)c.end=now();try{if(c.recorder.state!=='inactive')c.recorder.stop();}finally{stopTracks(c.stream);}}
 const elapsed=(c:Capture)=>Math.max(0,(c.end??now())-c.start);
 function sample(){if(playFailed||capture?.failed)throw unavailable();const c=capture;return{durationMs:c?elapsed(c):clip?.durationMs??0,bytes:c?.bytes??clip?.blob.size??0,positionMs:player?Math.max(0,Math.round(player.currentTime*1000)):0,playing:!!player&&!player.paused&&!player.ended,recording:!!c&&c.recorder.state==='recording'};}
 async function permission():Promise<LocalAudioPermission>{
  if(!supported()||!active())return false;
  const policy=(document as Document&{permissionsPolicy?:{allowsFeature:(name:string)=>boolean};featurePolicy?:{allowsFeature:(name:string)=>boolean}});if((policy.permissionsPolicy??policy.featurePolicy)?.allowsFeature('microphone')===false)return'blocked';
  let known:PermissionState|null=null;try{known=(await navigator.permissions.query({name:'microphone' as PermissionName})).state;}catch{}
  if(!active())return false;if(known==='denied'){permissionKnown=false;return'blocked';}if(known==='granted'||known===null&&permissionKnown)return true;
  try{const stream=await acquire(active);stopTracks(stream);if(!active())return false;permissionKnown=true;return'granted-now';}catch{return false;}
 }
 const port:LocalAudioPort={permission,
  async start(current){
   if(!current()||!active()||capture||clip)throw unavailable();const generation=epoch,stream=await acquire(current);if(!current()||!active()||generation!==epoch){stopTracks(stream);throw unavailable();}
   let recorder:MediaRecorder;try{recorder=new MediaRecorder(stream,{mimeType:WEB_AUDIO_MIME,audioBitsPerSecond:64000});}catch{stopTracks(stream);throw unavailable();}
   let resolve=()=>{};const done=new Promise<void>(r=>resolve=r);const c:Capture={epoch:generation,recorder,stream,chunks:[],bytes:0,overflow:false,failed:false,start:now(),end:null,done,resolve,timer:null};capture=c;
   recorder.ondataavailable=e=>{if(capture!==c||epoch!==generation||c.failed||c.overflow)return;if(e.data.size>LOCAL_AUDIO_LIMITS.bytes-c.bytes){c.overflow=true;c.bytes=LOCAL_AUDIO_LIMITS.bytes+1;c.chunks=[];stopCapture(c);return;}if(e.data.size){c.chunks.push(e.data);c.bytes+=e.data.size;}};
   recorder.onerror=()=>{c.failed=true;stopCapture(c);};
   recorder.onstop=()=>{stopTracks(stream);if(c.timer)clearTimeout(c.timer);if(c.end===null)c.end=now();if(capture===c&&epoch===generation&&!c.failed&&!c.overflow)clip=Object.freeze({blob:new Blob(c.chunks,{type:recorder.mimeType}),durationMs:elapsed(c)});c.chunks=[];c.resolve();};
   for(const t of stream.getTracks())t.addEventListener('ended',()=>{if(capture===c&&recorder.state==='recording'){c.failed=true;stopCapture(c);}},{once:true});
   try{recorder.start(250);c.timer=setTimeout(()=>stopCapture(c),LOCAL_AUDIO_LIMITS.durationMs);}catch{capture=null;stopTracks(stream);c.resolve();throw unavailable();}
  },
  async stop(){const c=capture;if(!c)throw unavailable();stopCapture(c);let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([c.done,new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(unavailable()),6000);})]);if(capture!==c||c.failed)throw unavailable();if(c.overflow)return sample();if(!clip||clip.blob.size<1)throw unavailable();capture=null;return sample();}finally{clearTimeout(timer);}},
  async play(finished,current){
   const held=clip;if(!held||!current()||!active())throw unavailable();if(!player){url=URL.createObjectURL(held.blob);player=new Audio(url);player.preload='auto';const own=player;own.onended=()=>{if(player===own&&clip===held&&current())finished();};own.onerror=()=>{if(player===own)playFailed=true;};}
   const own=player;if(own.ended)own.currentTime=0;let timer:ReturnType<typeof setTimeout>|undefined;try{await Promise.race([own.play(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(unavailable()),6000);})]);if(!current()||!active()||player!==own||clip!==held){own.pause();throw unavailable();}}finally{clearTimeout(timer);}
  },pause:async()=>{player?.pause();},rewind:async current=>{if(!current()||!active()||!clip)throw unavailable();if(player){player.pause();player.currentTime=0;}},sample,
  async reset(){epoch++;releasePlayer();clip=null;const c=capture;capture=null;if(c){c.chunks=[];stopCapture(c);}},
 };
 return Object.freeze({port,supported,createSource(snapshot:()=>LocalAudioView,current:()=>boolean){const original=snapshot(),held=clip;if(original.phase!=='ready'||!held||!current()||held.blob.size!==original.bytes)throw unavailable();return Object.freeze({durationMs:original.durationMs,async read(max:number,signal:AbortSignal){const valid=()=>!signal.aborted&&current()&&active()&&snapshot()===original&&clip===held;if(!Number.isSafeInteger(max)||max<held.blob.size||held.blob.size>LOCAL_AUDIO_LIMITS.bytes||!valid())throw unavailable();const bytes=new Uint8Array(await held.blob.arrayBuffer());if(!valid()||bytes.length!==original.bytes){bytes.fill(0);throw unavailable();}return bytes;}});}});
}
