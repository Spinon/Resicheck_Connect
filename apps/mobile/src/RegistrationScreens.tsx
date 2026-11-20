import{createCompanyPreviewDraft}from'./company-preview-draft.ts';
import{canonicalRegistryCnpj}from'../../../packages/access/src/company-registry.ts';
import type{CompanyPreview}from'../../../packages/chat-client/src/company-preview.ts';
import {publicAuthError} from '../../../packages/session/src/public-auth-error.ts';
import {registrationAuthNotice} from './registration-auth-notice.ts';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard,KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { validateCompany, validateProfile,validateCredentials, type CompanyForm, type CompanyStatus, type ProfileForm, type ProfileStatus,type RegistrationField } from './registration-forms.ts';
import {createIdentifierEditor,editRegistrationIdentifier,selectRegistrationIdentifier,beginRegistrationIdentifierSelection,type RegistrationIdentifier,type IdentifierSelection,type IdentifierEditor} from './registration-identifiers.ts';

type Stage='login'|'signup'|'profile'|'company'|'status'|'profile-correction'|'company-correction'|'withdraw-profile'|'withdraw-company';
type Credentials=Readonly<{email:string;password:string}>;
export type RegistrationScreenProps={
  /** Explicit connected test cut; offline copy remains the default. */
  connectedPending?:boolean;
  /** Eligible own request IDs from the session-bound registry binding; no opt-in by default. */
  companyRegistryRequestIds?:readonly string[];
  /** Safe host-owned Auth feedback survives protected presentation remounts. */
  authNotice?:string|null;
  /** Explicit same-owner recovery; no credentials are supplied by this control. */
  restoreSession?:Readonly<{available:boolean;retry:()=>void}>;
  /** Opaque local session generation, changed at logout/account switch. Never use a token. */
  scopeKey:string; stage:Stage; profile:ProfileStatus|null; company:CompanyStatus|null;
  companies?:readonly CompanyStatus[]; loading?:boolean; statusNotice?:'loading'|'unavailable'|null;
  companySubmissionUncertain?:boolean;companySubmissionRejected?:boolean;onRetryCompany?:(signal:AbortSignal)=>Promise<void>;
  signupOutcome?:'submitted'|'uncertain'|null; onRestartSignup?:()=>void;
  onStage:(stage:Stage)=>void; onSignIn:(input:Credentials,signal:AbortSignal)=>Promise<void>;
  onSignUp:(input:Credentials,signal:AbortSignal)=>Promise<void>;
  onProfile:(input:ProfileForm,signal:AbortSignal)=>Promise<void>;
  onCompany:(input:CompanyForm,signal:AbortSignal)=>Promise<void>;
  /** Explicit candidate only; no automatic lookup or submission. */
  onCompanyPreview?:(cnpj:string,signal:AbortSignal)=>Promise<CompanyPreview>;
  onRefresh:(signal:AbortSignal)=>Promise<void>; onSignOut:()=>void;
  hasMoreCompanies?:boolean;onMoreCompanies?:(signal:AbortSignal)=>Promise<void>;
  companyRequestIds?:readonly string[];selectedCompanyRequestId?:string|null;selectedCompany?:CompanyStatus|null;
  onChooseCompanyCorrection?:(request:string)=>void;onChooseCompanyWithdrawal?:(request:string)=>void;
  onResubmitProfile?:(input:ProfileForm,signal:AbortSignal)=>Promise<void>;onResubmitCompany?:(input:CompanyForm,signal:AbortSignal)=>Promise<void>;
  onWithdrawProfile?:(signal:AbortSignal)=>Promise<void>;onWithdrawCompany?:(signal:AbortSignal)=>Promise<void>;
};
const labels={login:'Entrar',signup:'Criar conta',profile:'Seus dados',company:'Solicitar cadastro da empresa',status:'Andamento do cadastro','profile-correction':'Corrigir meus dados','company-correction':'Corrigir dados da empresa','withdraw-profile':'Desistir deste cadastro','withdraw-company':'Desistir da solicitação da empresa'};
const states={pending:'Em análise',approved:'Aprovado',rejected:'Não aprovado'};
/** Shared registration screens; the connected assembly supplies admitted Auth ports. */
export function RegistrationScreens(props:RegistrationScreenProps){return <Fields key={props.scopeKey+':'+props.stage+':'+(props.selectedCompanyRequestId??'')+':'+(props.signupOutcome??'')} {...props}/>;}
function useIdentifierInput(kind:RegistrationIdentifier){
  const [editor,setEditor]=useState(createIdentifierEditor),current=useRef(editor);
  function publish(next:IdentifierEditor){if(next===current.current)return;current.current=next;setEditor(next);}
  return {text:editor.text,selection:editor.selection,
    change:(text:string)=>publish(editRegistrationIdentifier(kind,current.current,text)),
    select:(range:IdentifierSelection)=>publish(selectRegistrationIdentifier(current.current,range)),
    beginSelection:()=>publish(beginRegistrationIdentifierSelection(current.current)),
    clear:()=>publish(createIdentifierEditor())};
}
function Fields(props:RegistrationScreenProps){
  const cpfInput=useIdentifierInput('cpf'),cnpjInput=useIdentifierInput('cnpj'),cpf=cpfInput.text,cnpj=cnpjInput.text;
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState(props.stage==='profile-correction'&&props.profile?.kind==='profile'?props.profile.name:props.stage==='company-correction'?props.selectedCompany?.name??'':''),[address,setAddress]=useState(props.stage==='company-correction'?props.selectedCompany?.address??'':''),[phone,setPhone]=useState(props.stage==='company-correction'?props.selectedCompany?.phone??'':'');
  const previewDraft=useRef<ReturnType<typeof createCompanyPreviewDraft>|null>(null);
  if(!previewDraft.current)previewDraft.current=createCompanyPreviewDraft({cnpj,name,address,phone});
  const previewRequest=useRef<AbortController|null>(null),[previewBusy,setPreviewBusy]=useState(false),[previewNotice,setPreviewNotice]=useState('');
  function syncPreviewFields(){const value=previewDraft.current!.values();setName(value.name);setAddress(value.address);setPhone(value.phone);}
  function editCompany(field:'name'|'address'|'phone'|'cnpj',value:string){
    if(field==='cnpj'){previewRequest.current?.abort();previewRequest.current=null;setPreviewBusy(false);setPreviewNotice('');cnpjInput.change(value);}
    previewDraft.current!.edit(field,value);syncPreviewFields();
  }
  async function previewCompany(){
    if(!props.onCompanyPreview||previewRequest.current||current.current||busy)return;
    const captured=previewDraft.current!.begin();if(!captured){invalid({field:'cnpj',error:'Confira o CNPJ antes de buscar os dados.'});return;}
    syncPreviewFields();const ac=new AbortController();previewRequest.current=ac;setPreviewBusy(true);setPreviewNotice('');
    try{
      const response=await props.onCompanyPreview(captured.cnpj,ac.signal);
      if(!alive.current||ac.signal.aborted||previewRequest.current!==ac)return;
      const applied=previewDraft.current!.apply(captured,response);if(!applied.accepted)return;syncPreviewFields();
      setPreviewNotice(response.state==='not-found'?'CNPJ não encontrado na fonte consultada. Você pode preencher os dados manualmente.':
        'Base de '+response.datasetMonth.slice(5)+'/'+response.datasetMonth.slice(0,4)+'. Os dados podem estar desatualizados. '+(applied.fields.length?'Os campos vazios foram preenchidos; suas edições foram mantidas. ':'Seus dados foram mantidos. ')+(response.registrationStatus===2?'':'A situação cadastral consultada não está ativa. ')+
        'Confira e ajuste antes de enviar. Esta busca não confirma seus poderes de representação.');
    }catch{if(alive.current&&!ac.signal.aborted&&previewRequest.current===ac)setPreviewNotice('Não foi possível buscar os dados. Tente novamente ou preencha manualmente.');}
    finally{if(alive.current&&previewRequest.current===ac){previewRequest.current=null;setPreviewBusy(false);}}
  }
  const [working,setBusy]=useState(false),[notice,setNotice]=useState('');
  const [passwordVisible,setPasswordVisible]=useState(false);
  const passwordSelection=useRef<IdentifierSelection>({start:0,end:0});
  function togglePassword(){
    if(busy)return;const node=inputs.current.password,selection={...passwordSelection.current};
    setPasswordVisible(value=>!value);
    requestAnimationFrame(()=>{if(alive.current&&inputs.current.password===node)node?.setNativeProps({selection});});
  }
  const [recoveryNeeded,setRecoveryNeeded]=useState(false);
  const [problem,setProblem]=useState<{field:RegistrationField;error:string}|null>(null);
  const inputs=useRef<Partial<Record<RegistrationField,TextInput|null>>>({}),alive=useRef(true);
  const scroll=useRef<ScrollView|null>(null),focusedInput=useRef<RegistrationField|null>(null);
  const viewport=useRef<View|null>(null);
  const scrollOffset=useRef(0),[keyboardInset,setKeyboardInset]=useState(0);
  const confirmation=publicAuthError({code:'email_not_confirmed'});
  const recoverable=props.stage==='login'&&props.restoreSession?.available===true&&typeof props.restoreSession.retry==='function';
  const admittedNotice=registrationAuthNotice(props.authNotice??null);
  const authFeedback=recoverable?'Não foi possível recuperar sua entrada. Confira a conexão e tente novamente.':props.stage==='login'?(admittedNotice===confirmation?'Confirme seu e-mail antes de entrar. Abra o link de confirmação na sua caixa de entrada ou no spam e depois tente novamente.':admittedNotice):null;
  const busy=working||props.loading===true,companies=props.companies??(props.company?[props.company]:[]);
  const current=useRef<AbortController|null>(null);
  function reveal(field:RegistrationField){
    if(!alive.current||Platform.OS==='web')return;const node=inputs.current[field],scroller=scroll.current,frame=viewport.current;if(!node||!scroller||!frame)return;
    const valid=()=>alive.current&&scroll.current===scroller&&viewport.current===frame&&inputs.current[field]===node&&focusedInput.current===field;
    // Both input and viewport are measured in window coordinates: the QA shell
    // has a toolbar/safe area, so content-relative Y is not keyboard screen Y.
    try{frame.measureInWindow((_sx,sy,_sw,sh)=>{if(!valid())return;node.measureInWindow((_x,y,_w,h)=>{
      if(!valid()||![sy,sh,y,h].every(Number.isFinite)||sh<=0||h<=0)return;
      const metrics=Keyboard.metrics(),bottom=Math.min(sy+sh,metrics?.screenY??sy+sh)-16,top=sy+16;
      // Edge-to-edge Android may leave the viewport behind the IME. Only add
      // the actually occluded area; don't duplicate an already resized window.
      const inset=metrics?Math.max(0,sy+sh-metrics.screenY):0;setKeyboardInset(previous=>previous===inset?previous:inset);
      const delta=y+h>bottom?y+h-bottom:y<top?y-top:0;
      if(bottom>top&&Math.abs(delta)>1)scroller.scrollTo({y:Math.max(0,scrollOffset.current+delta),animated:true});
    });});}catch{}
  }
  useEffect(()=>{alive.current=true;requestAnimationFrame(()=>{if(alive.current&&!focusedInput.current){scrollOffset.current=0;scroll.current?.scrollTo({y:0,animated:false});}});const show=Keyboard.addListener('keyboardDidShow',()=>{requestAnimationFrame(()=>{if(focusedInput.current)reveal(focusedInput.current);});}),hide=Keyboard.addListener('keyboardDidHide',()=>{if(alive.current)setKeyboardInset(0);});return()=>{alive.current=false;show.remove();hide.remove();previewRequest.current?.abort();previewDraft.current?.cancel();current.current?.abort();current.current=null;};},[]);
  function invalid(error:{field:RegistrationField;error:string}){setProblem(error);setNotice('');requestAnimationFrame(()=>{if(alive.current){inputs.current[error.field]?.focus();reveal(error.field);}});}
  async function submit(){
    setPasswordVisible(false);
    if(current.current||previewRequest.current||busy||recoveryNeeded||(props.stage==='signup'&&props.signupOutcome))return;
    let action:(signal:AbortSignal)=>Promise<void>;
    if(props.stage==='login'||props.stage==='signup'){
      const checked=validateCredentials({email,password});if(!checked.ok){invalid(checked);return;}const credentials=checked.value;
      action=s=>props.stage==='login'?props.onSignIn(credentials,s):props.onSignUp(credentials,s);
    }else if(props.stage==='profile'||props.stage==='profile-correction'){
      const result=validateProfile({name,cpf});if(!result.ok){invalid(result);return;}const handler=props.stage==='profile-correction'?props.onResubmitProfile:props.onProfile;action=s=>handler?handler(result.value,s):Promise.reject(Error('Registration unavailable'));
    }else if(props.stage==='company'||props.stage==='company-correction'){
      const result=validateCompany({name,cnpj,address,phone});if(!result.ok){invalid(result);return;}const handler=props.stage==='company-correction'?props.onResubmitCompany:props.onCompany;action=s=>handler?handler(result.value,s):Promise.reject(Error('Registration unavailable'));
    }else if(props.stage==='withdraw-profile')action=s=>props.onWithdrawProfile?props.onWithdrawProfile(s):Promise.reject(Error('Registration unavailable'));
    else if(props.stage==='withdraw-company')action=s=>props.onWithdrawCompany?props.onWithdrawCompany(s):Promise.reject(Error('Registration unavailable'));
    else action=props.onRefresh;
    const controller=new AbortController();current.current=controller;setBusy(true);setNotice('');setProblem(null);
    try{
      await action(controller.signal);if(current.current!==controller||controller.signal.aborted)return;
      setPassword('');setPasswordVisible(false);cpfInput.clear();cnpjInput.clear();
      setNotice(props.stage==='signup'?'Solicitação recebida. Se for necessário, confirme seu e-mail e depois entre.':props.stage==='status'?'Andamento atualizado.':props.connectedPending?'Solicitação pendente recebida. Consulte o andamento.':'Etapa recebida no teste. Confira o andamento.');
    }catch{if(current.current===controller&&!controller.signal.aborted){setNotice(props.stage==='login'?'Não foi possível entrar. Confira e-mail, senha e confirmação do e-mail.':props.stage==='signup'?'Não foi possível solicitar sua conta. Tente novamente mais tarde.':'Não foi possível confirmar esta etapa. Consulte o andamento antes de tentar enviar novamente.');setRecoveryNeeded(props.stage==='profile'||props.stage==='company'||props.stage==='profile-correction'||props.stage==='company-correction'||props.stage==='withdraw-profile'||props.stage==='withdraw-company');}}
    finally{if(current.current===controller){current.current=null;setBusy(false);}}
  }
  async function checkStatus(){
    if(current.current||busy)return;const controller=new AbortController();current.current=controller;setBusy(true);setNotice('');
    try{await props.onRefresh(controller.signal);if(current.current!==controller||controller.signal.aborted)return;setRecoveryNeeded(false);setNotice('Andamento atualizado.');}
    catch{if(current.current===controller&&!controller.signal.aborted)setNotice('Não foi possível consultar seu andamento. Tente novamente.');}
    finally{if(current.current===controller){current.current=null;setBusy(false);}}
  }
  function leave(){previewRequest.current?.abort();previewRequest.current=null;previewDraft.current?.cancel();current.current?.abort();current.current=null;setPassword('');cpfInput.clear();cnpjInput.clear();setName('');setAddress('');setPhone('');setBusy(false);setNotice('');setProblem(null);props.onSignOut();}
  async function retryCompany(){
    if(current.current||busy||!props.onRetryCompany)return;
    const controller=new AbortController();current.current=controller;setBusy(true);setNotice('');
    try{await props.onRetryCompany(controller.signal);}
    catch{if(current.current===controller&&!controller.signal.aborted)setNotice('Ainda não foi possível confirmar a solicitação. Seu pedido não foi substituído.');}
    finally{if(current.current===controller){current.current=null;setBusy(false);}}
  }
  async function moreCompanies(){
    if(current.current||busy||props.loading||!props.onMoreCompanies)return;const controller=new AbortController();current.current=controller;setBusy(true);setNotice('');
    try{await props.onMoreCompanies(controller.signal);}catch{if(current.current===controller&&!controller.signal.aborted)setNotice('Não foi possível carregar mais empresas. Tente novamente.');}
    finally{if(current.current===controller){current.current=null;setBusy(false);}}
  }
  function button(title:string,onPress:()=>void,secondary=false,allowDuringBusy=false,blocked=false){const disabled=(busy&&!allowDuringBusy)||blocked;return <Pressable accessibilityRole="button" accessibilityLabel={title} accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[s.button,secondary&&s.secondary,disabled&&s.disabled]}><Text style={[s.buttonText,secondary&&s.secondaryText]}>{title}</Text></Pressable>;}
  function field(key:RegistrationField,label:string,value:string,onChange:(v:string)=>void,next:RegistrationField|null,options:React.ComponentProps<typeof TextInput>={},trailing?:React.ReactNode){const error=problem?.field===key?problem.error:null;return <View style={s.field}><Text style={s.label}>{label}</Text>{error&&<Text testID={'registration-error-'+key} accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.fieldError}>{error}</Text>}<View style={s.inputFrame}><TextInput ref={node=>{inputs.current[key]=node;}} onFocus={()=>{focusedInput.current=key;requestAnimationFrame(()=>reveal(key));}} onBlur={()=>{if(focusedInput.current===key)focusedInput.current=null;}} accessibilityLabel={label} accessibilityHint={error??undefined} aria-invalid={!!error} value={value} onChangeText={v=>{onChange(v);if(problem?.field===key)setProblem(null);setNotice('');}} editable={!busy} style={[s.input,key==='password'&&s.passwordInput,error&&s.invalidInput]} autoCorrect={false} returnKeyType={next?'next':'done'} submitBehavior="submit" onSubmitEditing={()=>{if(busy)return;if(next)inputs.current[next]?.focus();else void submit();}} {...options}/>{trailing}</View></View>;}
  return <KeyboardAvoidingView testID={'registration-'+props.scopeKey} style={s.page} behavior={Platform.OS==='ios'?'padding':undefined}><View ref={viewport} collapsable={false} style={s.page}><ScrollView ref={scroll} contentOffset={{x:0,y:0}} contentContainerStyle={[s.content,{paddingBottom:40+keyboardInset}]} keyboardShouldPersistTaps="handled" scrollEventThrottle={16} onScroll={event=>{scrollOffset.current=event.nativeEvent.contentOffset.y;}} onContentSizeChange={()=>{if(Platform.OS!=='web'&&Keyboard.metrics()&&focusedInput.current)requestAnimationFrame(()=>{if(focusedInput.current)reveal(focusedInput.current);});}}>
    <View style={s.brandBlock}><Text style={s.brand}>ResiCheck Connect</Text><Text style={s.slogan}>Empresas ao seu alcance.</Text></View>
    <Text accessibilityRole="header" style={s.title}>{labels[props.stage]}</Text>{props.stage==='login'&&<Text style={s.intro}>Entre para conversar com suas empresas.</Text>}{props.stage==='signup'&&!props.signupOutcome&&<Text style={s.intro}>Crie sua conta para começar seu cadastro.</Text>}
    {props.stage==='signup'&&props.signupOutcome&&<>
      <Text testID="signup-receipt" accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.notice}>{props.signupOutcome==='submitted'?'Solicitação recebida. Se necessário, confirme seu e-mail e depois entre.':'Não foi possível confirmar o resultado. A solicitação pode ter sido recebida. Confira o e-mail ou tente entrar antes de enviar novamente.'}</Text>
      {button('Ir para entrar',()=>props.onStage('login'),true)}
      {props.onRestartSignup&&button('Nova solicitação',props.onRestartSignup,true)}
    </>}
    {authFeedback&&<Text testID="registration-auth-notice" accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.notice}>{authFeedback}</Text>}
    {(props.stage==='login'||(props.stage==='signup'&&!props.signupOutcome))&&<>
      {field('email','E-mail',email,setEmail,'password',{keyboardType:'email-address',autoCapitalize:'none',autoComplete:'email'})}
      {field('password','Senha',password,setPassword,null,{secureTextEntry:!passwordVisible,autoCapitalize:'none',autoComplete:props.stage==='signup'?'new-password':'current-password',onSelectionChange:event=>{passwordSelection.current=event.nativeEvent.selection;}},
        <Pressable testID="password-visibility" accessibilityRole="button" accessibilityLabel={passwordVisible?'Ocultar senha':'Mostrar senha'} accessibilityState={{disabled:busy}} disabled={busy} onPress={togglePassword} style={[s.passwordToggle,busy&&s.disabled]}>
          <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={s.eyeFrame}><View style={s.eyeOutline}><View style={s.eyePupil}/></View>{passwordVisible&&<View style={s.eyeSlash}/>}</View>
        </Pressable>)}
      {recoverable&&button('Tentar recuperar entrada',()=>{setPassword('');setPasswordVisible(false);setProblem(null);setNotice('');Keyboard.dismiss();props.restoreSession!.retry();},true)}
      {button(props.stage==='signup'?'Criar conta':'Entrar',()=>{void submit();})}
      {button(props.stage==='signup'?'Já tenho conta':'Criar uma conta',()=>props.onStage(props.stage==='signup'?'login':'signup'),true)}
    </>}
    {(props.stage==='profile'||props.stage==='profile-correction')&&<>
      <Text style={s.body}>A checagem dos dígitos do CPF confere apenas o formato. A identidade ainda precisa ser confirmada.</Text>
      {field('name','Nome',name,setName,'cpf',{autoComplete:'name'})}{field('cpf','CPF',cpf,cpfInput.change,null,{keyboardType:'number-pad',autoComplete:'off',selection:cpfInput.selection,onPressIn:cpfInput.beginSelection,onSelectionChange:event=>cpfInput.select(event.nativeEvent.selection)})}
      {button(props.stage==='profile-correction'?'Reenviar dados':'Enviar dados',()=>{void submit();},false,false,recoveryNeeded)}
      {props.stage==='profile-correction'&&button('Voltar sem enviar',()=>props.onStage('status'),true)}
    </>}
    {(props.stage==='company'||props.stage==='company-correction')&&<>
      <Text style={s.body}>A solicitação não ativa a empresa nem confirma seus poderes de representação.</Text>
      {!props.onCompanyPreview&&field('name','Nome da empresa',name,v=>editCompany('name',v),'cnpj')}
      {field('cnpj','CNPJ',cnpj,v=>editCompany('cnpj',v),props.onCompanyPreview?'name':'address',{autoCapitalize:'characters',autoComplete:'off',selection:cnpjInput.selection,onPressIn:cnpjInput.beginSelection,onSelectionChange:event=>cnpjInput.select(event.nativeEvent.selection)})}
      {props.onCompanyPreview&&<>
        {button('Buscar dados do CNPJ',()=>{void previewCompany();},true,false,previewBusy||!canonicalRegistryCnpj(cnpj))}
        {previewBusy&&<View accessibilityRole="progressbar" accessibilityLabel="Buscando dados do CNPJ" accessibilityState={{busy:true}}><ActivityIndicator color="#185C45"/></View>}
        {!!previewNotice&&<Text testID="company-preview-notice" accessibilityLiveRegion="polite" style={s.notice}>{previewNotice}</Text>}
        {field('name','Nome da empresa',name,v=>editCompany('name',v),'address')}
        <Text style={s.body}>Revise os campos antes de confirmar. A busca não envia uma solicitação. Os dados serão enviados somente ao tocar em Enviar solicitação.</Text>
      </>}
      {field('address','Endereço (opcional)',address,v=>editCompany('address',v),'phone')}{field('phone','Telefone (opcional)',phone,v=>editCompany('phone',v),null,{keyboardType:'phone-pad'})}
      {button(props.stage==='company-correction'?'Reenviar solicitação':'Enviar solicitação',()=>{void submit();},false,false,recoveryNeeded||previewBusy)}
      {button('Voltar sem enviar',()=>props.onStage('status'),true)}
    </>}
    {(props.stage==='withdraw-profile'||props.stage==='withdraw-company')&&<>
      <Text style={s.body}>{props.stage==='withdraw-company'?props.selectedCompany?.name:'Seu cadastro ainda está em análise.'}</Text>
      <Text style={s.body}>{props.stage==='withdraw-profile'?'Ao desistir do seu cadastro, você também encerra todas as solicitações de empresa que ainda estão em análise, inclusive as que não aparecem nesta página.':'A desistência encerra esta solicitação de empresa.'} O histórico é preservado e você poderá reapresentar os dados pelo caminho de correção. Isso não exclui sua conta.</Text>
      {button('Confirmar desistência',()=>{void submit();},false,false,recoveryNeeded)}
      {button('Manter solicitação',()=>props.onStage('status'),true)}
    </>}
    {props.stage==='status'&&<>
      {!props.profile?<Text style={s.body}>Andamento indisponível. Atualize para tentar novamente.</Text>:props.profile.kind==='not_started'?<>
        <Text style={s.body}>Você ainda não enviou seus dados.</Text>{button('Preencher meus dados',()=>props.onStage('profile'),true)}
      </>:<>
        <Text style={s.body}>{props.profile.name}</Text><Text style={s.body}>Cadastro: {states[props.profile.state]}</Text>
        <Text style={s.body}>Identidade: {props.profile.identity==='confirmed'?'Confirmada':props.profile.identity==='disputed'?'Requer análise':'Ainda não confirmada'}</Text>
        {props.profile.state==='rejected'&&props.profile.identity!=='disputed'&&props.onResubmitProfile&&button('Corrigir meus dados',()=>props.onStage('profile-correction'),true)}
        {props.profile.state==='pending'&&props.profile.identity!=='disputed'&&props.onWithdrawProfile&&button('Desistir deste cadastro',()=>props.onStage('withdraw-profile'),true)}
        {props.profile.state!=='rejected'&&props.profile.identity!=='disputed'&&!props.companySubmissionUncertain&&button(companies.length?'Cadastrar outra empresa':'Cadastrar uma empresa',()=>props.onStage('company'),true,false,!!props.loading)}
        {props.companySubmissionRejected&&<Text accessibilityRole="alert" style={s.notice}>Não foi possível aceitar esta solicitação. Confira se já há um pedido para o mesmo CNPJ abaixo. Para uma empresa diferente, você pode preencher outro cadastro; se o problema continuar, tente mais tarde.</Text>}
        {companies.length>0&&!props.companySubmissionUncertain&&<Text style={s.body}>Você pode cadastrar outra empresa. As solicitações anteriores continuam disponíveis abaixo.</Text>}
        {props.companySubmissionUncertain&&<View accessibilityLiveRegion="polite" style={s.pendingNextStep}><Text style={s.body}>A confirmação do último envio não chegou. Atualize o andamento ou tente confirmar o mesmo pedido antes de cadastrar outra empresa.</Text>{props.onRetryCompany&&button('Tentar confirmar o mesmo pedido',()=>{void retryCompany();},true,false,!!props.loading)}</View>}
      </>}
      {companies.map((company,index)=><View key={props.companyRequestIds?.[index]??index} style={s.card}><Text style={s.label}>{company.name}</Text><Text style={s.body}>Solicitação da empresa: {states[company.state]}</Text><Text style={s.body}>Representação: {company.representation==='confirmed'?'Confirmada':company.representation==='disputed'?'Requer análise':'Ainda não confirmada'}</Text>
        {props.connectedPending&&company.state==='pending'&&<View testID="company-pending-next-step" accessibilityLiveRegion="polite" style={s.pendingNextStep}><Text style={s.label}>Solicitação da empresa recebida</Text><Text style={s.body}>A solicitação está pendente. Não é necessário cadastrar novamente.</Text>{props.companyRequestIds?.[index]&&props.companyRegistryRequestIds?.includes(props.companyRequestIds[index]!)?<><Text style={s.body}>Use Consultar CNPJ da empresa para conferir os dados. Depois, confirme a conclusão do cadastro.</Text><Text style={s.body}>Se a consulta não puder ser concluída, seu pedido continua salvo para acompanhar mais tarde.</Text></>:<><Text style={s.body}>A liberação de novos cadastros ainda não está disponível nesta versão de teste.</Text><Text style={s.body}>Para testar vínculos e chat, use a conta de teste disponibilizada.</Text><Text style={s.body}>Atualizar andamento consulta o estado salvo. Você pode sair e entrar depois para acompanhar esta mesma solicitação.</Text><Text style={s.body}>O chat depende de cadastro, empresa e vínculo autorizados. O recebimento desta solicitação ainda não libera esse acesso.</Text></>}</View>}
        {company.state==='rejected'&&company.representation==='unconfirmed'&&props.onChooseCompanyCorrection&&props.companyRequestIds?.[index]&&props.profile?.kind==='profile'&&props.profile.state!=='rejected'&&props.profile.identity!=='disputed'&&button('Corrigir dados de '+company.name,()=>props.onChooseCompanyCorrection!(props.companyRequestIds![index]!),true)}
        {company.state==='pending'&&company.representation==='unconfirmed'&&props.onChooseCompanyWithdrawal&&props.companyRequestIds?.[index]&&props.profile?.kind==='profile'&&props.profile.state!=='rejected'&&props.profile.identity!=='disputed'&&button('Desistir da solicitação de '+company.name,()=>props.onChooseCompanyWithdrawal!(props.companyRequestIds![index]!),true)}
      </View>)}
      {props.hasMoreCompanies&&button('Carregar mais empresas',()=>{void moreCompanies();},true,false,!!props.loading)}
      <Text style={s.body}>Esta prévia acompanha solicitações. O acesso ao chat exige vínculos e permissões próprios.</Text>
      {button('Atualizar andamento',()=>{void submit();})}
    </>}
    {busy&&<ActivityIndicator accessibilityLabel="Aguarde, estamos salvando" color="#185C45"/>}
    {props.statusNotice&&<Text accessibilityLiveRegion="polite" style={s.notice}>{props.statusNotice==='loading'?'Consultando seu andamento.':'Não foi possível consultar seu andamento. Tente atualizar.'}</Text>}
    {!!notice&&<Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={s.notice}>{notice}</Text>}
    {recoveryNeeded&&<><Text style={s.body}>Confira o andamento antes de reenviar.</Text>{button('Consultar andamento',()=>{void checkStatus();},true)}</>}
    {props.stage!=='login'&&props.stage!=='signup'&&button('Sair',leave,true,true)}
    <Text style={s.test}>{props.connectedPending?'Versão de testes • use somente dados fictícios.':'Prévia isolada • use somente dados fictícios. Sem conexão ao servidor.'}</Text>
  </ScrollView></View></KeyboardAvoidingView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:'#FFFFFF'},content:{padding:24,paddingBottom:40,gap:16,width:'100%',maxWidth:560,alignSelf:'center'},brandBlock:{paddingTop:12,paddingBottom:20,gap:5},brand:{color:'#18372C',fontSize:23,lineHeight:31,fontWeight:'700',letterSpacing:-.4},slogan:{fontSize:14,lineHeight:22,color:'#52675A'},intro:{fontSize:16,lineHeight:24,color:'#52675A',marginTop:-8,marginBottom:8},test:{fontSize:12,color:'#62736A',lineHeight:19,marginTop:20},title:{fontSize:28,lineHeight:36,fontWeight:'700',color:'#18372C'},body:{fontSize:16,lineHeight:25,color:'#263E31'},field:{gap:6},inputFrame:{position:'relative'},passwordInput:{paddingRight:62},passwordToggle:{position:'absolute',right:2,top:2,width:48,height:48,alignItems:'center',justifyContent:'center',borderRadius:12},eyeFrame:{width:24,height:24,alignItems:'center',justifyContent:'center'},eyeOutline:{width:23,height:15,borderWidth:1.7,borderColor:'#41564B',borderRadius:12,alignItems:'center',justifyContent:'center'},eyePupil:{width:6,height:6,borderRadius:3,backgroundColor:'#41564B'},eyeSlash:{position:'absolute',width:26,height:2,backgroundColor:'#41564B',transform:[{rotate:'-45deg'}]},pendingNextStep:{gap:8,paddingTop:8},label:{fontSize:16,fontWeight:'600',color:'#263E31'},input:{backgroundColor:'#FFFFFF',borderColor:'#B7C9BF',borderWidth:1,borderRadius:12,minHeight:52,paddingHorizontal:14,paddingVertical:12,fontSize:16,lineHeight:24,color:'#18372C'},button:{backgroundColor:'#185C45',borderRadius:12,minHeight:52,paddingHorizontal:18,paddingVertical:14,alignItems:'center',justifyContent:'center'},secondary:{backgroundColor:'#FFFFFF',borderWidth:1,borderColor:'#CCDCD2'},disabled:{opacity:0.6},buttonText:{fontSize:16,fontWeight:'600',color:'#FFFFFF',textAlign:'center'},secondaryText:{color:'#185C45'},fieldError:{fontSize:15,lineHeight:23,color:'#8F2424'},invalidInput:{borderColor:'#A32A2A',borderWidth:2},notice:{fontSize:16,lineHeight:25,color:'#344D3D'},card:{padding:18,gap:10,borderRadius:12,borderWidth:1,borderColor:'#DCE6DF',backgroundColor:'#F5F9F6'}});
