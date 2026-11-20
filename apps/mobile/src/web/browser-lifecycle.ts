type BrowserEvents={addEventListener:(name:string,fn:()=>void)=>void;removeEventListener:(name:string,fn:()=>void)=>void};
/** Hide synchronously before suspending private controllers. Resuming is explicit.
 * No cookies, storage, credentials, URLs or cross-tab messages are used. */
export function bindBrowserLifecycle(deps:{document:BrowserEvents&{visibilityState:string};window:BrowserEvents;app:{suspend:()=>void;resume:()=>void;dispose:()=>unknown};cover:(covered:boolean)=>void}){
 let closed=false,covered=deps.document.visibilityState!=='visible';
 function hide(){if(closed)return;covered=true;deps.cover(true);deps.app.suspend();}
 function visibility(){if(deps.document.visibilityState!=='visible')hide();}
 function dispose(){if(closed)return;closed=true;deps.cover(true);deps.document.removeEventListener('visibilitychange',visibility);deps.window.removeEventListener('pagehide',dispose);deps.window.removeEventListener('blur',hide);void deps.app.dispose();}
 deps.document.addEventListener('visibilitychange',visibility);deps.window.addEventListener('pagehide',dispose);deps.window.addEventListener('blur',hide);
 if(covered)hide();
 return Object.freeze({resume(){if(closed||deps.document.visibilityState!=='visible')return false;deps.app.resume();covered=false;deps.cover(false);return true;},dispose,isClosed:()=>closed,isCovered:()=>covered});
}
