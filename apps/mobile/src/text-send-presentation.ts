/** Presentation only. No transport, retries, clock, storage or authorization.
 * Connection observations are supplied by the caller; reachable is not proof
 * of account/conversation access. The local variant is solely for the lab. */
export type TextSendConnection='local'|'unknown'|'offline'|'reconnecting'|'reachable';
export type TextSendFeedback=Readonly<{
 label:string;detail:string;action:'none'|'retry-same'|'refresh';actionLabel:string|null;
 actionDisabled:boolean;acceptance:'unconfirmed'|'uncertain'|'accepted';
}>;
export type TextConnectionFeedback=Readonly<{canAttempt:boolean;notice:string|null}>;
const own=(value:unknown,key:string):unknown=>{
 if(!value||typeof value!=='object'||Array.isArray(value))return undefined;
 const descriptor=Object.getOwnPropertyDescriptor(value,key);
 return descriptor&&Object.hasOwn(descriptor,'value')?descriptor.value:undefined;
};
export function textConnectionFeedback(connection:unknown):TextConnectionFeedback{
 switch(connection){
  case 'local':return Object.freeze({canAttempt:true,notice:'Laboratório em memória. Não há conexão de envio online.'});
  case 'reachable':return Object.freeze({canAttempt:true,notice:null});
  case 'offline':return Object.freeze({canAttempt:false,notice:'Sem conexão. O texto continua nesta tela enquanto a conversa permanecer aberta; nenhum envio será repetido automaticamente.'});
  case 'reconnecting':return Object.freeze({canAttempt:false,notice:'Reconectando. As mensagens ainda sem confirmação não serão reenviadas automaticamente.'});
  default:return Object.freeze({canAttempt:false,notice:'A conexão ainda não foi verificada. Nenhum envio será repetido automaticamente.'});
 }
}
const result=(connection:unknown,label:string,detail:string,action:TextSendFeedback['action'],acceptance:TextSendFeedback['acceptance']):TextSendFeedback=>Object.freeze({label,detail,action,actionLabel:action==='retry-same'?'Confirmar mesma tentativa':action==='refresh'?'Atualizar conversa':null,actionDisabled:action==='none'||!textConnectionFeedback(connection).canAttempt,acceptance});
const generic=(connection:unknown)=>result(connection,'Confirmação indisponível','Não foi possível conferir o resultado desta tentativa. Atualize a conversa antes de preparar outro envio.','refresh','uncertain');
/** Only canonical queue states/flags select public copy. Server message/debug
 * fields are never rendered or evaluated. This is not an ACK validator and does
 * not establish that a supplied receipt is authentic or currently authorized. */
export function textSendFeedback(entry:unknown,connection:unknown='unknown'):TextSendFeedback{
 try{
  const state=own(entry,'status'),failure=own(entry,'failure');
  if(state==='pending'&&failure===null)return result(connection,'Aguardando envio','A mensagem ainda não tem confirmação de aceitação.','none','unconfirmed');
  if(state==='sending'&&failure===null)return result(connection,connection==='local'?'Enviando no teste…':'Enviando…','Aguarde a confirmação desta tentativa.','none','unconfirmed');
  if(state==='accepted'&&failure===null){
   const receipt=own(entry,'receipt'),id=own(receipt,'id'),sequence=own(receipt,'sequence'),acceptedAt=own(receipt,'acceptedAt');
   if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,80}$/.test(id)||!Number.isSafeInteger(sequence)||(sequence as number)<1||!Number.isSafeInteger(acceptedAt)||(acceptedAt as number)<0)return generic(connection);
   return result(connection,connection==='local'?'Aceita no teste':'Confirmação de aceitação recebida','Aceitação não significa entrega ao destinatário nem leitura.','none','accepted');
  }
  if(state!=='failed')return generic(connection);
  const code=own(failure,'code'),retryable=own(failure,'retryable'),uncertain=own(failure,'acceptanceUncertain');
  if((code==='TIMEOUT'||code==='NETWORK')&&retryable===true&&uncertain===true)return result(connection,'Confirmação incerta','A mensagem pode ter sido aceita. Ao confirmar, use a mesma tentativa; não prepare outra cópia.','retry-same','uncertain');
  if(code==='RETRY_LATER'&&retryable===true&&uncertain===false)return result(connection,'Envio não confirmado','Não foi possível enviar agora. Você pode tentar novamente com a mesma tentativa.','retry-same','unconfirmed');
  if(code==='INVALID_RESPONSE'&&retryable===false&&uncertain===true)return result(connection,'Confirmação incerta','Não foi possível conferir a resposta. Atualize a conversa antes de preparar outro envio.','refresh','uncertain');
  if(code==='CONFLICT'&&retryable===false&&uncertain===false)return result(connection,'Tentativa precisa de revisão','Atualize a conversa antes de preparar outro envio. Esta tentativa não será repetida automaticamente.','refresh','unconfirmed');
  if(code==='INVALID_INPUT'&&retryable===false&&uncertain===false)return result(connection,'Texto precisa de revisão','Revise o texto antes de preparar outra mensagem. Esta tentativa não será repetida.','none','unconfirmed');
  if(code==='UNAVAILABLE'&&retryable===false&&uncertain===false)return result(connection,'Conversa indisponível','Não foi possível acessar esta conversa. Não repita esta tentativa.','none','unconfirmed');
  return generic(connection);
 }catch{return generic(connection);}
}
