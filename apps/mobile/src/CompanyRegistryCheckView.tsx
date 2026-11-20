import React,{useSyncExternalStore}from'react';
import{ActivityIndicator,Pressable,StyleSheet,Text,View}from'react-native';
import type{createCompanyRegistryController}from'./company-registry-controller.ts';
import{presentCompanyRegistry,type CompanyRegistryAction}from'./company-registry-presentation.ts';
type Controller=ReturnType<typeof createCompanyRegistryController>;
/** Candidate-only view. No imports from a production entry. The owning app must
 * bind controller.current to lease/request and drive suspend/resume/close through
 * its protected Auth/foreground lifecycle. Callbacks only navigate; this view
 * neither edits a request, transmits documents nor creates a contestation. */
export function CompanyRegistryCheckView({controller,onCorrect,onReview,onContest,onOpenCompanies}:{controller:Controller;onCorrect?:()=>void;onReview?:()=>void;onContest?:()=>void;onOpenCompanies?:()=>void}){
 const state=useSyncExternalStore(controller.subscribe,controller.snapshot,controller.snapshot),copy=presentCompanyRegistry(state);if(!copy)return null;
 const navigate=(kind:'correct'|'review'|'contest'|'companies')=>{const live=controller.snapshot();if(!controller.current()||live.busy)return;if(kind==='correct'&&['mismatch','not-found','unavailable'].includes(live.state))onCorrect?.();else if(kind==='review')onReview?.();else if(kind==='contest'&&live.state==='cnpj-in-use')onContest?.();else if(kind==='companies'&&live.state==='approved'&&!live.accessReloadRequired&&!live.uncertain)onOpenCompanies?.();};
 const act=(action:CompanyRegistryAction)=>{if(state.busy)return;if(action==='check')void controller.requestCheck();else if(action==='finalize')void controller.finalize();else if(action==='confirm')void controller.confirmPrevious();else void controller.refresh();};
 const canOpenCompanies=!!onOpenCompanies&&state.state==='approved'&&!state.accessReloadRequired&&!state.uncertain;
 return <View style={s.card}><Text accessibilityRole="header" style={s.title}>{copy.title}</Text>
  <Text accessibilityLiveRegion="polite" style={s.body}>{copy.message}</Text>
  <Text style={s.notice}>A base consultada é mensal e pode ter até 62 dias. Os dados podem estar desatualizados; esta consulta não confirma titularidade.</Text>
  {copy.notice&&<Text accessibilityLiveRegion="polite" style={s.notice}>{copy.notice}</Text>}
  {state.busy&&<View accessibilityState={{busy:true}} style={s.loading}><ActivityIndicator color="#185C45"/><Text style={s.body}>Aguarde a confirmação.</Text></View>}
  {canOpenCompanies?<Button label="Ver minhas empresas" disabled={state.busy} onPress={()=>navigate('companies')}/>:copy.primary&&<Button label={copy.primary.label} disabled={state.busy} onPress={()=>act(copy.primary!.action)}/>}
  {(canOpenCompanies||copy.primary?.action!=='refresh')&&<Button label="Atualizar situação" disabled={state.busy} onPress={()=>act('refresh')}/>}
  {copy.correct&&onCorrect&&<Button label="Conferir dados informados" disabled={state.busy} onPress={()=>navigate('correct')}/>}
  {!copy.correct&&onReview&&<Button label="Ver dados enviados" disabled={state.busy} onPress={()=>navigate('review')}/>}
  {copy.contest&&onContest&&<Button label="Solicitar análise de titularidade" disabled={state.busy} onPress={()=>navigate('contest')}/>}
 </View>;
}
function Button({label,onPress,disabled}:{label:string;onPress:()=>void;disabled:boolean}){return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[s.button,disabled&&s.disabled]}><Text style={s.buttonText}>{label}</Text></Pressable>;}
const s=StyleSheet.create({card:{padding:18,gap:14,borderRadius:12,borderWidth:1,borderColor:'#DCE8DE',backgroundColor:'#FFFFFF'},title:{fontSize:21,lineHeight:28,fontWeight:'700',color:'#18372C'},body:{fontSize:16,lineHeight:24,color:'#395346'},notice:{fontSize:14,lineHeight:22,color:'#70551A'},button:{minHeight:48,padding:12,borderRadius:12,justifyContent:'center',backgroundColor:'#E5F1E9'},buttonText:{fontSize:16,lineHeight:24,fontWeight:'600',color:'#185C45'},disabled:{opacity:.5},loading:{flexDirection:'row',alignItems:'center',gap:12}});
