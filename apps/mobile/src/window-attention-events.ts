type FocusEvent='blur'|'focus';
type Subscription=Readonly<{remove:()=>void}>;
type NativeEvents={addEventListener:(event:FocusEvent,listener:()=>void)=>Subscription};
type BrowserEvents={addEventListener:(event:FocusEvent,listener:()=>void)=>void;removeEventListener:(event:FocusEvent,listener:()=>void)=>void};
/** RN Web AppState accepts change/memoryWarning only. Window focus events have
 * a separate owner; Android keeps its existing AppState subscriptions. */
export function subscribeWindowAttention(platform:string,native:NativeEvents,event:FocusEvent,listener:()=>void,browser:BrowserEvents|undefined=typeof window==='undefined'?undefined:window):Subscription{
 if(platform!=='web')return native.addEventListener(event,listener);
 if(!browser)throw Error('Window attention unavailable');
 browser.addEventListener(event,listener);let removed=false;
 return Object.freeze({remove(){if(removed)return;removed=true;browser.removeEventListener(event,listener);}});
}
