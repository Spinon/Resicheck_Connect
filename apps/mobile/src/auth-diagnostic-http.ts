// Candidate narrow HTTP boundary. The underlying native implementation is
// supplied explicitly; this module never opens a connection by itself.
export const AUTH_DIAGNOSTIC_ORIGIN='https://ibdlvlwdzmsrbqadrudb.supabase.co';
const routes=new Map([['/auth/v1/token?grant_type=password','POST'],['/auth/v1/user','GET'],['/auth/v1/logout?scope=local','POST']]);
const denied=()=>new Error('Auth diagnostic unavailable');
export function createAuthDiagnosticFetch(nativeFetch:typeof fetch,publishableKey:string):typeof fetch {
  if(typeof nativeFetch!=='function'||!/^sb_publishable_[A-Za-z0-9_-]{1,200}$/.test(publishableKey))throw denied();
  return (async(input,init)=>{
    if(typeof input!=='string'||!input.startsWith(AUTH_DIAGNOSTIC_ORIGIN)||!init||!init.signal||init.signal.aborted)throw denied();
    const route=input.slice(AUTH_DIAGNOSTIC_ORIGIN.length);
    if(routes.get(route)!==init.method||init.redirect!=='error'||init.credentials!=='omit')throw denied();
    const headers=new Headers(init.headers);
    const allowed=new Set(['apikey','accept','content-type','authorization']);
    headers.forEach((_,key)=>{if(!allowed.has(key))throw denied();});
    if(headers.get('apikey')!==publishableKey||headers.get('accept')!=='application/json')throw denied();
    const authorization=headers.get('authorization');
    if(route.startsWith('/auth/v1/token?')){
      if(authorization!==null||headers.get('content-type')!=='application/json'||typeof init.body!=='string'||init.body.length>12000)throw denied();
      const body:unknown=JSON.parse(init.body);
      if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).sort().join(',')!=='email,password')throw denied();
      const credentials=body as {email:unknown;password:unknown};
      if(typeof credentials.email!=='string'||typeof credentials.password!=='string')throw denied();
    }else if(init.body!==undefined||!authorization||!/^Bearer [A-Za-z0-9_.-]{1,8192}$/.test(authorization)||headers.has('content-type'))throw denied();
    // No ambient cookies, redirect following, arbitrary URL, extra headers,
    // SDK storage, signup, refresh, Admin API, PostgREST or custom TLS settings.
    // Expo Android does not forward the JS cache option to OkHttp. Use the
    // request directive too; don't claim cache behavior from that option alone.
    headers.set('Cache-Control','no-store');
    return nativeFetch(input,{method:init.method,headers,body:init.body,signal:init.signal,redirect:'error',credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer'});
  }) as typeof fetch;
}
