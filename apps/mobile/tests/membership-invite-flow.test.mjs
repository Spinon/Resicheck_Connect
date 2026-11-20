import{prepareMembershipInviteManifest}from'../scripts/membership-invite-manifest.mjs';
import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import path from'node:path';import{createRequire}from'node:module';
import React from'react';
import{createMembershipInviteBinding}from'../src/membership-invite-binding.ts';
import{createMembershipSecretLinkCodec,createMembershipSecretLinkClient}from'../../../packages/chat-client/src/membership-secret-link.ts';
import{createTextSessionChannel}from'../../../packages/chat-client/src/text-session-channel.ts';
import{createMembershipSecretLinkFetch}from'../src/membership-secret-link-http.ts';
import{takeWebMembershipInvite,bindNativeMembershipInviteLinks}from'../src/membership-invite-links.ts';
import{nativeMembershipInviteRandom}from'../src/native-membership-invite-random.ts';
const require=createRequire(import.meta.url),ts=require('typescript'),id=n=>'20900000-0000-4000-8000-'+String(n).padStart(12,'0'),co=id(1),user=id(2),invite=id(3),origin='https://connect.resicheck.com.br',token='ab'.repeat(32),tick=()=>new Promise(r=>setImmediate(r));
const codec=createMembershipSecretLinkCodec({origin}),url=codec.encode({kind:'patient',companyId:co,inviteId:invite,token});
const until=async fn=>{for(let n=0;n<40&&!fn();n++)await tick();assert(fn());};
function fixture(signed=true,approved=true,listed=[]){
 const listeners=new Set(),subscribe=fn=>{listeners.add(fn);return()=>listeners.delete(fn);},emit=()=>{for(const fn of[...listeners])fn();};
 let currentUser=signed?user:null,gate=approved,reads=0,reloads=0,shared=0,held=null,randoms=0,roles=['manager','staff'],scopeKey=1;
 const calls=[],lease={userId:user,sessionKey:'synthetic-current-session',membershipLinks:async command=>{calls.push(command);if(held)return held.promise;
 if(command.name==='list_membership_secret_links_v1'){
  const index=command.params.p_before_id===null?0:listed.findIndex(x=>x.inviteId===command.params.p_before_id)+1,items=listed.slice(index,index+25),hasMore=index+25<listed.length,last=items.at(-1);
  return{data:{companyId:co,kind:command.params.p_kind,items,hasMore,nextCursor:hasMore?{issuedAt:last.issuedAt,inviteId:last.inviteId}:null},error:null};
 }
 if(command.name.startsWith('revoke')){const row=listed.find(x=>x.inviteId===command.params.p_invite);if(row){row.state='revoked';row.canRevoke=false;return{data:{inviteId:row.inviteId,companyId:co,kind:row.kind,state:'revoked',expiresAt:row.expiresAt},error:null};}}
 if(command.name.startsWith('accept'))return{data:{inviteId:invite,companyId:co,kind:command.params.p_kind,state:'active',conversationId:command.params.p_kind==='patient'?id(4):null},error:null};return{data:{inviteId:invite,companyId:co,kind:command.params.p_kind,state:command.name.startsWith('revoke')?'revoked':'ready',expiresAt:'2026-11-25T00:00:00Z'},error:null};},membershipLinkCompany:async()=>{reads++;return[{id:co,name:'Empresa pública sintética',address:'Rua fictícia',phone:''}];}};
 const members=()=>roles.map(role=>({companyId:co,name:'Empresa pública sintética',address:'',phone:'',role,state:'active',conversationId:null}));
 const app={auth:{snapshot:()=>({status:currentUser?'authenticated':'signed-out',userId:currentUser,companyId:null}),currentLease:()=>currentUser?lease:null,subscribe},gate:{matches:l=>gate&&l===lease,subscribe},members:{snapshot:()=>({stage:'ready',busy:false,scopeKey,members:members()}),subscribe,reload:async()=>{reloads++;return true;}},registration:{snapshot:()=>({profile:{kind:'profile',name:'Pessoa de teste'}})}};
 const host=createMembershipInviteBinding({app,options:{protocol:'secret-v1',origin,randomFill:b=>{randoms++;b.fill(0xab);},share:async()=>{shared++;}},createId:()=>invite,now:()=>Date.parse('2026-11-18T00:00:00Z')});
 return{host,app,calls,lease,members,randoms:()=>randoms,unhold:()=>{held=null;},reads:()=>reads,shared:()=>shared,reloads:()=>reloads,login:()=>{currentUser=user;emit();},approve:()=>{gate=true;emit();},logout:()=>{currentUser=null;emit();},setRoles:r=>{roles=r;scopeKey++;emit();},hold:()=>{let resolve;const promise=new Promise(r=>resolve=r);held={promise,resolve};return held;},close:()=>host.close()};
}
function renderer(){
 let cursor=0,changed=false;const slots=[],effectDeps=[],effects=[];
 const hooks={...React,useState:init=>{const n=cursor++;if(!(n in slots))slots[n]=typeof init==='function'?init():init;return[slots[n],v=>{const next=typeof v==='function'?v(slots[n]):v;if(!Object.is(slots[n],next)){slots[n]=next;changed=true;}}];},useSyncExternalStore:(_sub,get)=>get(),useEffect:(fn,deps)=>{const n=cursor++,old=effectDeps[n];if(!old||deps.length!==old.length||deps.some((v,i)=>!Object.is(v,old[i]))){effectDeps[n]=deps;effects.push(fn);}}};
 const rn={View:'View',Text:'Text',TextInput:'TextInput',Pressable:'Pressable',ScrollView:'ScrollView',StyleSheet:{create:v=>v}};
 function load(file){const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,m={exports:{}};new Function('require','module','exports',code)(name=>{
  if(name==='react')return hooks;if(name==='react-native')return rn;if(name==='react/jsx-runtime')return require(name);
  if(name.includes('ConnectedSettingsView'))return{ConnectedAppBar:({title,onBack})=>React.createElement('View',null,title,onBack&&React.createElement('Pressable',{accessibilityLabel:'Voltar',onPress:onBack}))};
  if(name.includes('ConnectIcon'))return{ConnectIcon:()=>null};
  if(name.includes('AudioControls'))return{AudioBusy:({label})=>React.createElement('Text',null,label)};
  throw Error('Unexpected fixture import '+name);
 },m,m.exports);return m.exports;}
 const ui=load('apps/mobile/src/MembershipInviteSurface.tsx'),company=load('apps/mobile/src/ConnectedCompanyView.tsx');
 function render(element){for(let pass=0;pass<8;pass++){cursor=0;changed=false;const buttons=new Map(),inputs=new Map(),texts=[];function walk(node){if(node===null||node===undefined||typeof node==='boolean')return;if(Array.isArray(node)){node.forEach(walk);return;}if(typeof node==='string'||typeof node==='number'){texts.push(String(node));return;}if(typeof node.type==='function'){walk(node.type(node.props));return;}if(node.type==='Pressable'&&!node.props.disabled)buttons.set(node.props.accessibilityLabel,node.props.onPress);if(node.type==='TextInput')inputs.set(node.props.accessibilityLabel,node.props);walk(node.props.children);}walk(element);for(const effect of effects.splice(0))effect();if(!changed)return{buttons,inputs,text:texts.join(' ')};}throw Error('Fixture render did not settle');}
 return{retainedState:()=>slots.slice(),invite:(host,allowEntry=true)=>render(React.createElement(ui.MembershipInviteSurface,{host,allowEntry},React.createElement('Text',null,'NORMAL-CONTENT'))),company:(f)=>render(React.createElement(company.ConnectedCompanyView,{members:f.members(),onBack(){},onChat(){},onInbox(){},onTeam(){},onInviteStaff:()=>f.host.openIssuer(co,'staff'),onInviteClient:()=>f.host.openIssuer(co,'patient'),onManageStaffInvites:()=>f.host.openManagement(co,'staff'),onManageClientInvites:()=>f.host.openManagement(co,'patient')}))};
}
test('invite surface clears pasted secret and prior revocation confirmation when the flow pauses',async()=>{
 const f=fixture(),r=renderer();try{
  f.host.openEntry();let screen=r.invite(f.host);screen.inputs.get('Link do convite').onChangeText(url);screen=r.invite(f.host);assert.equal(screen.inputs.get('Link do convite').value,url);
  f.host.suspend();f.host.resume();f.host.openEntry();screen=r.invite(f.host);assert.equal(screen.inputs.get('Link do convite').value,'','Batched pause/resume must not retain an earlier bearer secret');screen.inputs.get('Link do convite').onChangeText(url);r.invite(f.host);
  f.host.suspend();r.invite(f.host);assert(!JSON.stringify(r.retainedState()).includes(token),'A paused surface must release the pasted bearer secret');
  f.host.resume();assert(f.host.openIssuer(co,'staff'));screen=r.invite(f.host);screen.buttons.get('Criar link secreto')();await until(()=>f.host.snapshot().stage==='ready');screen=r.invite(f.host);screen.buttons.get('Revogar link')();screen=r.invite(f.host);assert([...screen.buttons.keys()].some(x=>x.startsWith('Confirmar revoga')));
  f.host.suspend();r.invite(f.host);f.host.resume();assert(f.host.openIssuer(co,'staff'));screen=r.invite(f.host);screen.buttons.get('Criar link secreto')();await until(()=>f.host.snapshot().stage==='ready');screen=r.invite(f.host);assert(screen.buttons.has('Revogar link'));assert(![...screen.buttons.keys()].some(x=>x.startsWith('Confirmar revoga')));assert.equal(f.calls.filter(x=>x.name==='revoke_membership_secret_link_v1').length,0);
 }finally{f.close();}
});
test('normal company controls and candidate surface issue, share and revoke inline; default surface adds no controls',async()=>{
 const f=fixture(),r=renderer();try{
  assert.equal(r.invite(null).buttons.size,0);
  let screen=r.company(f);assert(screen.buttons.has('Convidar funcionário'));assert(screen.buttons.has('Convidar cliente'));
  screen.buttons.get('Convidar cliente')();screen=r.invite(f.host);assert(screen.text.includes('Sua conta: Pessoa de teste'));screen.buttons.get('Criar link secreto')();
  await until(()=>f.host.snapshot().stage==='ready');assert.equal(f.calls.length,1);assert.equal(f.calls[0].params.p_ttl_seconds,604800);
  assert(!JSON.stringify(f.host.snapshot()).includes(token));screen=r.invite(f.host);screen.buttons.get('Compartilhar link')();await until(()=>f.shared()===1);
  screen=r.invite(f.host);screen.buttons.get('Revogar link')();assert.equal(f.calls.length,1);screen=r.invite(f.host);assert(screen.text.includes('Não remove um vínculo'));
  screen.buttons.get('Confirmar revogação')();await until(()=>f.host.snapshot().stage==='revoked');assert.equal(f.calls[1].name,'revoke_membership_secret_link_v1');
 }finally{f.close();}
});
test('receiver waits for login/profile, reads company from the lease, and accepts only after explicit UI confirmation',async()=>{
 const f=fixture(false,false),r=renderer();try{
  assert(f.host.openUrl(url));assert.equal(f.host.snapshot().stage,'waiting-login');assert.equal(f.reads(),0);
  f.login();assert.equal(f.host.snapshot().stage,'waiting-profile');assert.equal(f.reads(),0);
  f.approve();await until(()=>f.host.snapshot().stage==='review');assert.equal(f.calls.length,0);
  const screen=r.invite(f.host);assert(screen.text.includes('Empresa pública sintética'));assert(screen.text.includes('O link será validado ao confirmar.'));
  screen.buttons.get('Aceitar como cliente')();await until(()=>f.host.snapshot().stage==='accepted');
  assert.equal(f.calls.length,1);assert.equal(f.calls[0].params.p_expected_company,co);assert(await f.host.complete());assert.equal(f.reloads(),1);
 }finally{f.close();}
});
test('role/context loss retires pending issuance and the UI never displays or shares the late secret',async()=>{
 const f=fixture(),r=renderer();try{
  f.setRoles(['patient']);assert.equal(f.host.openIssuer(co,'staff'),false);assert.equal(f.host.openIssuer(co,'patient'),false);assert.equal(f.calls.length,0);
  f.setRoles(['manager']);assert(f.host.openIssuer(co,'staff'));const held=f.hold(),pending=f.host.issue();await tick();f.logout();
  held.resolve({data:{inviteId:invite,companyId:co,kind:'staff',state:'ready',expiresAt:'2026-11-25T00:00:00Z'},error:null});
  assert.equal(await pending,false);assert.equal(f.host.snapshot().stage,'paused');assert(!r.invite(f.host).text.includes(token));assert.equal(await f.host.share(),false);
 }finally{f.close();}
});
test('candidate RPC/GET use the verified lease and exact HTTP admission; OFF exposes neither capability nor calls',async()=>{
 const api='https://ibdlvlwdzmsrbqadrudb.supabase.co',key='sb_publishable_synthetic_only',calls=[];
 const raw=async(input,init)=>{calls.push({path:String(input),init});if(String(input).endsWith('/auth/v1/user'))return Response.json({id:user,role:'authenticated'});if(String(input).includes('/companies?'))return Response.json([{id:co,name:'Synthetic',address:'',phone:''}]);return Response.json({inviteId:invite,companyId:co,kind:'patient',state:'ready',expiresAt:'2026-11-25T00:00:00Z'});};
 const schedule=()=>()=>{},input={userId:user,sessionKey:'synthetic-bound',accessToken:'synthetic-invite-token',expiresAt:5000},signal=()=>new AbortController().signal;
 const off=createTextSessionChannel({projectUrl:api,publishableKey:key,fetch:createMembershipSecretLinkFetch(raw,key,raw),now:()=>1000,schedule,timeoutMs:100});
 const a=await off.bindSession(input);assert(a.ok);assert.equal(a.value.membershipLinks,undefined);assert.equal(a.value.membershipLinkCompany,undefined);off.signOut();
 const channel=createTextSessionChannel({projectUrl:api,publishableKey:key,fetch:createMembershipSecretLinkFetch(raw,key,raw,true),now:()=>1000,schedule,timeoutMs:100,enableMembershipLinks:true});
 try{const b=await channel.bindSession(input);assert(b.ok);const lease=b.value,command={name:'issue_membership_secret_link_v1',params:{p_request:invite,p_company:co,p_kind:'patient',p_token:token,p_ttl_seconds:604800}};
  const before=calls.length;await lease.membershipLinks({...command,params:{...command.params,p_user:user}},signal());assert.equal(calls.length,before);
  const reply=await lease.membershipLinks(command,signal());assert.equal(reply.error,null);const company=await lease.membershipLinkCompany(co,signal());assert.equal(company[0].id,co);
  for(const c of calls.slice(before)){assert.equal(new Headers(c.init.headers).get('authorization'),'Bearer synthetic-invite-token');assert.equal(c.init.referrerPolicy,'no-referrer');}
  const count=calls.length;channel.signOut();assert((await lease.membershipLinks(command,signal())).error);assert.equal(calls.length,count);
 }finally{channel.signOut();}
});
test('web intake scrubs the fragment and native intake drops wrong/late events without exposing a secret in state',async()=>{
 let replaced=null;assert.equal(takeWebMembershipInvite({location:{href:url},history:{replaceState:(_a,_b,value)=>{replaced=value;}}},origin),url);assert.equal(replaced,'/');
 let listener,resolve,removed=false;const received=[],port={getInitialURL:()=>new Promise(r=>{resolve=r;}),addEventListener:(_event,fn)=>{listener=fn;return{remove(){removed=true;}};}};
 const stop=bindNativeMembershipInviteLinks(port,origin,value=>received.push(value));listener({url:url.replace('https:','http:')});assert.equal(received.length,0);listener({url});assert.equal(received.length,1);stop();resolve(url);await tick();assert(removed);assert.equal(received.length,1);
});
test('async native random adapter blocks overlapping issue and late completion after close cannot send a request',async()=>{
 let release,calls=0;const context={userId:user,sessionKey:'synthetic',companyId:co},random=nativeMembershipInviteRandom({randomInviteBytes:()=>new Promise(r=>{release=r;})});
 const c=createMembershipSecretLinkClient({context,currentContext:()=>context,origin,randomFill:random,createId:()=>invite,now:()=>0,rpc:async()=>{calls++;return{data:null,error:null};}});
 const pending=c.issue('staff');assert.equal(await c.issue('patient'),false);c.close();release(token);assert.equal(await pending,false);assert.equal(calls,0);
 await assert.rejects(nativeMembershipInviteRandom({randomInviteBytes:async()=>'weak'})(new Uint8Array(32)),/Invitation unavailable/);
});

