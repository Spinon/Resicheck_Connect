import{ConversationCacheSettings}from '../ConversationCacheSettings.tsx';
import type{ConversationCache}from '../conversation-cache.ts';
import React,{useState} from 'react';
import {Image} from 'react-native';
import {ConnectIcon, type ConnectIconName} from '../ConnectIcon.tsx';
import type {ConnectedScreen} from '../connected-navigation.ts';
const logo=require('../../assets/resicheck-icon-round.png');
export type WebDestination='conversations'|'companies'|'teams'|'company-registration'|'settings';
const navigation:readonly {id:WebDestination;label:string;icon:ConnectIconName}[]=[
 {id:'conversations',label:'Conversas',icon:'chat'},
 {id:'companies',label:'Empresas',icon:'company'},
 {id:'teams',label:'Equipe',icon:'team'},
 {id:'company-registration',label:'Cadastro da empresa',icon:'plus'},
 {id:'settings',label:'Minha conta',icon:'user'},
];
export function activeWebDestination(screen:ConnectedScreen):WebDestination{
 if(screen==='company-registration')return screen;
 if(screen==='company'||screen==='search')return 'companies';
 if(screen==='inbox')return 'conversations';
 if(screen==='team')return 'teams';
 if(screen==='about')return 'settings';
 return screen;
}
export function WebBrand(){return <div className="connect-brand"><Image source={logo} accessible={false} style={{width:38,height:38}}/><div><strong>ResiCheck <span>Connect</span></strong><p>Empresas ao seu alcance.</p></div></div>;}
export function ConnectWebShell({screen,canManage,registryEnabled,name,onNavigate,children}:{screen:ConnectedScreen;canManage:boolean;registryEnabled:boolean;name:string;onNavigate:(screen:WebDestination)=>void;children:React.ReactNode}){
 const active=activeWebDestination(screen);
 const [collapsed,setCollapsed]=useState(false);
 const toggleLabel=collapsed?'Expandir menu':'Recolher menu';
 return <div className={'connect-shell'+(collapsed?' is-rail-collapsed':'')}><a className="connect-skip" href="#connect-main">Ir para o conteúdo</a><aside className="connect-rail"><WebBrand/><button type="button" className="connect-rail-toggle" aria-label={toggleLabel} title={toggleLabel} aria-expanded={!collapsed} aria-controls="connect-navigation" onClick={()=>setCollapsed(value=>!value)}><span className="connect-rail-toggle-icon" aria-hidden="true"><ConnectIcon name="back" color="#426153" size={20}/></span><span className="connect-rail-toggle-label" aria-hidden="true">{toggleLabel}</span></button><nav id="connect-navigation" aria-label="Navegação principal" className="connect-nav">{navigation.filter(item=>(item.id!=='teams'||canManage)&&(item.id!=='company-registration'||registryEnabled)).map(item=><button key={item.id} type="button" className={'connect-nav-item'+(active===item.id?' is-active':'')+(item.id==='settings'?' connect-account-nav':'')} aria-label={item.label} title={collapsed?undefined:item.label} aria-current={active===item.id?'page':undefined} onClick={()=>onNavigate(item.id)}><ConnectIcon name={item.icon} color={active===item.id?'#FFFFFF':'#426153'} size={22}/><span className="connect-nav-label-full" aria-hidden="true">{item.label}</span><span className="connect-nav-label-compact" aria-hidden="true">{item.id==='company-registration'?'Cadastro':item.id==='settings'?'Conta':item.label}</span><span className="connect-nav-tooltip" aria-hidden="true">{item.label}</span></button>)}</nav><div className="connect-session" title={name}><span className="connect-avatar" aria-hidden="true">{Array.from(name.trim())[0]?.toLocaleUpperCase()||'C'}</span><div><strong>{name}</strong><small>Sessão nesta aba</small></div></div></aside><main id="connect-main" tabIndex={-1} className={'connect-main '+(active==='conversations'?'connect-main-chat':'')} aria-label={navigation.find(item=>item.id===active)?.label}>{children}</main></div>;
}
export function WebContentPanel({title,description,children,back,onBack}:{title:string;description?:string;children:React.ReactNode;back?:string;onBack?:()=>void}){return <section className="connect-content-panel"><header className="connect-section-heading">{onBack&&<button type="button" className="connect-back" onClick={onBack}><ConnectIcon name="back" size={20}/>{back||'Voltar'}</button>}<h1>{title}</h1>{description&&<p>{description}</p>}</header><div className="connect-panel-body">{children}</div></section>;}
export function WebAccount({cache,name,roles,about,audioEnabled,registryEnabled,onCompanies,onRegistration,onAbout,onBack,onLogout}:{cache?:ConversationCache;name:string;roles:string;about:boolean;audioEnabled:boolean;registryEnabled:boolean;onCompanies:()=>void;onRegistration:()=>void;onAbout:()=>void;onBack:()=>void;onLogout:()=>void}){
 if(about)return <WebContentPanel title="Sobre esta versão" back="Minha conta" onBack={onBack}><div className="connect-account-content"><h2>ResiCheck Connect</h2><p>Empresas ao seu alcance.</p><p>Versão web de testes. Use somente dados fictícios.</p><p>Converse por texto{audioEnabled?' e áudio':''} com as empresas às quais sua conta tem acesso. A equipe visualiza as conversas autorizadas da própria empresa.</p>{registryEnabled&&<p>A consulta de CNPJ usa uma base pública que pode estar desatualizada. Ela não comprova a titularidade ou a representação da empresa.</p>}<p>A sessão fica nesta aba. Ao sair da conta, o conteúdo protegido deixa de estar disponível.</p></div></WebContentPanel>;
 return <WebContentPanel title="Minha conta" description="Seu perfil e suas opções no Connect."><div className="connect-account-content"><div className="connect-profile"><span className="connect-profile-avatar" aria-hidden="true">{Array.from(name.trim())[0]?.toLocaleUpperCase()||'C'}</span><div><h2>{name}</h2><p>{roles||'Sua conta pessoal'}</p></div></div><h2 className="connect-small-heading">Conta</h2><div className="connect-account-actions"><AccountAction label="Minhas empresas" detail="Veja seus vínculos e os dados de cada empresa." icon="company" onClick={onCompanies}/>{registryEnabled&&<AccountAction label="Cadastro da empresa" detail="Acompanhe seu cadastro e a consulta de CNPJ." icon="plus" onClick={onRegistration}/>}<AccountAction label="Sobre esta versão" detail="Recursos e informações da versão web." icon="user" onClick={onAbout}/></div>{cache&&<ConversationCacheSettings cache={cache}/>}<button type="button" className="connect-logout" onClick={onLogout}>Sair da conta</button><p className="connect-account-note">Use somente dados fictícios durante os testes.</p></div></WebContentPanel>;
}
function AccountAction({label,detail,icon,onClick}:{label:string;detail:string;icon:ConnectIconName;onClick:()=>void}){return <button type="button" className="connect-account-action" onClick={onClick}><ConnectIcon name={icon} color="#185C45"/><span><strong>{label}</strong><small>{detail}</small></span><ConnectIcon name="arrow" color="#185C45" size={20}/></button>;}
