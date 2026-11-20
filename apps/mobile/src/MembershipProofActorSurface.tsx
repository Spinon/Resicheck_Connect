import React,{useSyncExternalStore}from 'react';
import{View,Text,Pressable,StyleSheet}from 'react-native';
import type{MembershipProofActor}from './membership-proof-actor.ts';
import{MembershipInviteSurface}from './MembershipInviteSurface.tsx';
import{RegistrationHostView}from './RegistrationHostView';
/** Local QA host for the existing real registration and invite surfaces.
 * It never constructs an actor or enables a feature from URL/storage/environment. */
export function MembershipProofActorSurface({actor}:{actor:MembershipProofActor|null}){
 return actor?<ActorContent actor={actor}/>:<Text>Prova indisponível.</Text>;
}
function ActorContent({actor}:{actor:MembershipProofActor}){
 const a=actor.app;
 useSyncExternalStore(a.auth.subscribe,a.auth.snapshot,a.auth.snapshot);
 useSyncExternalStore(a.gate.subscribe,a.gate.snapshot,a.gate.snapshot);
 const members=useSyncExternalStore(a.members.subscribe,a.members.snapshot,a.members.snapshot),ready=actor.ready();
 const current=members.members.filter(m=>m.companyId===actor.companyId&&m.state==='active');
 const manager=current.some(m=>m.role==='manager'),staff=current.some(m=>m.role==='staff');
 const action=(label:string,fn:()=>void)=><Pressable key={label} accessibilityRole="button" accessibilityLabel={label} onPress={fn} style={s.button}><Text style={s.label}>{label}</Text></Pressable>;
 return <View style={s.page}><Text accessibilityRole="header">Teste de convites</Text><MembershipInviteSurface host={a.invites} allowEntry={ready}>
  {!ready?<RegistrationHostView host={a.registration}/>:<View style={s.content}><Text>{current[0]?.name??'Escolha o convite recebido'}</Text>
   {manager&&action('Convidar funcionário',()=>{a.invites?.openIssuer(actor.companyId,'staff');})}
   {staff&&action('Convidar cliente',()=>{a.invites?.openIssuer(actor.companyId,'patient');})}
   {manager&&action('Convites de funcionários',()=>{a.invites?.openManagement(actor.companyId,'staff');})}
   {(manager||staff)&&action('Convites de clientes',()=>{a.invites?.openManagement(actor.companyId,'patient');})}
  </View>}
 </MembershipInviteSurface></View>;
}
const s=StyleSheet.create({page:{flex:1,minHeight:0},content:{gap:12,padding:16},button:{minHeight:48,backgroundColor:'#185C45',padding:14,borderRadius:10},label:{color:'#FFF',fontWeight:'600'}});
