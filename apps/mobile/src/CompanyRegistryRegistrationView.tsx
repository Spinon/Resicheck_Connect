import {formatRegistrationIdentifier} from './registration-identifiers.ts';
import React,{useRef,useState,useSyncExternalStore} from 'react';
import {Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import type {createConnectedCompanyRegistry} from './connected-company-registry.ts';
import {PendingRegistrationHostView} from './PendingRegistrationHostView.tsx';
import {CompanyRegistryCheckView} from './CompanyRegistryCheckView.tsx';
// Presentation intent only, owned by this app and exact registration scope.
// Native privacy may remount this view during authoritative access refresh.
// No credentials/data are cached; the live binding still validates every row.
const openRegistryPanels=new WeakMap<object,string>();
/** Candidate composition reuses existing registration screens and gives this
 * check its own scrollable panel. The protected owner drives app lifecycle.
 * No production entry imports this wrapper. Selection itself makes no I/O. */
export function CompanyRegistryRegistrationView({app,onContest,onBack,onOpenCompanies,restoreSession}:{app:ReturnType<typeof createConnectedCompanyRegistry>;onContest?:(requestId:string)=>void;onBack?:()=>void;onOpenCompanies?:()=>void;restoreSession?:React.ComponentProps<typeof PendingRegistrationHostView>['restoreSession']}){
 const view=useSyncExternalStore(app.registry.subscribe,app.registry.snapshot,app.registry.snapshot);
 const registration=useSyncExternalStore(app.registration.subscribe,app.registration.snapshot,app.registration.snapshot);
 const [openScope,setOpenScope]=useState<string|null>(()=>openRegistryPanels.get(app)===registration.scopeKey?registration.scopeKey:null);
 const [review,setReview]=useState<{scope:string;requestId:string;controller:NonNullable<typeof view.controller>}|null>(null);
 const reviewOwner=useRef(review);reviewOwner.current=review;
 const closeReview=()=>{reviewOwner.current=null;setReview(null);};
 const available=registration.stage==='status'&&view.enabled&&view.requests.length>0;
 const selectedRequest=view.controller?.snapshot().requestId;
 const selectedCompany=view.requests.find(row=>row.requestId===selectedRequest);
 const reviewing=review&&available&&openScope===registration.scopeKey&&review.scope===registration.scopeKey&&view.controller===review.controller&&review.controller.current()&&view.requests.some(row=>row.requestId===review.requestId)?registration.companies[registration.companyRequestIds.indexOf(review.requestId)]:null;
 const ownsReview=()=>!!review&&reviewOwner.current===review&&app.registration.snapshot().stage==='status'&&app.registry.snapshot().controller===review.controller&&app.registration.snapshot().scopeKey===review.scope&&review.controller.current()&&review.controller.snapshot().requestId===review.requestId;
 const openReview=()=>{const current=app.registry.snapshot().controller,live=app.registration.snapshot();if(current&&current===view.controller&&current.current()&&!current.snapshot().busy&&live.stage==='status'&&live.scopeKey===registration.scopeKey&&live.companyRequestIds.includes(current.snapshot().requestId))setReview({scope:live.scopeKey,requestId:current.snapshot().requestId,controller:current});};
 const canWithdrawReview=()=>{if(app.companyRegistryCorrectionsEnabled!==true||!ownsReview()||!review)return false;const live=app.registration.snapshot(),status=review.controller.snapshot(),company=live.companies[live.companyRequestIds.indexOf(review.requestId)];return !status.busy&&['mismatch','not-found','unavailable'].includes(status.state)&&company?.state==='pending'&&company.representation==='unconfirmed';};
 const openCompanies=()=>{const current=app.registry.snapshot().controller,live=app.registration.snapshot();if(!onOpenCompanies||!current||current!==view.controller||!current.current()||live.stage!=='status'||live.scopeKey!==registration.scopeKey)return;const status=current.snapshot(),owner=app.auth.currentLease();if(!status.busy&&status.state==='approved'&&!status.accessReloadRequired&&!status.uncertain&&owner&&app.gate.matches(owner))onOpenCompanies();};
 if(reviewing&&review)return <ScrollView style={s.page} contentContainerStyle={s.panel}>
  <Text accessibilityRole="header" style={s.title}>Dados informados da empresa</Text>
  <View style={s.summary}><Text style={s.label}>Nome da empresa</Text><Text style={s.text}>{reviewing.name}</Text>
   <Text style={s.label}>CNPJ</Text><Text style={s.text}>{reviewing.cnpj?formatRegistrationIdentifier('cnpj',reviewing.cnpj):'CNPJ não disponível neste resumo.'}</Text>
   {!!reviewing.address&&<><Text style={s.label}>Endereço</Text><Text style={s.text}>{reviewing.address}</Text></>}
   {!!reviewing.phone&&<><Text style={s.label}>Telefone</Text><Text style={s.text}>{reviewing.phone}</Text></>}
  </View>
  <Text style={s.text}>Confira o nome, CNPJ, endereço e telefone enviados nesta solicitação. Abrir este resumo não altera o cadastro.</Text>
  {canWithdrawReview()&&<><Text style={s.text}>A fonte consultada pode estar desatualizada; seu pedido continua pendente. Se os dados estiverem corretos, você pode voltar e acompanhar a consulta.</Text>
   <Text style={s.text}>Para alterar os dados ou o CNPJ, retire este pedido e envie outro. A retirada só acontece após sua confirmação.</Text></>}
  {app.companyRegistryCorrectionsEnabled!==true&&['mismatch','not-found','unavailable'].includes(review.controller.snapshot().state)&&<Text style={s.text}>A correção desses dados ainda não está disponível nesta versão. Seu pedido foi mantido para acompanhar a consulta.</Text>}
  <Button label="Voltar à consulta sem alterar" onPress={closeReview}/>
  {canWithdrawReview()&&<Button label="Retirar pedido para corrigir" onPress={()=>{if(canWithdrawReview()){app.registration.bind().onChooseCompanyWithdrawal?.(review.requestId);closeReview();openRegistryPanels.delete(app);setOpenScope(null);}}}/>}
 </ScrollView>;
 if(available&&openScope===registration.scopeKey)return <ScrollView style={s.page} contentContainerStyle={s.panel}>
  <Button label="Voltar ao cadastro" onPress={()=>{openRegistryPanels.delete(app);setOpenScope(null);}}/>
  <Text accessibilityRole="header" style={s.title}>Consulta da empresa</Text>
  {!view.controller&&<Text style={s.text}>Escolha a empresa do seu cadastro para consultar o CNPJ.</Text>}
  {view.requests.map(row=><Button key={row.requestId} label={row.name} selected={row.requestId===selectedRequest} onPress={()=>{app.registry.select(row.requestId);}}/>)}
  {selectedCompany&&<Text accessibilityLiveRegion="polite" style={s.context}>Consulta de {selectedCompany.name}</Text>}
  {view.controller&&<CompanyRegistryCheckView controller={view.controller} onCorrect={openReview} onReview={openReview} onOpenCompanies={onOpenCompanies?openCompanies:undefined} onContest={onContest?()=>{const current=view.controller;if(current?.current())onContest(current.snapshot().requestId);}:undefined}/>}
 </ScrollView>;
 return <View style={s.page}>{onBack&&<View style={s.footer}><Button label="Voltar ao perfil" onPress={onBack}/></View>}<PendingRegistrationHostView host={app.registration} onCompanyPreview={app.previewCompany} connectedPending companyRegistryCorrections={app.companyRegistryCorrectionsEnabled===true} companyRegistryRequestIds={view.enabled?view.requests.map(row=>row.requestId):undefined} restoreSession={restoreSession}/>{available&&<View style={s.footer}><Button label="Consultar CNPJ da empresa" onPress={()=>{const live=app.registration.snapshot();if(live.stage==='status'&&live.scopeKey===registration.scopeKey&&app.registry.snapshot().enabled){openRegistryPanels.set(app,registration.scopeKey);setOpenScope(registration.scopeKey);}}}/></View>}</View>;
}
function Button({label,onPress,selected=false}:{label:string;onPress:()=>void;selected?:boolean}){return <Pressable accessibilityRole="button" accessibilityLabel={selected?label+' — selecionada':label} onPress={onPress} style={[s.choose,selected&&s.selected]}><Text style={s.text}>{label}</Text></Pressable>;}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#F5F8F5'},panel:{padding:20,gap:16,paddingBottom:32},footer:{padding:16},summary:{padding:18,gap:8,borderRadius:12,backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#DCE8DE'},label:{fontSize:14,lineHeight:20,fontWeight:'600',color:'#52675A'},choose:{minHeight:48,padding:12,borderRadius:12,justifyContent:'center',backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#DCE6DF'},selected:{backgroundColor:'#E5F1E9',borderColor:'#185C45'},context:{fontSize:16,lineHeight:24,fontWeight:'600',color:'#18372C'},text:{fontSize:16,lineHeight:24,color:'#185C45'},title:{fontSize:24,lineHeight:32,fontWeight:'700',color:'#18372C'}});
