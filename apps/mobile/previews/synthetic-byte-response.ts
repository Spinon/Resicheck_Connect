/** Offline fixture boundary only. Mirrors the byte stream exposed by native
 * fetch; constructing Response(body) is not a portable native stream bootstrap.
 * Never import this helper in a connected root or treat it as network evidence. */
export function syntheticByteResponse(bytes:Uint8Array,headers:Record<string,string>):Response{
 const copy=Uint8Array.from(bytes),h=new Headers(headers);if(!h.has('content-length'))h.set('content-length',String(copy.length));
 return{status:200,url:'',redirected:false,type:'basic',headers:h,body:new ReadableStream<Uint8Array>({start(c){c.enqueue(copy);c.close();}})}as Response;
}
