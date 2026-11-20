export type NativeInstallationIdentityPort=Readonly<{getOrCreate:()=>Promise<Readonly<{projectRef:string;installationId:string}>>}>;
export type NativeInstallationIdentityResult=Readonly<{status:'ready';installationId:string}|{status:'unavailable'|'closed'}>;
type Status='idle'|'loading'|'ready'|'unavailable'|'closed';
const unavailable=()=>new Error('Installation unavailable');
export function isInstallationUuidV4(value:unknown):value is string{return typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);}

// Public installation routing identity only, never an auth/session credential or
// a proof of device ownership. No NativeModules/global bridge lookup or storage
// implementation here; native scope and persistence are separate native gates.
export function createNativeInstallationIdentity(options:Readonly<{native:NativeInstallationIdentityPort;projectRef:string}>){
  let getOrCreate:NativeInstallationIdentityPort['getOrCreate'],projectRef:string;
  try{
    const {native,projectRef:project}=options;const {getOrCreate:get}=native;
    if(typeof get!=='function'||typeof project!=='string'||!/^[a-z]{20}$/.test(project))throw unavailable();
    getOrCreate=()=>get.call(native);projectRef=project;
  }catch{throw unavailable();}
  let closed=false,version=0,cached:string|null=null,pending:Promise<NativeInstallationIdentityResult>|null=null;
  let interrupt:((result:NativeInstallationIdentityResult)=>void)|null=null;
  let view:Readonly<{status:Status}>=Object.freeze({status:'idle'});const listeners=new Set<()=>void>();
  function publish(status:Status){if(closed)return;view=Object.freeze({status});for(const fn of [...listeners])try{fn();}catch{}}
  function read():Promise<NativeInstallationIdentityResult>{
    if(closed)return Promise.resolve(Object.freeze({status:'closed'}));
    if(pending)return pending;
    if(cached!==null)return Promise.resolve(Object.freeze({status:'ready',installationId:cached}));
    const captured=version;
    // Assign before notifying observers, so a reentrant read coalesces too.
    const interruption=new Promise<NativeInstallationIdentityResult>(resolve=>{interrupt=resolve;});
    const operation=Promise.resolve().then(async():Promise<NativeInstallationIdentityResult>=>{
      if(closed||version!==captured)return Object.freeze({status:'closed'});
      try{
        const raw=await getOrCreate();if(closed||version!==captured)return Object.freeze({status:'closed'});
        if(!raw||typeof raw!=='object'||Array.isArray(raw))throw unavailable();
        const keys=Reflect.ownKeys(raw);if(keys.length!==2||!keys.every(key=>key==='projectRef'||key==='installationId'))throw unavailable();
        const {projectRef:project,installationId}=raw;
        if(project!==projectRef||!isInstallationUuidV4(installationId))throw unavailable();
        if(closed||version!==captured)return Object.freeze({status:'closed'});
        cached=installationId;publish('ready');
        if(closed||version!==captured)return Object.freeze({status:'closed'});
        return Object.freeze({status:'ready',installationId});
      }catch{
        if(closed||version!==captured)return Object.freeze({status:'closed'});
        publish('unavailable');return closed?Object.freeze({status:'closed'}):Object.freeze({status:'unavailable'});
      }
    });
    const work=Promise.race([operation,interruption]);pending=work;publish('loading');
    void work.finally(()=>{if(pending===work){pending=null;interrupt=null;}});return work;
  }
  return Object.freeze({read,snapshot:()=>view,subscribe:(fn:()=>void)=>{if(closed)return()=>{};listeners.add(fn);return()=>{listeners.delete(fn);};},
    close(){if(closed)return;closed=true;version++;cached=null;interrupt?.(Object.freeze({status:'closed'}));view=Object.freeze({status:'closed'});const old=[...listeners];listeners.clear();for(const fn of old)try{fn();}catch{}},
  });
}
