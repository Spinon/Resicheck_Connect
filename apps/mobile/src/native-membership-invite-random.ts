/** Adapter only; the bridge uses Android SecureRandom. Missing bridge fails closed. */
export function nativeMembershipInviteRandom(raw:unknown):(bytes:Uint8Array)=>Promise<void>{
 return async bytes=>{
  if(bytes.length!==32||!raw||typeof raw!=='object')throw Error('Invitation unavailable');
  const method=(raw as {randomInviteBytes?:()=>Promise<unknown>}).randomInviteBytes;
  if(typeof method!=='function')throw Error('Invitation unavailable');
  const value=await method.call(raw);
  if(typeof value!=='string'||!/^[0-9a-f]{64}$/.test(value))throw Error('Invitation unavailable');
  for(let i=0;i<32;i++)bytes[i]=Number.parseInt(value.slice(i*2,i*2+2),16);
 };
}
