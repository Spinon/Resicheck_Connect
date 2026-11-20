import{analyzeMessage}from '../../text/src/message-text.ts';
/** Safe content projection only: no URI, attachment authority or invented transcript. */
export function decodeMessageContent(kind:unknown,body:unknown,allowAudio=false,allowImage=false){
 if(kind==='text'&&typeof body==='string'&&analyzeMessage(body).valid)return Object.freeze({kind:'text' as const,text:body,body});
 if(allowAudio===true&&kind==='audio'&&body===null)return Object.freeze({kind:'audio' as const,text:'Áudio',body:null});
 if(allowImage===true&&kind==='image'&&body===null)return Object.freeze({kind:'image' as const,text:'Imagem',body:null});
 throw Error('Message unavailable');
}

export const REMOVED_MESSAGE_TEXT='Mensagem removida';
export function decodeMessageProjection(kind:unknown,body:unknown,important:unknown,removedScope:unknown,allowAudio=false,allowRemoval=false,allowImage=false):Readonly<{kind:'text'|'audio'|'image';text:string;body:string|null;removedScope?:'self'|'all'}>{
 if(allowRemoval){if(removedScope!==null&&removedScope!=='self'&&removedScope!=='all')throw Error('Message unavailable');if(removedScope!==null){if(kind!=='text'||body!==REMOVED_MESSAGE_TEXT||important!==false)throw Error('Message unavailable');return Object.freeze({kind:'text' as const,text:REMOVED_MESSAGE_TEXT,body:REMOVED_MESSAGE_TEXT,removedScope:removedScope as 'self'|'all'});}}
 else if(removedScope!==undefined)throw Error('Message unavailable');
 return decodeMessageContent(kind,body,allowAudio,allowImage);
}
