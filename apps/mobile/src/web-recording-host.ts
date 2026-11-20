import{createWebLocalAudioPort}from'./web-local-audio.ts';import{createScopedRecordingHost}from'./scoped-recording-host.ts';
/** Recording/review reuse the conversation owner. Sending stays a separate transport capability. */
export function createWebRecordingHost(d:Omit<Parameters<typeof createScopedRecordingHost>[0],'createPort'|'createFiles'|'createSource'>){
 const web=createWebLocalAudioPort({foreground:d.foreground});
 const host=createScopedRecordingHost({...d,createPort:()=>web.port,createFiles:()=>({save:async()=>{throw Error('Saved web audio unavailable');},play:async()=>{throw Error('Saved web audio unavailable');},remove:async()=>{},purge:async()=>{},pause:web.port.pause}),createSource:web.createSource});
 const token=()=>{try{return d.recent.captureMediaScope()?.token??null;}catch{return null;}};let owner=token();const stop=d.recent.subscribe(()=>{const next=token();if(next!==owner){owner=next;void web.port.reset();}});
 return Object.freeze({...host,supported:web.supported,foregroundChanged(){if(!d.foreground())void web.port.reset();host.foregroundChanged();},dispose(){stop();void web.port.reset();host.dispose();}});
}
