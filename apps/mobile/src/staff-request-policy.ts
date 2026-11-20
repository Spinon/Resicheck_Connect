import type {OwnMembership} from '../../../packages/chat-client/src/membership-directory.ts';
import type {StaffEmployerHint} from '../../../packages/chat-client/src/staff-employer.ts';
// Presentation guard only; the server checks current roles under account lock.
// A partial directory is insufficient to conclude there is no active employer.
export function staffRequestPolicy(members:readonly OwnMembership[],hasMore:boolean,companyId:string,employer?:StaffEmployerHint){
 if(employer?.state==='unknown')return Object.freeze({allowed:false,reason:'unknown' as const,message:'Não foi possível conferir seu vínculo de funcionário. Atualize seus vínculos antes de solicitar.'});
 const active=employer?.state==='active'?employer:members.find(m=>m.role==='staff'&&m.state==='active');
 if(active){const prefix='companyAvailable'in active&&!active.companyAvailable?`Seu vínculo de funcionário com ${active.name} continua ativo, mas a empresa está indisponível.`:`Você já é funcionário de ${active.name}.`;return Object.freeze({allowed:false,reason:active.companyId===companyId?'current-company' as const:'other-company' as const,message:active.companyId===companyId?'Você já é funcionário desta empresa.':prefix+' Para solicitar vínculo de funcionário em outra empresa, o vínculo atual precisa ser encerrado.'});}
 if(employer?.state==='none')return Object.freeze({allowed:true,reason:null,message:null});
 if(hasMore)return Object.freeze({allowed:false,reason:'incomplete' as const,message:'Carregue todos os seus vínculos antes de solicitar como funcionário.'});
 return Object.freeze({allowed:true,reason:null,message:null});
}
