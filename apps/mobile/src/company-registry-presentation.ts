import type{CompanyRegistryView}from'./company-registry-controller.ts';
export type CompanyRegistryAction='check'|'refresh'|'finalize'|'confirm';
export type CompanyRegistryPresentation=Readonly<{title:string;message:string;notice:string|null;primary:Readonly<{action:CompanyRegistryAction;label:string}>|null;correct:boolean;contest:boolean}>;
/** Public applicant copy only. No IDs, source records, QSA, logs or permissions. */
export function presentCompanyRegistry(view:CompanyRegistryView):CompanyRegistryPresentation|null{
 if(!view.enabled)return null;
 const messages={
  pending:'Seu pedido aguarda a conferência do CNPJ e do nome da empresa.',
  checking:'A conferência dos dados da empresa foi solicitada.',
  mismatch:'O nome informado difere do cadastro consultado, que pode estar desatualizado. Seu pedido continua pendente. Confira os dados; se estiverem corretos, consulte a situação mais tarde.',
  'not-found':'CNPJ não encontrado na fonte consultada, que pode estar desatualizada. Seu pedido continua pendente. Confira o número ou tente novamente mais tarde.',
  unavailable:'Não foi possível concluir a conferência. As informações podem estar indisponíveis ou desatualizadas. Seu pedido continua pendente. Confira os dados ou tente novamente mais tarde.',
  ready:'CNPJ e nome conferidos. Confirme para concluir o cadastro da empresa.',
  approved:view.accessReloadRequired?'Cadastro processado. Atualize para conferir seus acessos.':'Conferência concluída. Consulte seus vínculos em Empresas.',
  'cnpj-in-use':'Este CNPJ já está cadastrado no Connect. A titularidade pode ser tratada por contestação.',
 }as const;
 let primary:CompanyRegistryPresentation['primary'];
 if(view.uncertain)primary=view.canConfirmPrevious?{action:'confirm',label:'Confirmar tentativa anterior'}:{action:'refresh',label:'Atualizar situação'};
 else if(view.state==='ready')primary={action:'finalize',label:'Concluir cadastro da empresa'};
 else if(['pending','not-found','unavailable'].includes(view.state))primary={action:'check',label:view.state==='pending'?'Consultar CNPJ':'Consultar novamente'};
 else primary={action:'refresh',label:view.accessReloadRequired?'Atualizar acesso':'Atualizar situação'};
 const notice=view.uncertain?(view.canConfirmPrevious?'A confirmação não chegou. A tentativa pode ter sido aceita. Atualize a situação ou confirme somente a mesma tentativa anterior.':'A confirmação não chegou. A tentativa pode ter sido aceita. Atualize a situação para acompanhar.'):view.notice==='expired'?'A conferência precisa ser atualizada antes de concluir.':view.notice==='access-unavailable'?'Não foi possível atualizar seus acessos. Tente atualizar novamente.':null;
 return Object.freeze({title:'Cadastro da empresa',message:messages[view.state],notice,primary:Object.freeze(primary),correct:['mismatch','not-found','unavailable'].includes(view.state),contest:view.state==='cnpj-in-use'});
}
