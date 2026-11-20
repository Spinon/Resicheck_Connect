import{createMembershipSecretLinkCodec}from '../../../packages/chat-client/src/membership-secret-link.ts';
/** Read once and immediately remove the secret-bearing fragment from the address.
 * Invoke only for the explicit code-selected candidate. Never log href/events. */
export function takeWebMembershipInvite(port:Readonly<{location:{href:string};history:{replaceState:(state:unknown,unused:string,url:string)=>void}}>,origin:string):string|null{
 let raw:string;try{raw=port.location.href;const u=new URL(raw);if(u.origin!==origin||!u.pathname.startsWith('/v1/membership-invites/'))return null;port.history.replaceState(null,'','/');}catch{return null;}
 try{createMembershipSecretLinkCodec({origin}).parse(raw);return raw;}catch{return null;}
}
export function bindNativeMembershipInviteLinks(port:Readonly<{getInitialURL:()=>Promise<string|null>;addEventListener:(event:'url',fn:(e:{url:string})=>void)=>{remove:()=>void}}>,origin:string,receive:(url:string)=>void){
 let closed=false;const codec=createMembershipSecretLinkCodec({origin});
 const accept=(url:unknown)=>{if(closed)return;try{codec.parse(url);}catch{return;}if(!closed)receive(String(url));};
 const stop=port.addEventListener('url',e=>accept(e.url));void port.getInitialURL().then(accept).catch(()=>{});
 return()=>{closed=true;try{stop.remove();}catch{}};
}
