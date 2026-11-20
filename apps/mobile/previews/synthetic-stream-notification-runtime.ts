import {createSyntheticPersistentNotificationRuntime} from './synthetic-persistent-notification-runtime.ts';

// Compatibility for the existing native HTTP-shaped fixture responses, which
// have headers/body streams but no Response.json(). Preserve the historical lab.
// This remains injected fake HTTP, never a real provider or network fallback.
export function createSyntheticStreamNotificationRuntime(json:(value:unknown,status?:number)=>Response,createId:()=>string){
 const compatible=(value:unknown,status?:number):Response=>{
  const response=json(value,status);if(typeof response.json==='function')return response;
  return{status:response.status,redirected:response.redirected,url:response.url,headers:response.headers,body:response.body,
   async json(){
    const reader=response.body?.getReader();if(!reader)throw Error('Synthetic response unavailable');
    try{
     const decoder=new TextDecoder('utf-8',{fatal:true});let text='',size=0;
     while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>1024)throw Error('Synthetic response unavailable');text+=decoder.decode(chunk.value,{stream:true});}
     text+=decoder.decode();return JSON.parse(text);
    }catch{try{await reader.cancel();}catch{}throw Error('Synthetic response unavailable');}
    finally{reader.releaseLock();}
   },
  } as Response;
 };
 return createSyntheticPersistentNotificationRuntime(compatible,createId);
}
