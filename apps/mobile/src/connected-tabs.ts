export type ConnectedTabId='companies'|'conversations'|'teams'|'settings';
export type ConnectedTab=Readonly<{id:ConnectedTabId;label:string;icon:'company'|'chat'|'team'|'user'}>;
export type ConnectedTabMembership=Readonly<{role:'manager'|'patient'|'staff';state:'pending'|'active'|'revoked';conversationId?:string|null}>;
const companies:ConnectedTab=Object.freeze({id:'companies',label:'Empresas',icon:'company'});
const conversations:ConnectedTab=Object.freeze({id:'conversations',label:'Conversas',icon:'chat'});
const teams:ConnectedTab=Object.freeze({id:'teams',label:'Equipe',icon:'team'});
const settings:ConnectedTab=Object.freeze({id:'settings',label:'Conta',icon:'user'});
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);
/** Presentation shortcuts only: this list never grants company or chat access.
 * Callers still use their session-bound controllers for every destination. */
export function connectedTabs(members:readonly ConnectedTabMembership[]):readonly ConnectedTab[]{
 let chat=false,team=false;
 if(Array.isArray(members))for(const member of members){
  if(!member||typeof member!=='object'||member.state!=='active')continue;
  if(member.role==='staff'||member.role==='patient'&&uuid(member.conversationId))chat=true;
  if(member.role==='manager')team=true;
 }
 return Object.freeze([companies,...(chat?[conversations]:[]),...(team?[teams]:[]),settings]);
}
export function activeConnectedTab(screen:string):ConnectedTabId|null{
 switch(screen){
  case 'company':case 'companies':case 'search':return 'companies';
  case 'conversations':case 'inbox':case 'chat':return 'conversations';
  case 'teams':case 'team':return 'teams';
  case 'settings':case 'about':case 'company-registration':return 'settings';
  default:return null;
 }
}
