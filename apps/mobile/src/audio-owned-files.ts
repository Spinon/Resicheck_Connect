// Only Expo57 Android-generated drafts in this app's private cache/Audio.
export const isOwnedAudioDraftName=(name:string)=>/^recording-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.m4a$/.test(name);
export function requireOwnedAudioUri(cache:string,uri:string){
  const root=cache.replace(/\/$/,'')+'/Audio/';
  if(!uri.startsWith(root)||!isOwnedAudioDraftName(uri.slice(root.length)))throw Error('Local audio unavailable');return uri;
}
