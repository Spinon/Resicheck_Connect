// Process-local ownership protects a newly mounted recorder/store from cleanup
// queued by a previous instance. Only the caller's private cache is enumerated.
const live=new Set<string>();let preparing=0;
export function createAudioFileOwnership(){const mine=new Set<string>();return Object.freeze({
  claim:(key:string)=>{if(live.has(key)&&!mine.has(key))throw Error('Local audio unavailable');mine.add(key);live.add(key);},
  canRemove:(key:string)=>mine.has(key)||(!live.has(key)&&preparing===0),
  release:(key:string)=>{if(mine.delete(key))live.delete(key);},
  preparing:()=>{preparing++;let closed=false;return()=>{if(!closed){closed=true;preparing--;}};},
});}
