import type {AccountDeletionReviewCategory,AccountDeletionReviewBlocker} from '../../../packages/access/src/account-deletion-review.ts';

export type AccountDeleteReviewSummary=Readonly<{
 heading:string;explanation:string;
 items:readonly Readonly<{label:string;detail:string}>[];
 notices:readonly string[];nextStep:string;
 canExecuteDeletion:false;canConfirmDeletion:false;requiresDetailedDisclosure:true;
}>;
const categoryLabels:Readonly<Record<AccountDeletionReviewCategory,string>>=Object.freeze({
 'account-access':'Acesso à conta',
 'profile-registration':'Perfil e informações de cadastro',
 'membership-history':'Histórico de vínculos com empresas',
 'shared-messages':'Mensagens compartilhadas',
 'shared-attachments':'Arquivos compartilhados',
 'security-audit':'Registros de segurança',
 'storage-replicas':'Outras cópias dos arquivos',
 'backups-restoration':'Cópias de segurança e recuperação',
});
const blockerLabels:Readonly<Record<AccountDeletionReviewBlocker,string>>=Object.freeze({
 unavailable:'Não foi possível concluir esta revisão.',
 'scope-mismatch':'As informações precisam ser conferidas para esta conta.',
 'inventory-unresolved':'Ainda falta conferir todos os registros associados à sua conta.',
 'policy-unresolved':'As regras para remover ou manter informações ainda precisam ser esclarecidas.',
 'stale-review':'Esta revisão precisa ser atualizada.',
 'shared-content-review':'Ainda falta revisar o tratamento das informações compartilhadas.',
 'management-review':'As responsabilidades de gestão precisam ser analisadas.',
 'reference-review':'Há vínculos entre registros que ainda precisam ser analisados.',
 'storage-review':'Ainda falta revisar os arquivos e suas cópias.',
 'restore-review':'Ainda falta revisar as cópias de segurança e sua recuperação.',
 'sessions-review':'Ainda falta revisar o encerramento dos acessos à conta.',
});
const categoryOrder=Object.freeze(Object.keys(categoryLabels) as AccountDeletionReviewCategory[]);
const blockerOrder=Object.freeze(Object.keys(blockerLabels) as AccountDeletionReviewBlocker[]);
const nextStep='Você ainda precisa receber a finalidade, os prazos e o tratamento de cada grupo de informações. A confirmação final não está disponível neste resumo.';
const emptyItems=Object.freeze([]),emptyNotices=Object.freeze([]);
const generic:AccountDeleteReviewSummary=Object.freeze({heading:'Não foi possível preparar o resumo',explanation:'Não foi possível conferir estas informações. Esta revisão não remove contas nem dados.',items:emptyItems,notices:emptyNotices,nextStep,canExecuteDeletion:false,canConfirmDeletion:false,requiresDetailedDisclosure:true});
const invalid=()=>{throw Error('Account review summary unavailable');};
/** Snapshot own data properties without evaluating accessors or coercion.
 * This is presentation admission, never proof of origin, policy or authority.
 * Hostile/revoked proxies fail to the fixed generic summary; transparent data
 * proxies have the same limits as plain data and cannot create any capability. */
