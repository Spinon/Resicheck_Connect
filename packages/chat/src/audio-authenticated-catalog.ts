// Server-only candidate. Factory must verify JWT/session and bind SQL claims to this actor.
type Scope=Readonly<{companyId:string;conversationId:string}>;
type Owner=Scope&Readonly<{userId:string;clientUploadId:string}>;
type Command=Readonly<{name:'audio_catalog_reserve'|'audio_catalog_find_own'|'audio_catalog_resolve_read'|'audio_catalog_authorize'|'audio_catalog_resolve_upload'|'audio_catalog_record_uploaded'|'audio_catalog_finish_inspection';params:Readonly<Record<string,string|number|boolean|null>>}>;
export type VerifiedAudioSqlSession=Readonly<{userId:string;current:()=>boolean;call:(command:Command)=>Promise<unknown>;close:()=>void}>;
const fail=()=>Error('Audio unavailable'),uuid=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(v);
export async function bindAuthenticatedAudioCatalog(deps:Readonly<{enabled?:boolean;credential:string;scope:Scope;verify:(credential:string)=>Promise<VerifiedAudioSqlSession>}>){
 const scope=Object.freeze({...deps.scope});if(!uuid(scope.companyId)||!uuid(scope.conversationId))throw fail();let lease:VerifiedAudioSqlSession|null=null,closed=false;
 if(deps.enabled===true){try{lease=await deps.verify(deps.credential);if(!uuid(lease.userId)||!lease.current())throw fail();}catch{lease?.close();throw fail();}}
 const session=lease,actor=session?.userId;
 const live=()=>{try{return !closed&&!!session&&session.userId===actor&&session.current();}catch{return false;}};
 const close=()=>{if(closed)return;closed=true;session?.close();};
 function context(v:Scope){if(!live()||v.companyId!==scope.companyId||v.conversationId!==scope.conversationId)throw fail();}
 function owner(v:Owner){context(v);if(v.userId!==actor||!/^[-A-Za-z0-9_]{1,80}$/.test(v.clientUploadId))throw fail();}
 async function call(name:Command['name'],params:Record<string,string|number|boolean|null>){try{if(!live())throw fail();const result=await session!.call(Object.freeze({name,params:Object.freeze({...params})}));if(!live())throw fail();return result;}catch{if(!live())close();throw fail();}}
 return Object.freeze({userId:actor??null,current:live,
  authorize:()=>call('audio_catalog_authorize',{p_company:scope.companyId,p_conversation:scope.conversationId}),
  resolveUpload:async(v:Scope&Readonly<{attachmentId:string}>)=>{context(v);if(!uuid(v.attachmentId))throw fail();return call('audio_catalog_resolve_upload',{p_company:scope.companyId,p_conversation:scope.conversationId,p_attachment:v.attachmentId});},
  recordUploaded:async(v:Scope&Readonly<{attachmentId:string}>,bytes:Uint8Array)=>{context(v);if(!uuid(v.attachmentId)||!(bytes instanceof Uint8Array)||bytes.length<1||bytes.length>1048576)throw fail();return call('audio_catalog_record_uploaded',{p_company:scope.companyId,p_conversation:scope.conversationId,p_attachment:v.attachmentId,p_content:'\\x'+Buffer.from(bytes).toString('hex')});},
  finishInspection:async(v:Scope&Readonly<{attachmentId:string}>,inspection:Readonly<{sha256:string;accepted:boolean;mime:string|null;durationMs:number|null;version:string}>)=>{context(v);if(!uuid(v.attachmentId)||!/^[a-f0-9]{64}$/.test(inspection.sha256)||typeof inspection.accepted!=='boolean'||!/^[A-Za-z0-9_.-]{1,64}$/.test(inspection.version))throw fail();return call('audio_catalog_finish_inspection',{p_company:scope.companyId,p_conversation:scope.conversationId,p_attachment:v.attachmentId,p_digest:inspection.sha256,p_pass:inspection.accepted,p_type:inspection.mime,p_duration:inspection.durationMs,p_version:inspection.version});},
  reserve:async(o:Owner,digest:string,size:number)=>{owner(o);if(!/^[a-f0-9]{64}$/.test(digest)||!Number.isSafeInteger(size)||size<1||size>1048576)throw fail();return call('audio_catalog_reserve',{p_company:scope.companyId,p_conversation:scope.conversationId,p_client:o.clientUploadId,p_digest:digest,p_size:size});},
  findOwn:async(o:Owner)=>{owner(o);return call('audio_catalog_find_own',{p_company:scope.companyId,p_conversation:scope.conversationId,p_client:o.clientUploadId});},
  resolveRead:async(v:Scope&Readonly<{attachmentId:string}>)=>{context(v);if(!uuid(v.attachmentId))throw fail();return call('audio_catalog_resolve_read',{p_company:scope.companyId,p_conversation:scope.conversationId,p_attachment:v.attachmentId});},close,
 });
}