test('actual web factory keeps invitation option OFF and scrubs a selected candidate link before configuration fetch',async()=>{
 const source=fs.readFileSync('apps/mobile/App.web.tsx','utf8'),code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
 for(const mode of[undefined,'candidate-secret-v1']){
  const events=[],effects=[],cleanup=[],timers=new Set(),react={...React,useState:v=>[typeof v==='function'?v():v,()=>{}],useEffect:f=>effects.push(f)},m={exports:{}};let options;
  const app={recent:{},auth:{},invites:{openUrl:()=>events.push('open')},suspend(){},resume(){},dispose:async()=>{}},media={tick(){},dispose(){},foregroundChanged(){},permissionGuard:{retainDomain:()=>false,subscribe:()=>()=>{}}};
  const before={fetch:globalThis.fetch,window:globalThis.window,document:globalThis.document};
  const fakeWindow={location:{get href(){if(!mode)assert.fail('OFF must not read link');return url;}},history:{replaceState(){events.push('scrub');}}};
  try{
   globalThis.window=fakeWindow;globalThis.document={title:'',visibilityState:'visible',hasFocus:()=>true};globalThis.fetch=async()=>{events.push('fetch');return{ok:true,json:async()=>({synthetic:true})};};
   const load=name=>{
    if(name==='react')return react;if(name==='react/jsx-runtime')return require(name);if(name==='react-native')return{StyleSheet:{create:v=>v}};
    if(name.includes('membership-invite-links'))return{takeWebMembershipInvite};
    if(name.includes('connected-membership-management'))return{connectedMembershipManagementConfig:v=>v};
    if(name.includes('connected-company-registry'))return{createConnectedCompanyRegistry:v=>{options=v;return app;}};
    if(name.includes('web-conversation-cache'))return{webConversationCache:()=>null};
    if(name.includes('connected-navigation'))return{createConnectedNavigation:()=>({dispose(){}})};
    if(name.includes('web-recording-host'))return{createWebRecordingHost:()=>media};
    if(name.includes('browser-lifecycle'))return{bindBrowserLifecycle:opts=>{events.push('bound');return{isCovered:()=>false,dispose:()=>opts.app.dispose()};}};
    return{};
   };
   new Function('require','module','exports','setInterval','clearInterval',code)(load,m,m.exports,()=>{const t={};timers.add(t);return t;},t=>timers.delete(t));
   m.exports.createConnectWebRoot(undefined,undefined,undefined,undefined,mode)();for(const f of effects)cleanup.push(f());await tick();
   assert.deepEqual(events,mode?['scrub','fetch','open','bound']:['fetch','bound']);assert.equal(options.membershipLinks?.protocol,mode?'secret-v1':undefined);
  }finally{for(const close of cleanup)close?.();Object.assign(globalThis,before);}
  assert.equal(timers.size,0);
 }
});