function fields(value:unknown,keys:readonly string[]):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();
 const prototype=Object.getPrototypeOf(value);if(prototype!==Object.prototype&&prototype!==null)return invalid();
 const own=Reflect.ownKeys(value);if(own.length!==keys.length||own.some(key=>typeof key!=='string'||!keys.includes(key)))return invalid();
 const result:Record<string,unknown>=Object.create(null);
 for(const key of keys){const descriptor=Object.getOwnPropertyDescriptor(value,key);if(!descriptor||!Object.hasOwn(descriptor,'value'))return invalid();result[key]=descriptor.value;}
 return result;
}
function array(value:unknown,max:number):unknown[]{
 if(!Array.isArray(value))return invalid();
 const descriptor=Object.getOwnPropertyDescriptor(value,'length');const length=descriptor?.value;
 if(!Number.isSafeInteger(length)||length<0||length>max)return invalid();
 const own=Reflect.ownKeys(value);if(own.length!==length+1||own.some(key=>key!=='length'&&(typeof key!=='string'||!/^(0|[1-9][0-9]*)$/.test(key)||Number(key)>=length)))return invalid();
 const result:unknown[]=[];
 for(let index=0;index<length;index++){const item=Object.getOwnPropertyDescriptor(value,String(index));if(!item||!Object.hasOwn(item,'value'))return invalid();result.push(item.value);}
 return result;
}
const tag=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(value);
const timestamp=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=8640000000000000;
function binding(value:unknown){
 if(value===null)return;
 const data=fields(value,['subjectId','inventoryRevision','policyVersion']);
 if(typeof data.subjectId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(data.subjectId)||!tag(data.inventoryRevision)||!tag(data.policyVersion))return invalid();
}
function retentionKind(value:unknown):'until-date'|'until-event'{
 // The type is checked before selecting a shape; no reference/date is displayed.
 if(!value||typeof value!=='object'||Array.isArray(value))return invalid();
 const kind=Object.getOwnPropertyDescriptor(value,'kind');if(!kind||!Object.hasOwn(kind,'value'))return invalid();
 if(kind.value==='until-date'){const data=fields(value,['kind','at']);if(!timestamp(data.at))return invalid();return 'until-date';}
 if(kind.value==='until-event'){const data=fields(value,['kind','eventRef','reviewAt']);if(!tag(data.eventRef)||!timestamp(data.reviewAt))return invalid();return 'until-event';}
 return invalid();
}
/** Public text only, independent of the app/old intent. A coherent assessment
 * is not a deletion receipt or a legal determination. This function has no I/O,
 * callback, owner mutation, final-action method or ability to enable deletion. */
export function accountDeleteReviewSummary(raw:unknown):AccountDeleteReviewSummary{
 try{
  const value=fields(raw,['status','canExecuteDeletion','canConfirmDeletion','binding','blockers','decisions','requiresDetailedDisclosure']);
  if(value.canExecuteDeletion!==false||value.canConfirmDeletion!==false||value.requiresDetailedDisclosure!==true)return generic;
  binding(value.binding);
  const blockers=array(value.blockers,blockerOrder.length),decisions=array(value.decisions,categoryOrder.length);
  if(value.status==='review-blocked'){
   if(decisions.length!==0||blockers.length===0||new Set(blockers).size!==blockers.length||blockers.some(reason=>typeof reason!=='string'||!Object.hasOwn(blockerLabels,reason)))return generic;
   const notices=Object.freeze(blockerOrder.filter(reason=>blockers.includes(reason)).map(reason=>blockerLabels[reason]));
   return Object.freeze({heading:'Ainda falta revisar sua solicitação',explanation:'Há pontos que precisam ser esclarecidos antes de continuar. Esta revisão não remove contas nem dados.',items:emptyItems,notices,nextStep,canExecuteDeletion:false,canConfirmDeletion:false,requiresDetailedDisclosure:true});
  }
  if(value.status!=='impact-reviewed'||value.binding===null||blockers.length!==0||decisions.length!==categoryOrder.length)return generic;
  const items=new Map<AccountDeletionReviewCategory,Readonly<{label:string;detail:string}>>();
  for(const decision of decisions){
   const data=fields(decision,['category','presence','action','retention']);
   if(typeof data.category!=='string'||!Object.hasOwn(categoryLabels,data.category)||(data.presence!=='present'&&data.presence!=='absent')||(data.action!=='remove'&&data.action!=='retain'))return generic;
   const category=data.category as AccountDeletionReviewCategory;if(items.has(category))return generic;
   if(category==='account-access'&&(data.presence!=='present'||data.action!=='remove'))return generic;
   let kind:'until-date'|'until-event'|null=null;
   if(data.action==='remove'){if(data.retention!==null)return generic;}else kind=retentionKind(data.retention);
   const detail=data.presence==='absent'?'Não foi identificado nesta revisão. Isso não comprova a ausência de outras cópias.':data.action==='remove'?'Remoção prevista no plano; ainda não foi realizada.':kind==='until-date'?'Previsto manter por um período, que ainda precisa ser explicado nos detalhes.':'Previsto manter até uma condição definida, com nova revisão; os detalhes ainda precisam ser apresentados.';
   items.set(category,Object.freeze({label:categoryLabels[category],detail}));
  }
  return Object.freeze({heading:'Resumo da revisão',explanation:'O plano está consistente. Esta revisão não remove contas nem dados.',items:Object.freeze(categoryOrder.map(category=>items.get(category)!)),notices:emptyNotices,nextStep,canExecuteDeletion:false,canConfirmDeletion:false,requiresDetailedDisclosure:true});
 }catch{return generic;}
}
