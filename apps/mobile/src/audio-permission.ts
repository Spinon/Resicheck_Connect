export type LocalAudioPermission=boolean|'granted-now'|'blocked';
type Permission=Readonly<{granted:boolean;canAskAgain:boolean}>;
/** No prompt unless the platform still permits asking. No Settings or recording. */
export async function localAudioPermission(port:Readonly<{current:()=>Promise<Permission>;request:()=>Promise<Permission>;foreground:()=>boolean}>):Promise<LocalAudioPermission>{
 const known=await port.current();if(!port.foreground())return false;
 if(known.granted)return true;if(!known.canAskAgain)return 'blocked';
 const answer=await port.request();if(!port.foreground())return false;
 return answer.granted?'granted-now':answer.canAskAgain?false:'blocked';
}
