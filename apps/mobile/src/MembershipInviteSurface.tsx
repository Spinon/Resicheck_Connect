import React,{useEffect,useState,useSyncExternalStore}from'react';
import{Pressable,ScrollView,StyleSheet,Text,TextInput,View}from'react-native';
import type{MembershipInviteBinding}from'./membership-invite-binding.ts';
import{ConnectedAppBar}from'./ConnectedSettingsView.tsx';
import{ConnectIcon,type ConnectIconName}from'./ConnectIcon.tsx';
import{AudioBusy}from'./AudioControls.tsx';
function Button({label,icon,onPress,disabled=false,quiet=false}:{label:string;icon:ConnectIconName;onPress:()=>void;disabled?:boolean;quiet?:boolean}){
 return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[s.button,quiet&&s.quiet,disabled&&{opacity:.5}]}><ConnectIcon name={icon} color={quiet?'#185C45':'#FFFFFF'} size={20}/><Text style={[s.buttonLabel,quiet&&{color:'#185C45'}]}>{label}</Text></Pressable>;
}
export function MembershipInviteSurface({host,allowEntry=false,onDone,children}:{host?:MembershipInviteBinding|null;allowEntry?:boolean;onDone?:()=>void;children:React.ReactNode}){
 return host?<InviteContent host={host} allowEntry={allowEntry} onDone={onDone}>{children}</InviteContent>:<>{children}</>;
}
function InviteContent({host,allowEntry,onDone,children}:{host:MembershipInviteBinding;allowEntry:boolean;onDone?:()=>void;children:React.ReactNode}){
 const v=useSyncExternalStore(host.subscribe,host.snapshot,host.snapshot),[link,setLink]=useState(''),[ttl,setTtl]=useState(604800),[confirmRevoke,setConfirmRevoke]=useState(false),[revokeId,setRevokeId]=useState<string|null>(null);
 // Release pasted bearer material and old confirmations on every flow/context transition.
 useEffect(()=>{setLink('');setConfirmRevoke(false);setRevokeId(null);},[v.revision,v.stage,v.companyId,v.mode,v.kind]);
 const close=()=>{setLink('');setConfirmRevoke(false);setRevokeId(null);host.clear();};
 const done=()=>{setLink('');void host.complete().then(ok=>{if(ok)onDone?.();});};
 if(['idle','paused'].includes(v.stage))return <View style={s.flex}>{allowEntry&&<View style={s.entry}><Button label="Tenho um convite" icon="plus" quiet onPress={()=>{setLink('');host.openEntry();}}/></View>}{children}</View>;
 if(v.stage==='waiting-login'||v.stage==='waiting-profile')return <View style={s.flex}><View style={s.notice}><Text accessibilityLiveRegion="polite" style={s.body}>{v.stage==='waiting-login'?'Convite recebido. Entre na conta que deseja usar.':'Convite recebido. Conclua seu cadastro para continuar.'}</Text><Button label="Descartar convite" icon="trash" quiet onPress={close}/></View>{children}</View>;
 const busy=v.stage==='loading'||v.stage==='busy',role=v.kind==='staff'?'funcionário':'cliente';
 return <View style={s.flex}><ConnectedAppBar title={v.mode==='issuer'?'Convidar '+role:'Convite'} onBack={busy?undefined:close}/><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
  {v.mode==='management'?<>
   <Text accessibilityRole="header" style={s.title}>{v.companyName}</Text><Text style={s.body}>{v.kind==='staff'?'Convites de funcionários':'Convites de clientes'}</Text>
   {busy&&<AudioBusy label="Atualizando convites."/>}
   {v.notice==='operation-failed'&&<Text accessibilityRole="alert" style={s.body}>Não foi possível atualizar a lista. Confira a conexão e tente novamente.</Text>}
   {v.notice==='unconfirmed'&&<Text accessibilityRole="alert" style={s.body}>A revogação pode ter sido concluída. Atualize a lista antes de tentar novamente.</Text>}
   {!busy&&!v.items.length&&<Text style={s.body}>Nenhum convite encontrado.</Text>}
   {v.items.map((item,index)=><View key={item.inviteId} style={s.card}>
    <Text accessibilityRole="header" style={s.subtitle}>{'Convite '+(index+1)}</Text><Text style={s.body}>{'Criado em '+new Date(item.issuedAt).toLocaleString('pt-BR')}</Text><Text style={s.body}>{'Válido até '+new Date(item.expiresAt).toLocaleString('pt-BR')}</Text><Text style={s.body}>{{ready:'Aguardando uso',consumed:'Já utilizado',expired:'Expirado',revoked:'Revogado'}[item.state]}</Text>
    {item.canRevoke&&(revokeId===item.inviteId?<><Text accessibilityRole="alert" style={s.body}>Revogar impede novos usos deste link. Vínculos já aceitos continuam ativos.</Text><Button label={'Confirmar revogação do convite '+(index+1)} icon="trash" disabled={busy} onPress={()=>{setRevokeId(null);void host.revokeManaged(item.inviteId);}}/><Button label="Cancelar revogação" icon="back" quiet disabled={busy} onPress={()=>setRevokeId(null)}/></>:<Button label={'Revogar convite '+(index+1)} icon="trash" quiet disabled={busy||v.notice==='unconfirmed'} onPress={()=>setRevokeId(item.inviteId)}/>)}
   </View>)}
   <Button label="Atualizar convites recentes" icon="refresh" quiet disabled={busy} onPress={()=>{setRevokeId(null);void host.refreshManagement();}}/>
   {v.nextCursor&&<Button label="Ver convites mais antigos" icon="arrow" quiet disabled={busy} onPress={()=>{setRevokeId(null);void host.olderManagement();}}/>}
   <Text style={s.body}>Por segurança, o segredo dos links não é recuperado nem salvo aqui. Para compartilhar outro link, crie um novo convite.</Text>
  </>:v.stage==='entry'?<>
   <Text accessibilityRole="header" style={s.title}>Abrir um convite</Text><Text style={s.body}>Cole o link recebido. Você poderá conferir a empresa e sua conta antes de aceitar.</Text>
   <TextInput accessibilityLabel="Link do convite" value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} autoComplete="off" textContentType="none" secureTextEntry style={s.input}/>
   <Button label="Conferir empresa" icon="search" disabled={!link.trim()} onPress={()=>{const value=link;setLink('');host.openUrl(value);}}/>
  </>:<>
   {busy&&<AudioBusy label={v.stage==='loading'?'Conferindo empresa.':'Aguarde a confirmação.'}/>}
   {v.companyName&&<View style={s.card}><Text accessibilityRole="header" style={s.title}>{v.companyName}</Text><Text style={s.body}>{'Perfil: '+role}</Text><Text style={s.body}>{'Sua conta: '+v.accountName}</Text>{v.expiresAt&&<Text style={s.body}>{'Válido até '+new Date(v.expiresAt).toLocaleString('pt-BR')}</Text>}</View>}
   {v.stage==='issuer'&&<>
    <Text style={s.body}>Quem receber este link poderá usá-lo uma vez após entrar na própria conta e concluir o cadastro. Envie apenas para a pessoa desejada.</Text>
    <Text accessibilityRole="header" style={s.subtitle}>Validade</Text><View style={s.row}>{[86400,604800].map(seconds=><Pressable key={seconds} accessibilityRole="radio" accessibilityLabel={seconds===86400?'Um dia':'Sete dias'} accessibilityState={{checked:ttl===seconds}} onPress={()=>setTtl(seconds)} style={[s.choice,ttl===seconds&&s.selected]}><Text style={s.body}>{seconds===86400?'1 dia':'7 dias'}</Text></Pressable>)}</View>
    <Button label="Criar link secreto" icon="plus" onPress={()=>{void host.issue(ttl);}}/>
   </>}
   {v.stage==='review'&&<>
    <Text style={s.body}>Confira a empresa e a conta acima. O link será validado ao confirmar. Se já tiver sido usado, revogado ou expirado, a entrada será recusada.</Text>
    <Text style={s.body}>{v.kind==='staff'?'O convite válido do gestor dá entrada direta como funcionário, sem outra aprovação.':'O vínculo de cliente dá acesso somente à sua conversa com esta empresa.'}</Text>
    <Button label={'Aceitar como '+role} icon="check" onPress={()=>{void host.accept();}}/>
   </>}
   {v.stage==='ready'&&<>
    <Text style={s.body}>O link está pronto. Compartilhe apenas com a pessoa desejada. Ao fechar esta tela, o link não ficará salvo no aplicativo.</Text>
    <Button label="Compartilhar link" icon="send" onPress={()=>{void host.share();}}/>
   </>}
   {v.stage==='uncertain'&&<>
    <Text accessibilityRole="alert" style={s.body}>A confirmação não chegou. A operação pode ter sido concluída. Nada será repetido automaticamente.</Text>
    {v.mode==='issuer'?<Button label="Conferir emissão" icon="refresh" onPress={()=>{void host.retryIssue();}}/>:<><Button label="Conferir aceite" icon="refresh" onPress={()=>{void host.accept();}}/><Button label="Ver meus vínculos" icon="company" quiet onPress={done}/></>}
   </>}
   {v.mode==='issuer'&&['ready','uncertain'].includes(v.stage)&&(confirmRevoke?<View style={s.card}><Text accessibilityRole="alert" style={s.body}>Revogar impede novos usos deste link. Não remove um vínculo que já tenha sido aceito.</Text><Button label="Confirmar revogação" icon="trash" onPress={()=>{setConfirmRevoke(false);void host.revoke();}}/><Button label="Manter link" icon="back" quiet onPress={()=>setConfirmRevoke(false)}/></View>:<Button label="Revogar link" icon="trash" quiet onPress={()=>setConfirmRevoke(true)}/>)}
   {v.stage==='accepted'&&<><Text accessibilityLiveRegion="polite" style={s.body}>Vínculo confirmado.</Text><Button label="Ver minhas empresas" icon="company" onPress={done}/></>}
   {v.stage==='revoked'&&<Text accessibilityLiveRegion="polite" style={s.body}>Link revogado. Vínculos já aceitos foram mantidos.</Text>}
   {v.stage==='unavailable'&&<Text accessibilityRole="alert" style={s.body}>Não foi possível continuar. Confira sua conexão, sua conta e o link recebido. Se necessário, peça um novo convite.</Text>}
   {v.notice==='shared'&&<Text accessibilityLiveRegion="polite" style={s.body}>Compartilhamento concluído ou link copiado.</Text>}
   {v.notice==='share-failed'&&<Text accessibilityRole="alert" style={s.body}>O link não foi compartilhado. Você pode tentar novamente nesta tela.</Text>}
  </>}
  {!busy&&<Button label="Voltar" icon="back" quiet onPress={close}/>}
 </ScrollView></View>;
}
const s=StyleSheet.create({flex:{flex:1,minHeight:0},entry:{padding:12,alignItems:'flex-start'},notice:{padding:16,gap:12,backgroundColor:'#EDF5EF'},content:{padding:20,paddingBottom:36,gap:16,maxWidth:720,width:'100%',alignSelf:'center'},card:{padding:18,gap:10,borderRadius:14,borderWidth:1,borderColor:'#DCE6DF',backgroundColor:'#FFFFFF'},title:{fontSize:23,lineHeight:31,fontWeight:'700',color:'#18372C'},subtitle:{fontSize:18,lineHeight:26,fontWeight:'600',color:'#18372C'},body:{fontSize:16,lineHeight:25,color:'#365447'},input:{minHeight:52,borderWidth:1,borderColor:'#9FB4A7',borderRadius:12,padding:14,fontSize:16,color:'#18372C',backgroundColor:'#FFFFFF'},button:{minHeight:50,paddingHorizontal:16,paddingVertical:12,borderRadius:12,backgroundColor:'#185C45',flexDirection:'row',alignItems:'center',justifyContent:'center',gap:10},quiet:{backgroundColor:'#E6F0E9'},buttonLabel:{fontSize:16,lineHeight:24,fontWeight:'600',color:'#FFFFFF',flexShrink:1},row:{flexDirection:'row',flexWrap:'wrap',gap:12},choice:{minHeight:48,padding:12,borderWidth:1,borderColor:'#B8CCBE',borderRadius:10},selected:{borderColor:'#185C45',backgroundColor:'#E6F0E9'}});
