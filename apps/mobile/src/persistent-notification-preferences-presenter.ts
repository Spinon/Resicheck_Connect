import type {createPersistentNotificationPreferencesHost,PersistentNotificationPreferencesView} from './persistent-notification-preferences-host.ts';
import type {NotificationPrivacy,NotificationFilter} from '../../../packages/chat-client/src/notification-preferences.ts';
type Host=Pick<ReturnType<typeof createPersistentNotificationPreferencesHost>,'snapshot'|'setPrivacy'|'setFilter'|'save'|'retry'|'reload'|'cancel'>;
export type PersistentNotificationPresentationStage='inactive'|'loading'|'loaded'|'staged'|'saving'|'uncertain'|'reload-required'|'unavailable';
export const notificationPrivacyLabels=Object.freeze(['Apenas o nome do app','App e empresa','App, empresa e atendente','App, empresa, atendente e mensagem'] as const);
export function notificationFilterLabel(value:NotificationFilter){return value===null?'Não configurado':value==='all'?'Todas as notificações':'Somente importantes';}
export function notificationPrivacyFromTrack(locationX:number,width:number):NotificationPrivacy|null{
  if(!Number.isFinite(locationX)||!Number.isFinite(width)||width<=0)return null;
  return (1+Math.round(Math.max(0,Math.min(1,locationX/width))*3)) as NotificationPrivacy;
}
const privacy=(value:unknown):value is NotificationPrivacy=>typeof value==='number'&&Number.isInteger(value)&&value>=1&&value<=4;
const filter=(value:unknown):value is NotificationFilter=>value===null||value==='all'||value==='important';

// Pure candidate projection. Snapshot/scope identity binds every settings action;
// navigation back intentionally remains usable after account changes/disposal.
export function presentPersistentNotificationPreferences({host,snapshot,onBack}:{host:Host;snapshot:PersistentNotificationPreferencesView;onBack:()=>void}){
  const scopeKey=snapshot.scopeKey;
  const current=()=>{try{const now=host.snapshot();return now===snapshot&&now.scopeKey===scopeKey;}catch{return false;}};
  const valid=current();
  let stage:PersistentNotificationPresentationStage=valid?snapshot.stage==='ready'?(snapshot.ready?(snapshot.dirty?'staged':'loaded'):'unavailable'):snapshot.stage:'unavailable';
  const loaded=valid&&snapshot.stage==='ready'&&snapshot.ready&&privacy(snapshot.privacy)&&filter(snapshot.filter)
    ?Object.freeze({privacy:snapshot.privacy,filter:snapshot.filter}):null;
  const staged=valid&&['ready','saving','uncertain'].includes(snapshot.stage)&&privacy(snapshot.stagedPrivacy)&&filter(snapshot.stagedFilter)
    ?Object.freeze({privacy:snapshot.stagedPrivacy,filter:snapshot.stagedFilter}):null;
  if((stage==='loaded'||stage==='staged')&&(!loaded||!staged))stage='unavailable';
  const messages:Record<PersistentNotificationPresentationStage,string>={
    inactive:'Entre na sua conta para carregar as preferências.',
    loading:'Carregando suas preferências. A configuração salva ainda não foi conferida.',
    loaded:'Preferências carregadas. Escolha uma opção para editar.',
    staged:'Há alterações ainda não salvas.',
    saving:'Aguardando confirmação e nova leitura. A alteração ainda não foi conferida.',
    uncertain:'A confirmação não chegou. A alteração pode ter sido salva. Tente novamente para conferir a mesma alteração; nada será repetido automaticamente.',
    'reload-required':'Não foi possível conferir o estado atual. Recarregue antes de fazer outra alteração.',
    unavailable:'Preferências indisponíveis. Nenhuma configuração salva foi confirmada.',
  };
  const canEdit=valid&&(stage==='loaded'||stage==='staged')&&!snapshot.busy&&!!loaded&&!!staged;
  const canSave=canEdit&&stage==='staged',canDiscard=canSave;
  const canRetry=valid&&stage==='uncertain'&&!snapshot.busy;
  const canReload=valid&&!snapshot.busy&&['loaded','reload-required','unavailable'].includes(stage);
  const canCancelWait=valid&&snapshot.busy&&(stage==='loading'||stage==='saving');
  let writeUsed=false,waitCancelUsed=false;
  const invoke=(allowed:boolean,action:()=>boolean)=>{if(!allowed||!current())return false;try{return action()===true;}catch{return false;}};
  const asyncInvoke=async(allowed:boolean,action:()=>Promise<boolean>,write=false)=>{
    if(!allowed||!current()||write&&writeUsed)return false;if(write)writeUsed=true;
    try{return await action()===true;}catch{return false;}
  };
  return Object.freeze({stage,message:messages[stage],loaded,staged,canEdit,canSave,canDiscard,canRetry,canReload,canCancelWait,
    actions:Object.freeze({
      setPrivacy:(value:unknown)=>privacy(value)&&invoke(canEdit,()=>host.setPrivacy(value)),
      setFilter:(value:unknown)=>filter(value)&&invoke(canEdit,()=>host.setFilter(value)),
      save:()=>asyncInvoke(canSave,host.save,true),retry:()=>asyncInvoke(canRetry,host.retry,true),reload:()=>asyncInvoke(canReload,host.reload),
      discard:()=>invoke(canDiscard,host.cancel),
      cancelWait:()=>{if(waitCancelUsed)return false;const accepted=invoke(canCancelWait,host.cancel);if(accepted)waitCancelUsed=true;return accepted;},
      back:()=>{try{onBack();return true;}catch{return false;}},
    }),
  });
}
