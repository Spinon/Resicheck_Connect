/** Public diagnostic metadata only, AFTER GET /auth/v1/user accepted the same bearer.
 * Does not verify a signature or grant access; the existing transport performs Auth.
 * Never return the JWT, refresh token, user metadata or local sessionKey. */
export type VerifiedAuthSession=Readonly<{userId:string;sessionId:string;expiresAt:number}>;
export function authSessionMetadataAfterUserCheck(token:string,userId:string,origin:string,expiresAt:number,now:number):VerifiedAuthSession|null{
 try{
  const parts=token.split('.');if(parts.length!==3||parts[1].length>12000||!/^https:\/\/[a-z]{20}\.supabase\.co$/.test(origin))return null;
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_',input=parts[1];if(!/^[A-Za-z0-9_-]+$/.test(input))return null;
  const bytes=new Uint8Array(Math.floor(input.length*6/8));let bits=0,value=0,index=0;
  for(const c of input){value=(value<<6)|alphabet.indexOf(c);bits+=6;if(bits>=8){bits-=8;bytes[index++]=(value>>bits)&255;value&=(1<<bits)-1;}}
  const p=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));bytes.fill(0);
  const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
  if(!p||p.sub!==userId||!uuid(userId)||!uuid(p.session_id)||p.iss!==origin+'/auth/v1'||p.aud!=='authenticated'||p.role!=='authenticated'||!Number.isSafeInteger(p.exp)||!Number.isSafeInteger(expiresAt)||!Number.isSafeInteger(now))return null;
  const end=Math.min(expiresAt,p.exp*1000);if(end<=now||end-now>86400000)return null;
  return Object.freeze({userId,sessionId:p.session_id,expiresAt:end});
 }catch{return null;}
}
