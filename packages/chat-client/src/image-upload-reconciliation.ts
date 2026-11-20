import{imageIntent,imageFailure,type ImageIntent}from'./image-contract.ts';
import type{ImageTransfer}from'./image-transfer.ts';
/** One upload dispatch and at most one exact status recovery; never resends bytes. */
export async function uploadImageWithReconciliation(transport:Pick<ImageTransfer,'upload'|'status'|'active'>,intent:ImageIntent,bytes:Uint8Array,signal:AbortSignal){
 const captured=imageIntent(intent);
 try{return{receipt:await transport.upload(captured,bytes,signal),reconciled:false};}
 catch{if(signal.aborted||!transport.active())throw imageFailure();return{receipt:await transport.status(captured,signal),reconciled:true};}
}