const metadata=(n=27)=>Array.from({length:n},(_,i)=>({inviteId:id(100+i),companyId:co,kind:'patient',issuedAt:'2026-11-18T00:00:00.'+String(n-i).padStart(6,'0')+'+00:00',expiresAt:'2026-11-25T00:00:00Z',state:'ready',canRevoke:true}));
test('management reloads server metadata in a new binding, paginates and revokes without any token or random generation',async()=>{
 const ledger=metadata(),one=fixture(true,true,ledger),r=renderer();
 r.company(one).buttons.get('Convites de clientes')();await until(()=>one.host.snapshot().stage==='management');
 assert.equal(one.host.snapshot().items.length,25);assert.equal(one.randoms(),0);one.close();assert.equal(one.host.snapshot().items.length,0);
 const two=fixture(true,true,ledger);try{
  assert(two.host.openManagement(co,'patient'));await until(()=>two.host.snapshot().stage==='management');assert.equal(two.host.snapshot().items.length,25);
  await two.host.olderManagement();assert.equal(two.host.snapshot().items.length,2);assert.equal(two.host.snapshot().nextCursor,null);
  await two.host.refreshManagement();let screen=r.invite(two.host);screen.buttons.get('Revogar convite 1')();screen=r.invite(two.host);screen.buttons.get('Confirmar revogação do convite 1')();
  await until(()=>two.host.snapshot().items[0].state==='revoked');assert.equal(two.randoms(),0);assert(two.calls.every(c=>!Object.hasOwn(c.params,'p_token')));
 }finally{two.close();}
 const three=fixture(true,true,ledger);try{three.host.openManagement(co,'patient');await until(()=>three.host.snapshot().stage==='management');assert.equal(three.host.snapshot().items[0].state,'revoked');}finally{three.close();}
});
test('management blocks role loss, foreign metadata and blind repeat after uncertain revocation',async()=>{
 const ledger=metadata(1),f=fixture(true,true,ledger),r=renderer();try{
  f.host.openManagement(co,'patient');await until(()=>f.host.snapshot().stage==='management');const held=f.hold(),pending=f.host.revokeManaged(ledger[0].inviteId);
  ledger[0].state='revoked';ledger[0].canRevoke=false;held.resolve({data:null,error:{code:'UNAVAILABLE'}});assert.equal(await pending,false);f.unhold();
  assert.equal(f.host.snapshot().notice,'unconfirmed');assert(!r.invite(f.host).buttons.has('Revogar convite 1'));assert.equal(await f.host.revokeManaged(ledger[0].inviteId),false);
  await f.host.refreshManagement();assert.equal(f.host.snapshot().items[0].state,'revoked');assert.equal(f.calls.filter(c=>c.name.startsWith('revoke')).length,1);
  f.setRoles(['patient']);assert.equal(f.host.snapshot().items.length,0);assert.equal(f.host.openManagement(co,'patient'),false);
 }finally{f.close();}
 const bad=fixture(true,true,[{...metadata(1)[0],companyId:id(999)}]);try{bad.host.openManagement(co,'patient');await until(()=>bad.host.snapshot().stage==='management');assert.equal(bad.host.snapshot().items.length,0);assert.equal(bad.host.snapshot().notice,'operation-failed');}finally{bad.close();}
});
test('management RPC admits a bounded full metadata page larger than old mutation replies',async()=>{
 const api='https://ibdlvlwdzmsrbqadrudb.supabase.co',key='sb_publishable_synthetic_only',rows=metadata(25);let posts=0;
 const raw=async(input,init)=>{if(String(input).endsWith('/auth/v1/user'))return Response.json({id:user,role:'authenticated'});posts++;assert(String(input).endsWith('/rpc/list_membership_secret_links_v1'));return Response.json({companyId:co,kind:'patient',items:rows,hasMore:false,nextCursor:null});};
 assert(JSON.stringify(rows).length>4096);
 const channel=createTextSessionChannel({projectUrl:api,publishableKey:key,fetch:createMembershipSecretLinkFetch(raw,key,raw,true),now:()=>1000,schedule:()=>()=>{},timeoutMs:100,enableMembershipLinks:true});
 try{const result=await channel.bindSession({userId:user,sessionKey:'synthetic-metadata',accessToken:'synthetic-token',expiresAt:5000});assert(result.ok);
  const reply=await result.value.membershipLinks({name:'list_membership_secret_links_v1',params:{p_company:co,p_kind:'patient',p_before_issued:null,p_before_id:null}},new AbortController().signal);
  assert.equal(reply.error,null);assert.equal(reply.data.items.length,25);assert.equal(posts,1);
 }finally{channel.signOut();}
});
test('Android manifest candidate is HTTPS-only, retains privacy flags and returns the original bytes when OFF',()=>{
 const source=fs.readFileSync('apps/mobile/candidates/connected-basic-text/AndroidManifest.xml','utf8');
 assert.equal(prepareMembershipInviteManifest(source),source);
 const prepared=prepareMembershipInviteManifest(source,true);assert(prepared.includes('android:autoVerify="true"'));assert(prepared.includes('android:scheme="https" android:host="connect.resicheck.com.br" android:pathPrefix="/v1/membership-invites/"'));
 assert.equal((prepared.match(/android.intent.action.MAIN/g)||[]).length,1);assert(prepared.includes('android:allowBackup="false"'));assert(!prepared.includes('android:scheme="http"'));
 assert.throws(()=>prepareMembershipInviteManifest(prepared,true));assert.throws(()=>prepareMembershipInviteManifest(source.replace('PrivacyActivity','OtherActivity'),true));
});
test('duplicate invite intents do not restart metadata lookup or interrupt an explicit pending acceptance',async()=>{
 const f=fixture();try{
  f.host.openUrl(url);f.host.openUrl(url);await until(()=>f.host.snapshot().stage==='review');assert.equal(f.reads(),1);
  const held=f.hold(),accept=f.host.accept();assert.equal(f.host.snapshot().stage,'busy');f.host.openUrl(url);
  held.resolve({data:{inviteId:invite,companyId:co,kind:'patient',state:'active',conversationId:id(4)},error:null});
  assert(await accept);assert.equal(f.calls.length,1);assert.equal(f.host.snapshot().stage,'accepted');
 }finally{f.close();}
});
