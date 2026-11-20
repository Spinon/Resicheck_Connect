import type{VerifiedAudioClaims}from'./audio-jwt-verifier.ts';import type{AudioPgPool,AudioPgClient}from'./audio-sql-executor.ts';
import{IMAGE_MAX,imageUuid,imageId,imageFailure}from'../../chat-client/src/image-contract.ts';
const fields=Object.freeze({
 image_catalog_authorize:['p_company:uuid','p_conversation:uuid'],
 image_reserve:['p_company:uuid','p_conversation:uuid','p_client:text','p_digest:text','p_bytes:integer','p_mode:text','p_type:text','p_profile:text'],
 image_catalog_status:['p_company:uuid','p_conversation:uuid','p_client:text','p_digest:text','p_bytes:integer','p_mode:text','p_type:text','p_profile:text'],
 image_catalog_resolve_upload:['p_company:uuid','p_conversation:uuid','p_attachment:uuid'],
 image_catalog_record_uploaded:['p_company:uuid','p_conversation:uuid','p_attachment:uuid','p_content:bytea'],
 image_message_send:['p_company:uuid','p_conversation:uuid','p_client:text','p_attachment:uuid'],
 image_message_lookup:['p_company:uuid','p_conversation:uuid','p_client:text','p_attachment:uuid'],
 image_catalog_resolve_read:['p_company:uuid','p_conversation:uuid','p_message:uuid']
});
export {fields as IMAGE_COMMAND_FIELDS};
export type ImageSqlCommand=Readonly<{name:keyof typeof fields;params:Readonly<Record<string,unknown>>}>;
export type VerifiedImageSqlSession=Readonly<{userId:string;sessionId:string;current:()=>boolean;call:(command:ImageSqlCommand,signal:AbortSignal)=>Promise<unknown>;close:()=>void}>;
/** Concrete pg transaction adapter, not a provisioner. Fixed isolated backend
 * role and fixed SQL layouts; never admits inspection, grants or arbitrary SQL.
 * verifyJwt must use the Auth server verifier, not locally parsed claims alone. */
export function createImageSqlVerifier(input:Readonly<{enabled?:boolean;verifyJwt:(token:string)=>Promise<VerifiedAudioClaims>;pool:AudioPgPool;now:()=>number}>){
 const d=Object.freeze({...input});return async(token:string):Promise<VerifiedImageSqlSession>=>{
  if(d.enabled!==true)throw imageFailure();const claims=Object.freeze({...await d.verifyJwt(token)}),initial=d.now(),deadline=Math.min(claims.exp*1000,initial+30000);
  if(!imageUuid(claims.sub)||!imageUuid(claims.session_id)||claims.role!=='authenticated'||claims.aud!=='authenticated'||claims.iss!=='https://ibdlvlwdzmsrbqadrudb.supabase.co/auth/v1'||!Number.isSafeInteger(claims.exp)||!Number.isSafeInteger(initial)||initial<0||deadline<=initial)throw imageFailure();
  let closed=false,busy=false;const current=()=>{try{const t=d.now();return !closed&&Number.isSafeInteger(t)&&t>=initial&&t<deadline;}catch{return false;}};
  return Object.freeze({userId:claims.sub,sessionId:claims.session_id,current,close(){closed=true;},
   async call(command:ImageSqlCommand,signal:AbortSignal){
    if(!current()||signal.aborted||busy||!command||!Object.hasOwn(fields,command.name))throw imageFailure();
    const name=command.name,layout=fields[name],keys=layout.map(x=>x.split(':')[0]),params=Object.freeze({...command.params});let content:Buffer|null=null;
    if(Object.keys(params).sort().join(',')!==[...keys].sort().join(','))throw imageFailure();
    for(const key of keys){const value=params[key];
     if(['p_company','p_conversation','p_attachment','p_message'].includes(key)){if(!imageUuid(value))throw imageFailure();}
     else if(key==='p_client'){if(!imageId(value))throw imageFailure();}
     else if(key==='p_digest'){if(typeof value!=='string'||!/^[a-f0-9]{64}$/.test(value))throw imageFailure();}
     else if(key==='p_bytes'){if(!Number.isSafeInteger(value)||(value as number)<1||(value as number)>IMAGE_MAX)throw imageFailure();}
     else if(key==='p_mode'){if(value!=='original'&&value!=='optimized')throw imageFailure();}
     else if(key==='p_type'){if(value!=='image/png'&&value!=='image/jpeg')throw imageFailure();}
     else if(key==='p_profile'){if(value!==null&&value!=='candidate-document-3508-q90-v2')throw imageFailure();}
     else if(key==='p_content'){if(!(value instanceof Uint8Array)||value.length<1||value.length>IMAGE_MAX)throw imageFailure();content=Buffer.from(value);}
    }
    busy=true;let client:AudioPgClient|null=null,inTransaction=false,destroy=false;
    const live=()=>{if(!current()||signal.aborted)throw imageFailure();};
    try{
     client=await d.pool.connect();live();await client.query('BEGIN');inTransaction=true;await client.query('SET LOCAL ROLE connect_image_backend');await client.query("SET LOCAL statement_timeout='8s'");await client.query("SET LOCAL lock_timeout='3s'");
     await client.query("SELECT set_config('request.jwt.claims',$1,true)",[JSON.stringify(claims)]);live();
     const auth=await client.query('SELECT private.image_catalog_authorize($1::uuid,$2::uuid) AS value',[params.p_company,params.p_conversation]),actor=auth.rows[0]?.value;
     if(auth.rows.length!==1||!actor||typeof actor!=='object'||Object.keys(actor).join(',')!=='userId'||(actor as Record<string,unknown>).userId!==claims.sub)throw imageFailure();
     live();const result=await client.query('SELECT private.'+name+'('+layout.map((x,i)=>'$'+(i+1)+'::'+x.split(':')[1]).join(',')+') AS value',keys.map(k=>k==='p_content'?content:params[k]));live();
     if(result.rows.length!==1||Object.keys(result.rows[0]).join(',')!=='value'||typeof JSON.stringify(result.rows[0].value)!=='string'||JSON.stringify(result.rows[0].value).length>16384)throw imageFailure();
     await client.query('COMMIT');inTransaction=false;live();return result.rows[0].value;
    }catch{if(client&&inTransaction)try{await client.query('ROLLBACK');}catch{destroy=true;}throw imageFailure();}
    finally{content?.fill(0);busy=false;try{client?.release(destroy);}catch{closed=true;throw imageFailure();}}
   }
  });
 };
}
