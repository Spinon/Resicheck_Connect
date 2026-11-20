export type AuthDiagnosticConfig=Readonly<{schemaVersion:1;projectRef:'ibdlvlwdzmsrbqadrudb';projectUrl:'https://ibdlvlwdzmsrbqadrudb.supabase.co';publishableKey:string}>;
// Projects/keys cannot be selected by a deep link, login field or environment.
// A key's format alone does not prove its project; the build also checks the
// project-scoped retrieval receipt and key hash before generating the entry.
export function authDiagnosticConfig(raw:unknown):AuthDiagnosticConfig{
  try{
    if(!raw||typeof raw!=='object'||Array.isArray(raw)||Object.keys(raw).sort().join(',')!=='projectRef,projectUrl,publishableKey,schemaVersion')throw Error();
    const c=raw as Record<string,unknown>;
    if(c.schemaVersion!==1||c.projectRef!=='ibdlvlwdzmsrbqadrudb'||c.projectUrl!=='https://ibdlvlwdzmsrbqadrudb.supabase.co'||typeof c.publishableKey!=='string'||!/^sb_publishable_[A-Za-z0-9_-]{1,200}$/.test(c.publishableKey)||/synthetic|example|placeholder/i.test(c.publishableKey))throw Error();
    return Object.freeze({schemaVersion:1,projectRef:c.projectRef,projectUrl:c.projectUrl,publishableKey:c.publishableKey});
  }catch{throw Error('Auth diagnostic configuration unavailable');}
}
